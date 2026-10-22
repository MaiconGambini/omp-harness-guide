// harness-quality-gate — the measured gate: policy, verdict, report.
//
// Tool knowledge lives in harness-quality-adapters.mjs; shared primitives and the injectable
// git port live in harness-quality-core.mjs. What is left here is the part that decides:
// evaluate a reading against a threshold, guard the config against silent loosening, apply
// the bug-fix/regression rule, write the report.
//
// The gate READS coverage/mutation artifacts and RUNS only fast static tools plus the
// declared regression/e2e selectors. It does not run the project's whole test suite — the
// implementation lane already did, and doing it twice would double every parallel run.
//
// Exit codes: 0 pass/observe · 1 a blocking metric is red or unavailable, or the config guard failed · 2 the
// gate itself could not run. Never conflate 1 and 2 — a broken gate is not failing code.
//
// See docs/harness/measured-gates.md.

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { collectReadings, collectReadingsAsync, hasRecallAnnotation, toolVersion } from "./harness-quality-adapters.mjs"
import { computeCoverageLabel } from "./harness-coverage-label.mjs"
// The GLOBAL findings module, imported by module path — the deterministic validator
// (review B12, T02 S2) is the code owner for learned_rules ranges; this module is the
// named owner of the GATE-path read-time check. Same import shape the adherence adapter
// uses, never a project-local copy.
import { validateLearnedRules } from "./harness-findings.mjs"
import { emitTraceEvent, loadTraceIdentity, safeTraceId } from "./harness-ship-evidence.mjs"
import {
  assessEvidenceDrift,
  baselineRegressions,
  checkReportShape,
  collectPreviousBars,
  configFingerprint,
  createEvidenceEnvelope,
  DECISIONS_PATH,
  fingerprintChanges,
  fingerprintHash,
  loosenings,
  makeGit,
  readJsonIfExists,
  readTextIfExists,
  redact,
  REPORT_DIR,
  sanitizeLabel,
  sourceHash,
  THRESHOLDS_PATH,
} from "./harness-quality-core.mjs"
import { pathExists } from "./harness-common.mjs"

export const STATUS = {
  PASS: "pass",
  FAIL: "fail",
  OBSERVE: "observe",
  // Three flavours of "no number", because they mean different things and one of them
  // used to poison every routing decision (see the adapter contract in
  // harness-quality-adapters.mjs):
  //   UNAVAILABLE     — should have measured and did not. Fail-closed, escalates.
  //   NOT_CONFIGURED  — no instrument was ever wired up in this project. Named, counted,
  //                     does NOT escalate: escalating on it escalates forever.
  //   NOT_APPLICABLE  — the control does not apply to this project or this diff.
  UNAVAILABLE: "unavailable",
  NOT_CONFIGURED: "not_configured",
  NOT_APPLICABLE: "not_applicable",
}

// The statuses that mean "there is no measurement here", in any flavour.
export const UNMEASURED_STATUSES = [STATUS.UNAVAILABLE, STATUS.NOT_CONFIGURED, STATUS.NOT_APPLICABLE]
export const isUnmeasured = (status) => UNMEASURED_STATUSES.includes(status)

const UNMEASURED_KINDS = {
  not_configured: STATUS.NOT_CONFIGURED,
  not_applicable: STATUS.NOT_APPLICABLE,
  unavailable: STATUS.UNAVAILABLE,
}

/**
 * Maps an adapter's `kind` onto a row status. An absent or unrecognised kind is
 * UNAVAILABLE on purpose: a new adapter that forgets to classify itself must be treated
 * as a real gap, never quietly excused.
 */
export function unmeasuredStatus(kind) {
  return UNMEASURED_KINDS[kind] ?? STATUS.UNAVAILABLE
}

export function detectStack(root) {
  const has = (relative) => pathExists(path.join(root, relative))
  return {
    js: has("package.json"),
    python: has("pyproject.toml") || has("requirements.txt") || has("setup.cfg"),
    ruby: has("Gemfile"),
    go: has("go.mod"),
  }
}

export { computeCoverageLabel }

// ---------------------------------------------------------------------------
// learned_rules read-time validation (security M4, review B12, T02 S2)
//
// The gate path validates the learned_rules feature's knobs at READ time, through the
// deterministic validator harness-findings.mjs exports. The distinction that matters:
// a repo with NO feature installed (no `learned_rules` block in the thresholds file)
// is untouched, but a thresholds file that PARTIALLY declares the feature is not the
// same thing — an installed feature missing a gate-consumed knob, carrying an
// out-of-range knob, or inventing an unknown knob is a harness blocker (exit 2), never
// a silent fallback to a default. `stage1_window_runs` and
// `enforced_fraction_min_runs` are the only knobs the gate path reads at runtime; the
// range/type/unknown-knob checks for every knob come from the exported validator, so a
// knob added later cannot widen past its range row here (T02 S2).
const GATE_CONSUMED_KNOBS = ["stage1_window_runs", "enforced_fraction_min_runs"]

export function validateLearnedRulesKnobs(thresholds) {
  const knobs = thresholds?.learned_rules
  // Same "feature not installed" semantics as the findings CLI's own read-time check:
  // null, undefined or a non-object means there is no learned_rules feature to validate.
  if (knobs === null || knobs === undefined || typeof knobs !== "object") {
    return { ok: true, installed: false, errors: [] }
  }
  const errors = []
  for (const key of GATE_CONSUMED_KNOBS) {
    if (knobs[key] === undefined) {
      errors.push(
        `learned_rules.${key} is missing while the learned_rules feature is installed — a partially-declared feature must not run on defaults; add the knob or remove the block`,
      )
    }
  }
  const validated = validateLearnedRules(knobs)
  errors.push(...validated.errors)
  return { ok: errors.length === 0, installed: true, errors }
}

// ---------------------------------------------------------------------------
// evaluation

export function evaluate(metricName, config, reading, mode) {
  if (config.speed === "full" && mode !== "full") {
    return { metric: metricName, status: "skipped", reason: `full-mode metric, ran at --mode ${mode}` }
  }
  if (!reading || reading.unavailable) {
    // No reading at all means no adapter ran — that is a real gap, not a configuration
    // choice, so it stays UNAVAILABLE.
    const status = reading ? unmeasuredStatus(reading.kind) : STATUS.UNAVAILABLE
    return { metric: metricName, mode: config.mode, status, reason: reading?.unavailable ?? "no adapter" }
  }

  const bar = ratchetBar(config)
  const passed = config.direction === "min" ? reading.value >= bar : reading.value <= bar

  return {
    metric: metricName,
    value: reading.value,
    threshold: bar,
    declaredThreshold: config.threshold,
    ratchet: Boolean(config.ratchet),
    direction: config.direction,
    mode: config.mode,
    detail: reading.detail ? redact(reading.detail) : null,
    status: passed ? STATUS.PASS : config.mode === "blocking" ? STATUS.FAIL : STATUS.OBSERVE,
  }
}

// The bar for a ratchet metric is the STRICTER of threshold and baseline. Using the baseline
// unconditionally silently ignored a deliberately tightened threshold — and tightening is
// exactly what the Phase-C write-back instructs, so it broke the first time the ratchet
// worked as designed.
export function ratchetBar(config) {
  const hasBaseline = config.ratchet && config.baseline !== null && config.baseline !== undefined
  if (!hasBaseline) return config.threshold
  return config.direction === "min" ? Math.max(config.threshold, config.baseline) : Math.min(config.threshold, config.baseline)
}

// Only a PASSING row may seed or move a baseline. Excluding just FAIL was not enough: an
// `observe` breach returns OBSERVE, so a failing value was recorded anyway — and for a ratchet
// metric the first such run seeded the bar with the number you were trying to beat.
//
// Deliberate departure from a review suggestion: baselines ARE written for non-ratchet metrics
// too, because Phase A exists to collect them and `harness-project-calibration` reads them to
// propose thresholds. The cost is churn in an audited file; the benefit is that calibration has
// data at all.
export function nextBaseline(config, row) {
  if (!row || row.value === undefined) return config.baseline ?? null
  if (row.status !== STATUS.PASS) return config.baseline ?? null
  const current = config.baseline
  if (!config.ratchet) return row.value
  if (current === null || current === undefined) return row.value
  return config.direction === "min" ? Math.max(current, row.value) : Math.min(current, row.value)
}

// ---------------------------------------------------------------------------
// the config guard
//
// Guards the WHOLE configuration, not `metrics.*.threshold`. Guarding one field left the gate
// defeatable by a one-line edit needing no recorded decision: point
// `suites.regression.command` at `exit 0`, delete `"mode": "blocking"`, flip a `direction`, or
// delete a metric key so its row vanishes entirely.

export function guardThresholds({ git, base, thresholds, root, decisionsText, previousBars }) {
  // The prior bar is the STRICTEST candidate across independent sources — the committed thresholds
  // file at HEAD (a git object) and any gate reports. Trusting a single report was a cheaper forgery
  // than forging the current one: `docs/harness/quality/` is excluded from the source hash, so a
  // planted JSON naming a low bar cost nothing and defeated this check. Now a looser candidate
  // simply never wins.
  const baselineIssues = baselineRegressions(thresholds, previousBars)

  if (!base) {
    if (baselineIssues.length === 0) return { ok: true, note: "not a git repo — config guard skipped" }
    return { ok: false, changes: baselineIssues, note: `not a git repo, but ${describe(baselineIssues)}` }
  }

  const previousText = git.showAtBase(base, THRESHOLDS_PATH)
  let before = null
  if (previousText !== null) {
    try {
      before = JSON.parse(previousText)
    } catch {
      before = null
    }
  }

  // If the file cannot be read at the base, the fingerprint comparison is not weakened — it is
  // absent. Returning ok:true there let an operator-chosen `--since` predating the thresholds file
  // wave through ANY loosening with the note "nothing to compare". Only a genuinely fresh install
  // (the file is untracked at HEAD too) is allowed to skip the comparison.
  if (!before) {
    const relative = THRESHOLDS_PATH.replace(/\\/g, "/")
    // Judged against committed HISTORY, not the index: `git rm --cached` would otherwise untrack the
    // file while leaving the loosened JSON on disk, and the guard would call that a fresh install and
    // skip the comparison. Committing the removal is a visible deletion of a high-risk path.
    //
    // KNOWN LIMIT, not closed: an orphan branch or a rewritten history (`checkout --orphan`, a fresh
    // root commit) produces a HEAD with no thresholds file and no ancestry to diff against, so this
    // check reads it as a fresh install. Any HEAD-relative guard has that limit — detecting it needs
    // a trusted ref outside the branch. Recorded in docs/harness/v1.2-context.md rather than papered
    // over.
    const freshInstall = !git.existsAtHead(relative)
    const why = previousText === null ? "absent at the comparison base" : "not parseable at the comparison base"
    if (!freshInstall) {
      return {
        ok: false,
        changes: baselineIssues,
        note:
          `thresholds file is ${why} but exists at HEAD — the config guard cannot verify this change. ` +
          `Compare against a base that contains the file (the default is the merge-base with the default branch); ` +
          `a --since that predates it, or untracking the file, disables the guard.`,
      }
    }
    if (baselineIssues.length === 0) return { ok: true, note: `thresholds file is new to this repo (${why}) — nothing to compare` }
  }

  const configChanges = before ? fingerprintChanges(configFingerprint(before), configFingerprint(thresholds)) : []
  const changes = [...configChanges, ...baselineIssues]
  if (changes.length === 0) return { ok: true }

  const loosened = loosenings(changes)
  if (loosened.length === 0) {
    return { ok: true, note: `${changes.length} config change(s), all tightening: ${changes.map((change) => change.key).join(", ")}` }
  }

  // The change is read from the working tree, so the justification must be too. Reading only
  // committed history made the escape hatch unusable: loosening and recording the reason in one
  // uncommitted edit failed with "no new entry".
  const relative = DECISIONS_PATH.replace(/\\/g, "/")
  const committed = git.text(["diff", `${base}...HEAD`, "--", relative])
  const working = git.text(["diff", "HEAD", "--", relative])
  const untrackedText = git.isTracked(relative) ? "" : (decisionsText ?? readTextIfExists(path.join(root, DECISIONS_PATH)))
  const justified = /^\+\s*-\s/m.test(committed) || /^\+\s*-\s/m.test(working) || /^\s*-\s+\d{4}-\d{2}-\d{2}/m.test(untrackedText)

  if (justified) {
    return { ok: true, note: `${loosened.length} loosening change(s) with a recorded decision` }
  }

  return {
    ok: false,
    changes: loosened,
    note: `config loosened with no new entry in ${DECISIONS_PATH}: ${describe(loosened)}`,
  }
}

function describe(changes) {
  return changes.map((change) => change.detail).join(" · ")
}

// Report shape check, shared with the router via core. A report reaching the baseline guard is a
// *candidate* bar, never the authority — see `collectPreviousBars`.
export function isTrustworthyReport(report) {
  return checkReportShape(report).credible
}

export function reportCandidates(root) {
  const dir = path.join(root, REPORT_DIR)
  if (!pathExists(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJsonIfExists(path.join(dir, name)))
    .filter((report) => isTrustworthyReport(report))
}

// Prior bars, gathered from the committed thresholds file at HEAD and from every plausible report.
// The strictest candidate wins, so a planted report cannot lower the bar — it can only fail to
// raise it.
export function gatherPreviousBars(root, git) {
  const headText = git?.existsAtHead?.(THRESHOLDS_PATH.replace(/\\/g, "/")) ? git.showAtBase("HEAD", THRESHOLDS_PATH) : null
  let headThresholds = null
  if (headText) {
    try {
      headThresholds = JSON.parse(headText)
    } catch {
      headThresholds = null
    }
  }
  return collectPreviousBars({ headThresholds, reports: reportCandidates(root) })
}

// ---------------------------------------------------------------------------
// the bug-fix / regression rule — the one heuristic in the gate

export function looksLikeBugFix(text) {
  return /\b(fix|fixes|fixed|bug|hotfix|patch|regression|defect|issue)\b/i.test(String(text ?? ""))
}

export function regressionTestRule({ git, base, suites }) {
  if (!base) return null

  const signal = looksLikeBugFix(git.logSubjects(base)) || looksLikeBugFix(git.branch())
  if (!signal) return null

  // Added or modified only: a deleted or merely-touched test file is not a new regression test.
  // Untracked files count — a new test that isn't `git add`ed yet is still a test, and treating
  // it as absent refused the commit trailer for work that did everything right.
  const changed = [...new Set([...git.addedOrModifiedSince(base), ...git.addedOrModifiedInWorktree(), ...git.untracked()])]
  const regressionPaths = suites?.regression?.paths ?? []
  const isTestFile = (file) =>
    /(^|[\\/])(tests?|spec|__tests__)[\\/]/.test(file) || /\.(test|spec)\.[a-z]+$/i.test(file) || /_test\.[a-z]+$/i.test(file)
  const inRegressionPaths = (file) => regressionPaths.some((prefix) => file.replace(/\\/g, "/").startsWith(prefix))

  const found = changed.filter((file) => (regressionPaths.length ? inRegressionPaths(file) : isTestFile(file)))
  if (found.length > 0) return null

  const where = regressionPaths.length ? `suites.regression.paths (${regressionPaths.join(", ")})` : "the detected test directories"
  return {
    fired: true,
    reason:
      `the change looks like a bug fix (matched "fix|bug|regression" in the branch name or commit messages) and no test file ` +
      `was added or modified under ${where}. A bug fix without a regression test is not a fix. If this is a false positive, ` +
      `declare suites.regression.paths or say so in the PR body.`,
  }
}

// ---------------------------------------------------------------------------
// --check-sources (invariant 13: no threshold in prose)

// A line count is only a *code* threshold when it has a code subject. "Target 50-200 lines" in
// harness-root-instructions is about document length and must not fire — that is the
// false-positive class that gets a check disabled.
const PROSE_THRESHOLD_PATTERNS = [
  /\d+\s*%\s*(?:code\s+|line\s+|branch\s+)?coverage/i,
  /\b(?:functions?|methods?|files?|modules?|classes?)\b[^.\n]{0,24}?(?:under|over|max|maximum|below|<=|>=)?\s*\d+(?:\s*[-–]\s*\d+)?\s+lines\b/i,
  /\bcomplexity\s+(?:of|<=|under|below|max(?:imum)?)\s*\d+/i,
]

const SUPPRESSION_MARKER = "prose-threshold-ok"
const CHECK_SOURCES_ROOTS = ["agent", "templates", path.join("docs", "harness")]

export function checkSources(root, { listFiles: list } = {}) {
  const walk = list ?? defaultListFiles
  const findings = []
  const roots = CHECK_SOURCES_ROOTS.map((dir) => path.join(root, dir))
  const skillsDir = path.join(root, "skills")
  if (pathExists(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir)) {
      if (entry.startsWith("harness-")) roots.push(path.join(skillsDir, entry))
    }
  }

  for (const scanRoot of roots) {
    for (const file of walk(scanRoot)) {
      if (file.endsWith("quality-thresholds.json")) continue
      if (file.replace(/\\/g, "/").includes("/docs/harness/quality/")) continue
      // Findings records are reviewer/machine prose written after the gate runs; a summary
      // mentioning a line count is data, not a threshold declaration (invariant 13 would
      // otherwise break on its own outputs — see templates/docs/harness/findings/README.md).
      // refine-log.md is NOT excluded: it is operator-written prose about rules, and a
      // threshold appearing there is a real finding.
      if (file.replace(/\\/g, "/").includes("/docs/harness/findings/")) continue
      readTextIfExists(file)
        .split("\n")
        .forEach((line, index) => {
          if (line.includes(SUPPRESSION_MARKER)) return
          for (const pattern of PROSE_THRESHOLD_PATTERNS) {
            if (pattern.test(line)) {
              findings.push({ file: path.relative(root, file), line: index + 1, text: line.trim().slice(0, 120) })
              break
            }
          }
        })
    }
  }
  return findings
}

function defaultListFiles(scanRoot) {
  if (!pathExists(scanRoot)) return []
  const result = []
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory() && !["node_modules", ".git"].includes(entry.name)) walk(full)
      else if (entry.isFile() && /\.(md|json|jsonc)$/i.test(entry.name)) result.push(full)
    }
  }
  walk(scanRoot)
  return result
}

// ---------------------------------------------------------------------------
// --check-rulebook (invariant 13 applied to the learned rulebook)
//
// A separate exported function behind its own flag with its own exit semantics,
// because checkSources has no channel for a non-failing report (review M8):
// hand-written standards prose predating the ledger is orphan by construction,
// so folding this into the existing check would turn every verify row red on
// day one. templates/agent-os/standards/** is excluded explicitly — ten
// hand-written files with no ledger ids. In a repo with no ledger the check
// reports `unavailable`, never clean.
//
// Orphan prose: a rule line in agent-os/standards/*.md that carries no id
// traceable to agent-os/learned-rules.json. This bounds the FILE the way
// max_active_rules_per_target bounds the LEDGER (audit F5) — it is what stops
// the ledger and the prose drifting apart.
//
// Document length: standards files must stay within
// learned_rules.standards_file_lines_max in agent-os/quality-thresholds.json
// (per review B12 the limit lives in the guarded file, not the ledger). A
// standards file nobody reads enforces nothing.
//
// Adoption mode: findings are REPORTED, never a gate failure — the gate never
// runs this flag. The adoption path is explicit: give every rule line an id
// that exists in the ledger, and keep files within the configured limit.

const RULEBOOK_LEDGER_PATH = path.join("agent-os", "learned-rules.json")
const RULEBOOK_DIR = path.join("agent-os", "standards")

// A rule line is a list item (bullet or numbered). Headings, tables, code and
// plain paragraphs are not rules and are never flagged, so the hand-written
// prose around rules does not fire.
const RULE_LINE_PATTERN = /^\s*(?:[-*+]\s+|\d+[.)]\s+)/
// The id marker is the adoption contract: `id: vue-002`, `rule-id: vue-002`,
// `**id**: vue-002` or `<!-- id: vue-002 -->` on the same line.
const RULE_ID_PATTERN = /\b(?:rule[-_ ]?id|id)\s*[:=]\s*`?([A-Za-z0-9][A-Za-z0-9._-]{0,63})`?/i

export function checkRulebookSources(root, { listFiles: list } = {}) {
  const walk = list ?? defaultListFiles
  const result = { status: "unavailable", reason: null, limit: null, notes: [], orphan: [], length: [] }

  const ledger = readJsonIfExists(path.join(root, RULEBOOK_LEDGER_PATH))
  if (!ledger) {
    result.reason =
      `no ${RULEBOOK_LEDGER_PATH} — the ledger is not installed, so no rule line can be traced. ` +
      `Expected before stage 1 produces its first rule; a gap to name, not a clean result.`
    return result
  }

  // Retired ids stay traceable: the ledger keeps the record, and the prose may
  // legitimately remain in the standards file until the next rulebook edit.
  const ids = new Set(
    [...(ledger.rules ?? []), ...(ledger.retired ?? [])]
      .map((rule) => rule?.id)
      .filter((id) => typeof id === "string" && id.length > 0),
  )

  const thresholds = readJsonIfExists(path.join(root, THRESHOLDS_PATH))
  const limit = thresholds?.learned_rules?.standards_file_lines_max
  if (typeof limit !== "number" || limit <= 0) {
    result.notes.push(
      `no learned_rules.standards_file_lines_max in ${THRESHOLDS_PATH.replace(/\\/g, "/")} — the document-length half did not run`,
    )
  } else {
    result.limit = limit
  }

  const scanRoot = path.join(root, RULEBOOK_DIR)
  if (!pathExists(scanRoot)) {
    result.reason = `no ${RULEBOOK_DIR.replace(/\\/g, "/")} — there is nothing to scan`
    return result
  }

  for (const file of walk(scanRoot)) {
    const relative = file.replace(/\\/g, "/")
    if (!relative.endsWith(".md")) continue
    // Explicit exclusion, defense in depth: templates hold hand-written standards
    // predating the ledger and every line is orphan by construction (review M8).
    if (relative.includes("/templates/")) continue

    const lines = readTextIfExists(file).split("\n")
    if (result.limit !== null && lines.length > result.limit) {
      result.length.push({ file: path.relative(root, file), lines: lines.length, limit: result.limit })
    }
    lines.forEach((line, index) => {
      if (!RULE_LINE_PATTERN.test(line)) return
      const marker = line.match(RULE_ID_PATTERN)
      if (!marker) {
        result.orphan.push({ file: path.relative(root, file), line: index + 1, text: line.trim().slice(0, 120), reason: "no id marker" })
      } else if (!ids.has(marker[1])) {
        result.orphan.push({
          file: path.relative(root, file),
          line: index + 1,
          text: line.trim().slice(0, 120),
          reason: `id ${marker[1]} not in the ledger`,
        })
      }
    })
  }

  result.status = result.orphan.length + result.length.length ? "findings" : "clean"
  return result
}

// ---------------------------------------------------------------------------
// report rendering

export function renderTable(rows) {
  const header = ["Metric", "Value", "Threshold", "Status"]
  const body = rows.map((row) => {
    if (isUnmeasured(row.status)) return [row.metric, "-", "-", `${row.status} (${row.reason})`]
    if (row.status === "skipped") return [row.metric, "-", "-", `skipped (${row.reason})`]
    // FINAL-R1 (cosmetic): observation rows such as rules_active/rules_retired carry
    // direction null and threshold null — rendering them as "<= null" printed a literal null.
    // No bar means no comparison column.
    const comparison =
      row.threshold === null || row.threshold === undefined
        ? "-"
        : `${row.direction === "min" ? ">=" : "<="} ${row.threshold}${row.ratchet ? " (ratchet)" : ""}`
    const status = row.status === STATUS.FAIL ? "FAIL" : row.status
    // Invariant 20 in the RENDERED report (T07-R1): a violation-count row carries the
    // recall annotation in its detail, and the annotation must be visible even when the
    // row passes — the adapter enforces it, but the old renderer dropped every PASS-row
    // detail, so the printed table hid the floor-not-rate statement exactly when the
    // count was green. Only rows whose detail carries the recall marker are expanded;
    // any other PASS row stays compact (no global detail dump).
    const expandedPass = row.status === STATUS.PASS && hasRecallAnnotation(row)
    return [
      row.metric,
      String(row.value),
      comparison,
      row.detail && (row.status !== STATUS.PASS || expandedPass) ? `${status}  ${row.detail}` : status,
    ]
  })
  const widths = header.map((_, column) => Math.max(header[column].length, ...body.map((line) => line[column].length)))
  const format = (cells) => cells.map((cell, column) => cell.padEnd(widths[column])).join("  ")
  return [format(header), ...body.map(format)].join("\n")
}

function renderMarkdown(report) {
  return [
    `# Quality Gate — ${report.mode}`,
    "",
    `- Date: ${report.timestamp}`,
    `- Verdict: **${report.verdict}** (exit ${report.exitCode})`,
    `- Label: ${report.label}`,
    `- Phase: ${report.phase}`,
    `- Source hash: ${report.sourceHash ?? "unknown"}`,
    ...(report.coverageLabel
      ? [
          `- Measured: ${report.coverageLabel.measured}/${report.coverageLabel.total} metrics`,
          ...(report.coverageLabel.unmeasuredMajority
            ? [`- WARNING: most metrics unmeasured (${report.coverageLabel.measured}/${report.coverageLabel.total}); pass is not evidence of quality`]
            : []),
        ]
      : []),
    `- Config fingerprint: ${report.fingerprint ?? "unknown"}`,
    `- Project commands: ${report.projectCommands ? "enabled" : "disabled (--no-project-commands)"}`,
    "",
    "## Metrics",
    "",
    "```",
    renderTable(report.rows),
    "```",
    "",
    "## Provenance",
    "",
    "Tool versions and whether the environment variables that change a tool's meaning were set.",
    "Values are not recorded — a number from a mis-bootstrapped run looks exactly like a good one,",
    "but the value of an env var can be a credential and this file is committed.",
    "",
    "```json",
    JSON.stringify(report.provenance, null, 2),
    "```",
    ...(report.notes.length ? ["", "## Notes", "", ...report.notes.map((note) => `- ${note}`)] : []),
    "",
  ].join("\n")
}

// ---------------------------------------------------------------------------
// main

export async function runGate(options = {}) {
  const root = path.resolve(options.root ?? process.cwd())
  const mode = options.mode === "full" ? "full" : "local"
  const label = sanitizeLabel(options.label ?? "session")
  const projectCommands = options.projectCommands !== false
  const notes = []

  const thresholds = readJsonIfExists(path.join(root, THRESHOLDS_PATH))
  if (!thresholds) {
    const unconfiguredReport = {
      verdict: "unconfigured",
      exitCode: 0,
      mode,
      label,
      phase: "unconfigured",
      rows: [],
      notes: [
        `no ${THRESHOLDS_PATH} — the gate is unconfigured, so it measured nothing.`,
        "This is NOT a green gate. The risk router treats unconfigured as tier `full` (fail closed).",
        "Run harness-project-calibration, or install the template via /harness-bootstrap.",
      ],
      provenance: {},
      sourceHash: null,
      fingerprint: null,
      projectCommands,
      unconfigured: true,
      coverageLabel: computeCoverageLabel({ total: 0, measured: 0, notApplicable: 0 }),
    }
    unconfiguredReport.evidenceEnvelope = createEvidenceEnvelope(root, {
      git: options.git ?? makeGit(root),
      thresholds: null,
      report: unconfiguredReport,
    })
    return unconfiguredReport
  }

  // Security M4: validate the learned_rules feature at read time, BEFORE anything can
  // fall back to a default. Throwing is the existing exit-2 channel (runCli catches it
  // as "the gate itself could not run") — a broken config is a harness blocker, never
  // failing code, and never a silent default (review B12, T02 S2).
  const knobs = validateLearnedRulesKnobs(thresholds)
  if (!knobs.ok) {
    throw new Error(
      `learned_rules validation failed — the gate cannot run on this config (harness blocker): ${knobs.errors.join(" · ")}`,
    )
  }

  const git = options.git ?? makeGit(root)
  const base = resolveDiffBase(git, options.since)

  const ctx = {
    root,
    thresholds,
    stack: detectStack(root),
    suites: thresholds.suites ?? {},
    commands: thresholds.commands ?? {},
    projectCommands,
  }

  const guard = guardThresholds({ git, base, thresholds, root, previousBars: options.previousBars ?? gatherPreviousBars(root, git) })
  if (guard.note) notes.push(guard.note)

  const wants = (name) => {
    const config = thresholds.metrics?.[name]
    return Boolean(config) && (config.speed !== "full" || mode === "full")
  }
  const readings = await collectReadingsAsync(ctx, mode, wants, options)

  const rows = Object.entries(thresholds.metrics ?? {})
    .map(([name, config]) => evaluate(name, config, readings[name], mode))
    .filter((row) => row.status !== "skipped")

  const regression = regressionTestRule({ git, base, suites: ctx.suites })
  if (regression?.fired) {
    notes.push(`regression rule fired: ${regression.reason}`)
    const config = thresholds.metrics?.regression_suite
    const index = rows.findIndex((row) => row.metric === "regression_suite")
    // Synthesize a COMPLETE row. Mutating an `unavailable` row left value/threshold/direction
    // undefined, so the table and the PR body printed "undefined <= undefined" and the trailer
    // silently dropped the metric.
    const synthesized = {
      metric: "regression_suite",
      value: 1,
      threshold: 0,
      direction: "max",
      ratchet: false,
      mode: config?.mode ?? "blocking",
      detail: "bug fix with no regression test",
      status: config?.mode === "blocking" || config?.mode === undefined ? STATUS.FAIL : STATUS.OBSERVE,
    }
    if (index === -1) rows.push(synthesized)
    else rows[index] = synthesized
  }

  const failed = rows.filter((row) => row.status === STATUS.FAIL)
  const unavailable = rows.filter((row) => row.status === STATUS.UNAVAILABLE)
  const blockingUnavailable = unavailable.filter((row) => row.mode === "blocking")
  const notConfigured = rows.filter((row) => row.status === STATUS.NOT_CONFIGURED)
  const notApplicable = rows.filter((row) => row.status === STATUS.NOT_APPLICABLE)
  const measured = rows.filter((row) => !isUnmeasured(row.status))
  if (unavailable.length) {
    notes.push(
      `${unavailable.length} of ${rows.length} metric(s) unavailable — these SHOULD have measured and did not. A green exit code over ${measured.length} measured rows means little. Read the table.`,
    )
  }
  if (notConfigured.length) {
    notes.push(
      `${notConfigured.length} of ${rows.length} metric(s) not_configured — no instrument exists for them in this project (${notConfigured.map((row) => row.metric).join(", ")}). Named, not measured, and not a failure: wire up a command or delete the metric.`,
    )
  }
  if (notApplicable.length) {
    notes.push(`${notApplicable.length} metric(s) not_applicable to this project or diff (${notApplicable.map((row) => row.metric).join(", ")}).`)
  }
  if (!projectCommands) {
    notes.push("project commands disabled: any metric that needs one is unavailable by choice, not by absence.")
  }

  const verdict = !guard.ok ? "config-guard-failure" : failed.length ? "fail" : blockingUnavailable.length ? "unavailable" : "pass"
  const exitCode = !guard.ok || failed.length || blockingUnavailable.length ? 1 : 0
  if (!guard.ok) notes.push("Config was loosened with no recorded reason. Fix the file or record the decision in quality-decisions.md.")

  const report = {
    verdict,
    exitCode,
    mode,
    label,
    phase: thresholds.phase ?? "unknown",
    timestamp: new Date().toISOString(),
    rows,
    // Measurement coverage stays separate from the verdict: observe and non-blocking gaps remain
    // visible without changing the gate, while blocking gaps produce the distinct unavailable verdict.
    measurementCoverage: {
      total: rows.length,
      measured: measured.length,
      unavailable: unavailable.length,
      notConfigured: notConfigured.length,
      notApplicable: notApplicable.length,
      // Share of metrics that COULD be measured here and were. not_applicable rows are
      // excluded from the denominator: they are not a coverage debt.
      ratio: rows.length - notApplicable.length === 0
        ? null
        : Math.round((measured.length / (rows.length - notApplicable.length)) * 1000) / 1000,
    },
    coverageLabel: computeCoverageLabel({
      total: rows.length,
      measured: measured.length,
      unavailable: unavailable.length,
      notConfigured: notConfigured.length,
      notApplicable: notApplicable.length,
      ratio: rows.length - notApplicable.length === 0
        ? null
        : Math.round((measured.length / (rows.length - notApplicable.length)) * 1000) / 1000,
    }),
    notes: notes.map(redact),
    sourceHash: sourceHash(root, { git, thresholds, fresh: true }),
    fingerprint: fingerprintHash(thresholds),
    projectCommands,
    stack: ctx.stack,
    base,
    provenance: {
      node: process.version,
      platform: process.platform,
      // Presence, not value: the next person to add DATABASE_URL here would otherwise commit
      // a credential.
      envSet: {
        NODE_ENV: process.env.NODE_ENV ? "set" : "unset",
        RAILS_ENV: process.env.RAILS_ENV ? "set" : "unset",
        PYTHONPATH: process.env.PYTHONPATH ? "set" : "unset",
        CI: process.env.CI ? "set" : "unset",
      },
      tools: {
        node: toolVersion("node --version", root),
        eslint: ctx.stack.js ? toolVersion("npx --no-install eslint --version", root) : null,
        radon: ctx.stack.python ? toolVersion("radon --version", root) : null,
      },
    },
    thresholdsPath: THRESHOLDS_PATH,
  }
  report.evidenceEnvelope = createEvidenceEnvelope(root, { git, thresholds, report })
  return report
}

export function evaluateReportDrift(report, root, options = {}) {
  const mode = options.mode ?? report?.mode ?? "local"
  const assessment = assessEvidenceDrift(report, root, { ...options, mode })
  if (!assessment.ok) {
    return {
      ok: false,
      status: STATUS.UNAVAILABLE,
      kind: "unavailable",
      pass: false,
      verdict: STATUS.UNAVAILABLE,
      mode,
      reason: assessment.reason,
      drift: true,
      divergence: assessment.divergence ?? null,
    }
  }
  const reportVerdict = report?.verdict
  const isPassing = Boolean(
    report &&
      reportVerdict === STATUS.PASS &&
      !report.rows?.some((r) => r.status === STATUS.FAIL || (r.status === STATUS.UNAVAILABLE && r.mode === "blocking")),
  )
  return {
    ok: true,
    status: isPassing ? STATUS.PASS : reportVerdict ?? STATUS.PASS,
    kind: "clean",
    pass: isPassing,
    verdict: reportVerdict ?? STATUS.PASS,
    mode,
    drift: false,
  }
}

function resolveDiffBase(git, since) {
  if (since) return since
  if (!git.isRepo()) return null
  for (const candidate of ["origin/main", "origin/master", "main", "master"]) {
    const mergeBase = git.mergeBase(candidate)
    if (mergeBase) return mergeBase
  }
  const head = git.head()
  return head || null
}

export function writeReport(report, root) {
  // Seconds and pid in the stamp: two lanes that omit --label would otherwise write the same
  // two files in the same minute — a concurrent write on one file.
  const stamp = report.timestamp.replace(/[:.]/g, "-").slice(0, 19)
  const dir = path.join(root, REPORT_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const base = path.join(dir, `${stamp}-${report.mode}-${report.label}-${process.pid}`)

  // T03: bind the report to the shared trace identity when a PREVC lifecycle exists, and
  // record a gate event in the stream. Both are best-effort observability: a trace failure
  // warns and never changes the report content, the exit code, or any downstream verdict.
  const resolved = loadTraceIdentity(root)
  const withTrace = resolved.ok
    ? { ...report, trace: { trace_id: resolved.identity.traceId, run_id: resolved.identity.runId, session_id: resolved.identity.sessionId } }
    : report
  fs.writeFileSync(`${base}.md`, renderMarkdown(withTrace), "utf8")
  fs.writeFileSync(`${base}.json`, JSON.stringify(withTrace, null, 2), "utf8")

  if (resolved.ok) {
    const id = safeTraceId(path.basename(base), "gate")
    const result = emitTraceEvent(root, {
      trace_id: resolved.identity.traceId,
      run_id: resolved.identity.runId,
      session_id: resolved.identity.sessionId,
      entity: { type: "gate", id },
      parent: { type: "run", id: resolved.identity.runId },
      kind: "report",
      outcome: typeof report.verdict === "string" ? report.verdict.slice(0, 32) : "unknown",
      data: {
        file: path.relative(root, `${base}.json`).replace(/\\/g, "/"),
        mode: report.mode ?? null,
        label: report.label ?? null,
        source_hash: report.sourceHash ?? null,
        phase: report.phase ?? null,
      },
    })
    if (!result.ok) console.warn(`[harness:trace] gate event not recorded: ${result.reason}`)
  }

  return { markdown: `${base}.md`, json: `${base}.json` }
}

// Only the scheduler's full run writes baselines. Lanes never touch the thresholds file —
// concurrent writes to one JSON lose updates and would break v1.1 invariant 1.
export function updateBaselines(report, root) {
  if (report.mode !== "full" || report.unconfigured) return false
  const targetPath = path.join(root, THRESHOLDS_PATH)
  const thresholds = readJsonIfExists(targetPath)
  if (!thresholds) return false
  let changed = false
  for (const [name, config] of Object.entries(thresholds.metrics ?? {})) {
    const row = report.rows.find((item) => item.metric === name)
    const next = nextBaseline(config, row)
    if (next !== (config.baseline ?? null)) {
      config.baseline = next
      changed = true
    }
  }
  if (changed) fs.writeFileSync(targetPath, `${JSON.stringify(thresholds, null, 2)}\n`, "utf8")
  return changed
}

async function runCli() {
  const args = process.argv.slice(2)
  const valueOf = (flag, fallback) => {
    const index = args.indexOf(flag)
    return index !== -1 && args[index + 1] ? args[index + 1] : fallback
  }
  const root = path.resolve(valueOf("--project", process.cwd()))

  if (args.includes("--check-sources")) {
    const findings = checkSources(root)
    if (args.includes("--json")) console.log(JSON.stringify({ findings }, null, 2))
    else if (findings.length === 0) console.log("check-sources: no prose thresholds found.")
    else {
      console.log(`check-sources: ${findings.length} prose threshold(s) — the number belongs in ${THRESHOLDS_PATH}:`)
      for (const finding of findings) console.log(`  ${finding.file}:${finding.line}  ${finding.text}`)
    }
    process.exitCode = findings.length ? 1 : 0
    return
  }

  if (args.includes("--check-rulebook")) {
    const report = checkRulebookSources(root)
    if (args.includes("--json")) {
      console.log(JSON.stringify(report, null, 2))
    } else if (report.status === "unavailable") {
      console.log(`check-rulebook: unavailable — ${report.reason}`)
    } else if (report.status === "clean") {
      console.log(
        `check-rulebook: clean — every rule line in ${RULEBOOK_DIR.replace(/\\/g, "/")} is traceable to ${RULEBOOK_LEDGER_PATH.replace(/\\/g, "/")}.`,
      )
    } else {
      console.log(`check-rulebook: ${report.orphan.length + report.length.length} adoption finding(s) in ${RULEBOOK_DIR.replace(/\\/g, "/")}:`)
      for (const finding of report.orphan) {
        console.log(`  orphan ${finding.file}:${finding.line}  ${finding.text}  (${finding.reason})`)
      }
      for (const finding of report.length) {
        console.log(`  length ${finding.file}: ${finding.lines} lines over the ${finding.limit}-line limit`)
      }
      console.log(
        `Adoption mode: this check is a report and never runs inside the gate. Adopt by giving every rule line an id ` +
          `that exists in ${RULEBOOK_LEDGER_PATH.replace(/\\/g, "/")} and keeping standards files within standards_file_lines_max.`,
      )
    }
    for (const note of report.notes) console.log(`note: ${note}`)
    // 0 clean · 1 findings or unavailable (never a silent clean) · 2 is reserved for
    // the script itself failing, matching the gate's exit semantics.
    process.exitCode = report.status === "clean" ? 0 : 1
    return
  }

  let report
  try {
    report = await runGate({
      root,
      mode: valueOf("--mode", "local"),
      label: valueOf("--label", "session"),
      since: valueOf("--since", null),
      projectCommands: !args.includes("--no-project-commands"),
    })
  } catch (error) {
    // Exit 2: the gate itself broke. A harness blocker, not a code failure.
    console.error(`harness-quality-gate could not run: ${redact(error.message)}`)
    process.exitCode = 2
    return
  }

  const written = report.unconfigured ? null : writeReport(report, root)
  const baselinesChanged = updateBaselines(report, root)

  if (args.includes("--json")) {
    console.log(JSON.stringify({ ...report, report: written, baselinesChanged }, null, 2))
  } else {
    console.log(`Quality gate — ${report.mode} — verdict: ${report.verdict}`)
    if (report.coverageLabel) {
      console.log(`Measured: ${report.coverageLabel.measured}/${report.coverageLabel.total} metrics`)
      if (report.coverageLabel.unmeasuredMajority) {
        console.log(`WARNING: most metrics unmeasured (${report.coverageLabel.measured}/${report.coverageLabel.total}); pass is not evidence of quality`)
      }
    }
    if (report.rows.length) console.log(`\n${renderTable(report.rows)}`)
    if (report.notes.length) console.log(`\nNotes:\n${report.notes.map((note) => `  - ${note}`).join("\n")}`)
    if (written) console.log(`\nReport: ${path.relative(root, written.markdown)}`)
  }

  process.exitCode = report.exitCode
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runCli()
