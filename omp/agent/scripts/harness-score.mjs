// harness-score — persistent aggregate quality score (R4).
//
// Derives a 0-10 aggregate from the newest of the ≤ 30 newest full gate reports under
// `docs/harness/quality/` and persists `docs/harness/quality/aggregate.json`
// (components + append-only bounded history, 30 entries max, oldest dropped).
//
// Scoring rule (fixed, spec R4 / ticket T05):
//   base      = 10 × (passing rows / total non-skipped rows)
//   coverage  = available rows / total non-skipped rows, persisted beside score
//   gaps      = named unavailable rows; sparse reports cannot appear as unqualified 10
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

export function deriveScore(report) {
  const rows = Array.isArray(report?.rows) ? report.rows : []
  const measuredRows = rows.filter((row) => row && row.status !== "skipped")
  const available = measuredRows.filter((row) => row.value !== undefined && row.value !== null && row.status !== "unavailable")
  const passed = available.filter((row) => row.status === "pass")
  const redBlocking = rows.filter((row) => row?.mode === "blocking" && row.status === "fail")
  const security = rows.find((row) => row?.metric === "security_findings")
  const components = Object.fromEntries(
    rows.map((row) => [row.metric, { value: row.value ?? null, mode: row.mode ?? null, state: row.status ?? "unknown" }]),
  )
  const gaps = measuredRows.filter((row) => row.status === "unavailable").map((row) => row.metric)
  const total = measuredRows.length
  const coverage = total ? Math.round((available.length / total) * 1000) / 1000 : 0

  let score = total ? Math.round((passed.length / total) * 100) / 10 : 0
  if (redBlocking.length) score = Math.min(score, 4)
  if (security && security.value !== undefined && security.value !== null && Number(security.value) > 0) {
    score = Math.min(score, 2)
  }
  return {
    score,
    components,
    gaps,
    available: available.length,
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
    available: derived.available,
    total: derived.total,
    coverage: derived.coverage,
    components: derived.components,
    gaps: derived.gaps,
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
