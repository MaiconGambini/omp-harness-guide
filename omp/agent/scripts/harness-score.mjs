// harness-score — persistent aggregate quality score (R4).
//
// Derives a 0-10 aggregate from the newest of the ≤ 30 newest full gate reports under
// `docs/harness/quality/` and persists `docs/harness/quality/aggregate.json`
// (components + append-only bounded history, 30 entries max, oldest dropped).
//
// Scoring rule (fixed, spec R4 / ticket T05):
//   base      = 10 × (passing rows / total non-skipped rows)
//   score     = passed / MEASURED rows — the quality of what was actually measured
//   coverage  = measured rows / measurable rows, persisted BESIDE the score, never
//               folded into it. Mixing the two is what turned six passing metrics over
//               twenty-one rows into a "quality score" of 1.9: that number was mostly
//               reporting missing instruments, not bad code.
//   qualified = false when coverage is below QUALIFIED_COVERAGE_FLOOR, so a high score
//               over a thin report can never be read as an unqualified verdict
//   gaps      = rows that SHOULD have measured and did not (status `unavailable`);
//               `not_configured` and `not_applicable` are listed separately, because a
//               missing instrument is a known fact, not a fresh failure
//   red cap   = a red blocking metric caps the score at 4
//   sec floor = a nonzero security_findings reading caps the score at 2
//
// DERIVED OBSERVABILITY ONLY: the aggregate never feeds thresholds, the router, or any
// gate input — the gate/router/ship-evidence sources contain no read of aggregate.json
// (grep-proof is part of the test suite). It lives in docs/harness/quality/, which is
// excluded from the gate's source hash, so it cannot forge thresholds either.
//
// CLI: --root <dir> for fixture runs; default process.cwd(). Exit 0 always on a written
// aggregate; exit 2 when no parseable report exists (nothing derived — a gap, not a 0).

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { readJsonIfExists } from "./harness-quality-core.mjs"

export const AGGREGATE_PATH = path.join("docs", "harness", "quality", "aggregate.json")
export const HISTORY_MAX = 30

export function reportCandidates(root) {
  const dir = path.join(root, "docs", "harness", "quality")
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json") && name !== "aggregate.json" && name !== "fallback-events.json" && name !== "capabilities.json")
    .map((name) => {
      const report = readJsonIfExists(path.join(dir, name))
      return { name, report, timestamp: report?.timestamp ?? name }
    })
    .filter((entry) => Array.isArray(entry.report?.rows))
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, HISTORY_MAX)
}

// Below this coverage the score is reported but flagged unqualified: it describes too
// little of the system to stand on its own.
export const QUALIFIED_COVERAGE_FLOOR = 0.6

const UNMEASURED = new Set(["unavailable", "not_configured", "not_applicable"])

export function deriveScore(report) {
  const rows = Array.isArray(report?.rows) ? report.rows : []
  const measuredRows = rows.filter((row) => row && row.status !== "skipped")
  const available = measuredRows.filter((row) => row.value !== undefined && row.value !== null && !UNMEASURED.has(row.status))
  const passed = available.filter((row) => row.status === "pass")
  const redBlocking = rows.filter((row) => row?.mode === "blocking" && row.status === "fail")
  const security = rows.find((row) => row?.metric === "security_findings")
  const components = Object.fromEntries(
    rows.map((row) => [row.metric, { value: row.value ?? null, mode: row.mode ?? null, state: row.status ?? "unknown" }]),
  )
  // A gap is a metric that had an instrument and produced nothing. A metric with no
  // instrument is a different, permanent fact — reported, not counted as a gap.
  const gaps = measuredRows.filter((row) => row.status === "unavailable").map((row) => row.metric)
  const notConfigured = measuredRows.filter((row) => row.status === "not_configured").map((row) => row.metric)
  const notApplicable = measuredRows.filter((row) => row.status === "not_applicable").map((row) => row.metric)
  const total = measuredRows.length
  // not_applicable rows leave the denominator: a control that cannot apply here is not
  // coverage the project owes.
  const measurable = total - notApplicable.length
  const coverage = measurable > 0 ? Math.round((available.length / measurable) * 1000) / 1000 : 0

  // The score grades what was MEASURED. Dividing by every row instead made the score a
  // proxy for tooling completeness.
  let score = available.length ? Math.round((passed.length / available.length) * 100) / 10 : 0
  if (redBlocking.length) score = Math.min(score, 4)
  if (security && security.value !== undefined && security.value !== null && Number(security.value) > 0) {
    score = Math.min(score, 2)
  }
  // Three ways a score fails to stand on its own: nothing was measured, too little was
  // measured, or something that HAD an instrument stayed silent. The last one matters
  // even at high coverage — `unavailable` is a gap to name, never a pass.
  const qualified = available.length > 0 && coverage >= QUALIFIED_COVERAGE_FLOOR && gaps.length === 0
  // Every reason that applies is listed. A sparse report WITH live gaps has two problems,
  // and reporting only the first hides the other.
  const reasons = []
  if (available.length === 0) reasons.push("no metric was measured — the score describes nothing")
  else if (coverage < QUALIFIED_COVERAGE_FLOOR) {
    reasons.push(`measurement coverage ${coverage} is below the ${QUALIFIED_COVERAGE_FLOOR} floor; the score grades ${available.length} of ${measurable} measurable metric(s)`)
  }
  if (gaps.length > 0) {
    reasons.push(`${gaps.length} instrumented metric(s) unavailable (${gaps.join(", ")}) — configured and produced nothing`)
  }
  return {
    score,
    qualified,
    unqualifiedReason: qualified ? null : reasons.join("; "),
    components,
    gaps,
    notConfigured,
    notApplicable,
    available: available.length,
    measurable,
    total,
    coverage,
    redBlocking: redBlocking.map((row) => row.metric),
  }
}

export function writeAggregate(root, report) {
  const derived = deriveScore(report)
  const target = path.join(root, AGGREGATE_PATH)
  const previous = readJsonIfExists(target)
  const history = Array.isArray(previous?.history) ? previous.history : []
  const now = new Date().toISOString()
  history.push({ updatedAt: now, score: derived.score })
  while (history.length > HISTORY_MAX) history.shift()
  const aggregate = {
    schemaVersion: 1,
    updatedAt: now,
    score: derived.score,
    sourceReport: report?.timestamp ?? report?.label ?? null,
    qualified: derived.qualified,
    unqualifiedReason: derived.unqualifiedReason,
    available: derived.available,
    measurable: derived.measurable,
    total: derived.total,
    coverage: derived.coverage,
    components: derived.components,
    gaps: derived.gaps,
    notConfigured: derived.notConfigured,
    notApplicable: derived.notApplicable,
    history,
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${JSON.stringify(aggregate, null, 2)}\n`, "utf8")
  return aggregate
}

function runCli() {
  const args = process.argv.slice(2)
  const valueOf = (flag) => {
    const index = args.indexOf(flag)
    return index !== -1 && args[index + 1] ? args[index + 1] : null
  }
  const root = path.resolve(valueOf("--root") ?? process.cwd())
  const candidates = reportCandidates(root)
  if (candidates.length === 0) {
    console.error(`harness-score: no parseable gate report under ${path.join("docs", "harness", "quality")} — nothing derived; a gap, not a zero`)
    process.exitCode = 2
    return
  }
  const aggregate = writeAggregate(root, candidates[0].report)
  console.log(JSON.stringify({ aggregate: path.relative(root, AGGREGATE_PATH), score: aggregate.score, source: aggregate.sourceReport, history: aggregate.history.length }, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli()
