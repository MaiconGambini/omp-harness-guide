// harness-ship-evidence — puts the numbers into the commit and the PR.
//
// It also IS the commit gate: --commit-trailer refuses to emit on a missing, stale, red, or
// unreviewed change, so a compliant commit message cannot be composed without one. That is how
// "commits approved only with a decent quality gate" becomes structural instead of a rule
// someone remembers.
//
// HARD BOUNDARY: this script only prints. No git commit, no push, no PR creation, no branch or
// remote operation. Those stay operator actions (v1.1 invariant 5). "Merge automatico" from the
// whiteboard means nobody reads the diff — never that nobody presses the button.

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  makeGit,
  readJsonIfExists,
  readTextIfExists,
  redact,
  resolveInsideRoot,
  REPORT_DIR,
  REVIEW_DIR,
  sourceHash,
  THRESHOLDS_PATH,
} from "./harness-quality-core.mjs"
import { assessReport, route, TIER } from "./harness-risk-router.mjs"
import { pathExists } from "./harness-common.mjs"
import { appendEvent, newId, readTrace, validateId, verifyTrace } from "./harness-trace.mjs"

const REVIEW_MD = path.join("docs", "review.md")

// Match the mode from the PARSED report, not the filename: substring matching accepted
// `...-local-full-lane.json` (a local run whose label starts with "full") as a full report.
export function findReport(root, mode) {
  const dir = path.join(root, REPORT_DIR)
  if (!pathExists(dir)) return null
  const names = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .reverse()
  for (const name of names) {
    const report = readJsonIfExists(path.join(dir, name))
    if (!report) continue
    if (mode && report.mode !== mode) continue
    return { report, file: path.join(REPORT_DIR, name) }
  }
  return null
}

// A recorded review must name the gate report it reviewed. Accepting "any file in the review
// directory" meant one review artifact, once, permanently satisfied the full-tier precondition
// for every subsequent change — for the tier where a human read is mandatory.
// A review must name the change it reviewed AND have approved it. Checking only for the source hash
// closed "a review of a different change" but left "a review that did not approve": a file saying
// REQUEST CHANGES, or a one-line stub containing the hash, satisfied the tier-`full` precondition —
// the one tier that exists to guarantee a human read and agreed.
// The decision comes ONLY from labelled verdict lines, never from prose. Scanning the whole document
// for rejection words failed on the first real review report: every one of them contains
// "Blocking issues: 0" or "0 blocking", which is a statement of APPROVAL, and a bare
// /block(ing)?/ match turned that into a refusal. Found by dogfooding this very commit.
//
// Markdown bold may wrap the label (`- **Recommendation**: PASS`), so asterisks can appear on either
// side of the separator.
const VERDICT_LINE = /^[\s\-*>|]*\**\s*(verdict|recommendation)\s*\**\s*[:=]\s*\**\s*([A-Za-z_ -]{2,40})/gim
const APPROVING_VALUE = /^(approve|approved|pass|passed|accept|accepted)\b/i
const REJECTING_VALUE = /^(request[_\s-]?changes|needs[_\s-]?discussion|block|blocked|revise|reject(ed)?|fail(ed)?)\b/i

export function reviewVerdicts(text) {
  const verdicts = []
  for (const match of String(text ?? "").matchAll(VERDICT_LINE)) {
    const value = match[2].trim()
    if (APPROVING_VALUE.test(value)) verdicts.push({ value, approving: true })
    else if (REJECTING_VALUE.test(value)) verdicts.push({ value, approving: false })
  }
  return verdicts
}

export function reviewApproves(text) {
  const verdicts = reviewVerdicts(text)
  if (verdicts.length === 0) return false
  // Any rejecting verdict anywhere wins: a document that approves one axis and rejects another has
  // not approved the change.
  return verdicts.every((verdict) => verdict.approving)
}

export function findReviewFor(root, report, explicitPath) {
  const needle = report?.sourceHash

  const judge = (text, file) => {
    if (needle && !text.includes(needle)) {
      return { found: false, reason: `review does not reference this gate report's source hash (${needle}) — a review of a different change does not count` }
    }
    if (!reviewApproves(text)) {
      return {
        found: false,
        reason: `review ${file} cites this change but records no approving verdict (expected "Verdict: APPROVE" or "Recommendation: PASS", and no REQUEST CHANGES / BLOCK)`,
      }
    }
    return { found: true, file }
  }

  if (explicitPath) {
    // Confined to the repo, exactly like `commands.coverage_artifact`. Without this an absolute or
    // `../../..` path let a never-committed file in the system temp dir satisfy the tier-`full`
    // precondition — defeating the reason the review has to live somewhere reviewable at all.
    const resolved = resolveInsideRoot(root, explicitPath)
    if (!resolved) return { found: false, reason: `--review path resolves outside the repository: ${explicitPath}` }
    if (!pathExists(resolved)) return { found: false, reason: `--review path does not exist: ${explicitPath}` }
    return judge(readTextIfExists(resolved), explicitPath)
  }

  const dir = path.join(root, REVIEW_DIR)
  if (!pathExists(dir)) return { found: false, reason: `no ${REVIEW_DIR} directory` }
  let nearest = null
  for (const name of fs.readdirSync(dir).filter((entry) => /\.md$/i.test(entry))) {
    const file = path.join(REVIEW_DIR, name)
    const verdict = judge(readTextIfExists(path.join(dir, name)), file)
    if (verdict.found) return verdict
    if (needle && readTextIfExists(path.join(dir, name)).includes(needle)) nearest = verdict
  }
  return (
    nearest ?? {
      found: false,
      reason: `no approving review in ${REVIEW_DIR} references this gate report's source hash (${needle ?? "none"})`,
    }
  )
}

// Pure: everything it needs is passed in, so the commit gate's decision is testable without a
// repository. `checkPreconditions` is the thin wrapper that gathers the inputs.
export function evaluatePreconditions({ report, reportFile, routing, currentHash, review, mode }) {
  const problems = []

  if (!report) {
    problems.push(`no ${mode}-mode gate report in ${REPORT_DIR}. Run the gate at --mode ${mode} first.`)
    return { ok: false, problems }
  }

  const assessment = assessReport(report, {
    currentHash,
    configuredMetrics: (report.rows ?? []).map((row) => row.metric),
  })
  if (!assessment.credible) problems.push(`gate report is not credible: ${assessment.reason}. Re-run the gate.`)

  for (const row of (report.rows ?? []).filter((item) => item.status === "fail")) {
    problems.push(`blocking metric red: ${row.metric} = ${row.value} (needs ${row.direction === "min" ? ">=" : "<="} ${row.threshold}).`)
  }

  // A blocking metric the gate could not measure is not a green — it is a gap exactly
  // where the commit gate would refuse. `unavailable` never fails the gate's exit code,
  // so ship-evidence must refuse on its own: a missing number is not a pass (code-review
  // W2, measured-gates: "a green exit code over N measured rows means little").
  for (const row of (report.rows ?? []).filter((item) => item.status === "unavailable" && item.mode === "blocking")) {
    problems.push(`blocking metric unavailable: ${row.metric} — the gate could not measure a metric that must block; a missing number is not a pass.`)
  }

  if (routing?.tier === TIER.FULL && !review?.found) {
    problems.push(
      `tier is full (${routing.tierReason}) and no code-review result is recorded for this change. ` +
        `${review?.reason ?? ""} Run /code-review, save it under ${REVIEW_DIR} citing the report's source hash, or pass --review <path>.`,
    )
  }

  return { ok: problems.length === 0, problems }
}

export function checkPreconditions(root, { mode = "full", reviewPath = null } = {}) {
  const git = makeGit(root)
  const thresholds = readJsonIfExists(path.join(root, THRESHOLDS_PATH))
  const found = findReport(root, mode)
  const currentHash = sourceHash(root, { git, thresholds, fresh: true })
  const review = found ? findReviewFor(root, found.report, reviewPath) : { found: false, reason: "no report" }
  // Pass the already-chosen report into the router so the trailer and the tier cannot describe
  // two different reports.
  const routing = found ? route({ root, git, thresholds, gate: assessedGate(found, currentHash) }) : route({ root, git, thresholds })

  const verdict = evaluatePreconditions({ report: found?.report, reportFile: found?.file, routing, currentHash, review, mode })
  // T03: record the review/Judge/handoff evidence found for this change into the shared
  // trace stream. Best-effort observability — a trace failure warns and never changes the
  // precondition verdict, the trailer, or the refusal.
  try {
    const traced = recordShipEvidenceTrace(root, { report: found?.report ?? null, reportFile: found?.file ?? null, review })
    if (!traced.ok) {
      const failed = traced.emitted.filter((entry) => !entry.ok).map((entry) => `${entry.entity}: ${entry.reason}`).join("; ")
      console.warn(`[harness:trace] evidence events not recorded: ${failed}`)
    }
  } catch (error) {
    console.warn(`[harness:trace] evidence trace not recorded: ${error instanceof Error ? error.message : String(error)}`)
  }
  return { ...verdict, report: found?.report ?? null, reportFile: found?.file ?? null, routing, review }
}

function assessedGate(found, currentHash) {
  const assessment = assessReport(found.report, {
    currentHash,
    configuredMetrics: (found.report.rows ?? []).map((row) => row.metric),
  })
  return { credible: assessment.credible, reason: assessment.reason ?? null, report: found.report, path: found.file }
}

// ---------------------------------------------------------------------------
// T03 — trace join adapter (shared by the OpenCode plugins and the evidence scripts)
//
// Canonical identity comes from the PREVC lifecycle state (docs/harness/state/prevc.json,
// T02): its trace_id/run_id/session_id are the ids every event in this checkout must join
// under. When no lifecycle exists the script-side records are NOT emitted (they would form
// unjoinable standalone traces); the OpenCode tool-activity plugin opens its own standalone
// trace for fresh-session diagnostics instead. Emission is best-effort observability: a
// failure is a named warning and never changes a verdict, an exit code, or a
// security/permission outcome.

const PREVC_STATE_PATH = path.join("docs", "harness", "state", "prevc.json")
const JUDGE_DIR = path.join("docs", "harness", "judge")
const FINDINGS_DIR = path.join("docs", "harness", "findings")
const BENCH_PATH = path.join(".opencode", "state", "benchmark.jsonl")
const HANDOFF_PATH = path.join("docs", "harness", "session-handoff.md")

/** Read the canonical trace identity from the lifecycle state; never mints over it. */
export function loadTraceIdentity(root) {
  const text = readTextIfExists(path.join(root, PREVC_STATE_PATH))
  if (!text || !text.trim()) return { ok: false, reason: "no-prevc-state", identity: null }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: "invalid-prevc-state", identity: null }
  }
  if (
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) &&
    validateId(parsed.traceId) && validateId(parsed.runId) && validateId(parsed.sessionId)
  ) {
    return { ok: true, identity: { traceId: parsed.traceId, runId: parsed.runId, sessionId: parsed.sessionId } }
  }
  return { ok: false, reason: "invalid-prevc-state", identity: null }
}

/** Fresh stable identity for a standalone (no-lifecycle) trace. */
export function mintTraceIdentity() {
  return { traceId: newId("trace"), runId: newId("run"), sessionId: newId("ses") }
}

/** Derive a stable trace entity id from a store file name; mint a fresh id when the name is not a valid trace id. */
export function safeTraceId(candidate, prefix) {
  return typeof candidate === "string" && validateId(candidate) ? candidate : newId(prefix)
}

/** Best-effort append into the shared stream: never throws, never affects the caller's outcome. */
export function emitTraceEvent(root, event) {
  try {
    return appendEvent(root, JSON.stringify(event))
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Record the review/Judge/handoff evidence found for one gate report into the trace stream.
 * Canonical identity only (no lifecycle state -> nothing to join); every append is
 * independent, so a refused event is returned per entity instead of failing the rest.
 */
export function recordShipEvidenceTrace(root, { report, reportFile, review }) {
  const resolved = loadTraceIdentity(root)
  if (!resolved.ok) return { ok: true, emitted: [] }
  const { traceId, runId, sessionId } = resolved.identity
  const base = { trace_id: traceId, run_id: runId, session_id: sessionId }
  const emitted = []

  if (review?.found && typeof review.file === "string") {
    const id = safeTraceId(path.basename(review.file).replace(/\.md$/i, ""), "review")
    const result = emitTraceEvent(root, {
      ...base,
      entity: { type: "review", id },
      parent: { type: "run", id: runId },
      kind: "found",
      outcome: "approving",
      data: {
        file: review.file.replace(/\\/g, "/"),
        gate_report: reportFile ? reportFile.replace(/\\/g, "/") : null,
        source_hash: report?.sourceHash ?? null,
      },
    })
    emitted.push({ entity: "review", ok: result.ok, reason: result.ok ? null : result.reason })
  }

  // Judge receipts bound to THIS gate report (receipt.gateReport names the exact report file).
  const judgeDir = path.join(root, JUDGE_DIR)
  if (reportFile && pathExists(judgeDir)) {
    const target = String(reportFile).replace(/\\/g, "/")
    for (const name of fs.readdirSync(judgeDir).filter((entry) => entry.endsWith(".json")).sort()) {
      const receipt = readJsonIfExists(path.join(judgeDir, name))
      if (!receipt || typeof receipt.gateReport !== "string") continue
      if (receipt.gateReport.replace(/\\/g, "/") !== target) continue
      const id = safeTraceId(name.slice(0, -5), "judge")
      const result = emitTraceEvent(root, {
        ...base,
        entity: { type: "judge", id },
        parent: { type: "run", id: runId },
        kind: "receipt",
        outcome: typeof receipt.verdict === "string" ? receipt.verdict.slice(0, 32) : "unknown",
        data: {
          file: `${JUDGE_DIR.replace(/\\/g, "/")}/${name}`,
          gate_report: receipt.gateReport.replace(/\\/g, "/"),
          source_hash: typeof receipt.sourceHash === "string" ? receipt.sourceHash : null,
          rubric_score: Number.isFinite(receipt.rubricScore) ? receipt.rubricScore : null,
        },
      })
      emitted.push({ entity: "judge", ok: result.ok, reason: result.ok ? null : result.reason })
    }
  }

  const handoffText = readTextIfExists(path.join(root, HANDOFF_PATH))
  if (handoffText !== null) {
    const result = emitTraceEvent(root, {
      ...base,
      entity: { type: "handoff", id: "session-handoff" },
      parent: { type: "run", id: runId },
      kind: "found",
      outcome: "present",
      data: { file: HANDOFF_PATH.replace(/\\/g, "/"), source_hash: report?.sourceHash ?? null },
    })
    emitted.push({ entity: "handoff", ok: result.ok, reason: result.ok ? null : result.reason })
  }

  return { ok: emitted.every((entry) => entry.ok), emitted }
}

/**
 * Cross-store join verification (T03 AC-03): the trace stream plus every derived store that
 * must bind to it — lifecycle state, gate reports, findings windows, review records, Judge
 * receipts, handoff, and the benchmark log. `ok` is true only when the stream verifies
 * cleanly AND every present store binds to the same canonical identity/source hash; every
 * mismatch is a named gap, never silently dropped.
 */
export function verifyTraceJoin(root) {
  const integrity = verifyTrace(root)
  const { records } = readTrace(root)
  const eventIds = new Set(records.map((record) => `${record.entity.type}:${record.entity.id}`))
  const gaps = []
  const stores = {}

  const identity = loadTraceIdentity(root)
  stores.lifecycle = identity.ok
    ? { state: PREVC_STATE_PATH.replace(/\\/g, "/"), trace_id: identity.identity.traceId, run_id: identity.identity.runId, session_id: identity.identity.sessionId }
    : { state: PREVC_STATE_PATH.replace(/\\/g, "/"), gap: identity.reason }
  if (!identity.ok) gaps.push(`lifecycle: ${identity.reason}`)

  // gate reports — a T03-era report carries a `trace` binding whose gate entity id (the
  // report file basename) must exist in the stream.
  stores.gate = { dir: REPORT_DIR.replace(/\\/g, "/"), reports: [] }
  const gateDir = path.join(root, REPORT_DIR)
  const gateHashes = new Set()
  if (pathExists(gateDir)) {
    for (const name of fs.readdirSync(gateDir).filter((entry) => entry.endsWith(".json")).sort()) {
      const report = readJsonIfExists(path.join(gateDir, name))
      const file = `${REPORT_DIR.replace(/\\/g, "/")}/${name}`
      if (!report) {
        gaps.push(`gate ${name}: unreadable report`)
        continue
      }
      if (typeof report.sourceHash === "string") gateHashes.add(report.sourceHash)
      const gateId = safeTraceId(name.slice(0, -5), "gate")
      const bound = Boolean(
        report.trace && validateId(report.trace.trace_id) && report.trace.trace_id === identity.identity?.traceId && eventIds.has(`gate:${gateId}`),
      )
      stores.gate.reports.push({ file, trace: report.trace ?? null, sourceHash: report.sourceHash ?? null, verdict: report.verdict ?? null, bound })
      if (!bound) gaps.push(`gate ${name}: report has no trace binding to a gate event in this stream`)
    }
  } else {
    gaps.push(`gate: no ${REPORT_DIR.replace(/\\/g, "/")} reports`)
  }

  // findings — the envelope binds by value: gate_report names a gate file whose sourceHash
  // equals gate_source_hash.
  stores.findings = { dir: FINDINGS_DIR.replace(/\\/g, "/"), files: [] }
  const findingsDir = path.join(root, FINDINGS_DIR)
  if (pathExists(findingsDir)) {
    for (const name of fs.readdirSync(findingsDir).filter((entry) => entry.endsWith(".json")).sort()) {
      const data = readJsonIfExists(path.join(findingsDir, name))
      const file = `${FINDINGS_DIR.replace(/\\/g, "/")}/${name}`
      if (!data) {
        gaps.push(`findings ${name}: unreadable file`)
        continue
      }
      const hash = typeof data.run?.gate_source_hash === "string" ? data.run.gate_source_hash : null
      const gateFile = typeof data.run?.gate_report === "string" ? data.run.gate_report.replace(/\\/g, "/") : null
      const bound = gateFile !== null && hash !== null && stores.gate.reports.some((entry) => entry.file === gateFile && entry.sourceHash === hash)
      stores.findings.files.push({ file, gate_report: gateFile, gate_source_hash: hash, bound })
      if (!bound) gaps.push(`findings ${name}: envelope does not bind to a gate report + source hash in this tree`)
    }
  } else {
    gaps.push(`findings: no ${FINDINGS_DIR.replace(/\\/g, "/")} files`)
  }

  // review — a review binds when it references a gate source hash in this tree AND records
  // an approving verdict line.
  stores.review = { dir: REVIEW_DIR.replace(/\\/g, "/"), files: [] }
  const reviewDir = path.join(root, REVIEW_DIR)
  if (pathExists(reviewDir)) {
    for (const name of fs.readdirSync(reviewDir).filter((entry) => /\.md$/i.test(entry)).sort()) {
      const text = readTextIfExists(path.join(reviewDir, name)) ?? ""
      const boundHashes = [...gateHashes].filter((hash) => text.includes(hash))
      const verdicts = reviewVerdicts(text)
      const approves = verdicts.length > 0 && verdicts.every((verdict) => verdict.approving)
      const file = `${REVIEW_DIR.replace(/\\/g, "/")}/${name}`
      stores.review.files.push({ file, bound_hashes: boundHashes, verdicts: verdicts.map((verdict) => verdict.value), approves })
      if (boundHashes.length === 0) gaps.push(`review ${name}: does not reference any gate source hash in this tree`)
    }
  } else {
    gaps.push(`review: no ${REVIEW_DIR.replace(/\\/g, "/")} files`)
  }

  // judge — a receipt binds when its gateReport names a real gate file in this tree.
  stores.judge = { dir: JUDGE_DIR.replace(/\\/g, "/"), receipts: [] }
  const judgeDir = path.join(root, JUDGE_DIR)
  if (pathExists(judgeDir)) {
    for (const name of fs.readdirSync(judgeDir).filter((entry) => entry.endsWith(".json")).sort()) {
      const receipt = readJsonIfExists(path.join(judgeDir, name))
      const file = `${JUDGE_DIR.replace(/\\/g, "/")}/${name}`
      if (!receipt) {
        gaps.push(`judge ${name}: unreadable receipt`)
        continue
      }
      const gateFile = typeof receipt.gateReport === "string" ? receipt.gateReport.replace(/\\/g, "/") : null
      const bound = gateFile !== null && stores.gate.reports.some((entry) => entry.file === gateFile)
      stores.judge.receipts.push({ file, verdict: receipt.verdict ?? null, sourceHash: receipt.sourceHash ?? null, gateReport: gateFile, bound })
      if (!bound) gaps.push(`judge ${name}: receipt does not bind to a gate report in this tree`)
    }
  } else {
    gaps.push(`judge: no ${JUDGE_DIR.replace(/\\/g, "/")} receipts`)
  }

  // handoff — present and referencing a gate source hash in this tree.
  const handoffText = readTextIfExists(path.join(root, HANDOFF_PATH))
  const handoffBound = handoffText !== null && [...gateHashes].some((hash) => handoffText.includes(hash))
  stores.handoff = { file: HANDOFF_PATH.replace(/\\/g, "/"), present: handoffText !== null, bound: handoffBound }
  if (handoffText === null) gaps.push(`handoff: ${HANDOFF_PATH.replace(/\\/g, "/")} absent`)
  else if (!handoffBound) gaps.push("handoff: does not reference a gate source hash in this tree")

  // benchmark — every record must carry a trace_id present in the stream; a legacy record
  // without one is a named gap (expired/unbound records fail closed or are named).
  stores.benchmark = { file: BENCH_PATH.replace(/\\/g, "/"), records: [], bound: 0, orphan: 0 }
  const benchText = readTextIfExists(path.join(root, BENCH_PATH))
  if (benchText) {
    for (const line of benchText.split("\n").filter((line) => line.trim())) {
      let entry
      try {
        entry = JSON.parse(line)
      } catch {
        gaps.push("benchmark: unparseable record")
        continue
      }
      const traceId = typeof entry.trace_id === "string" ? entry.trace_id : null
      const known = traceId !== null && Object.prototype.hasOwnProperty.call(integrity.traces, traceId)
      stores.benchmark.records.push({ trace_id: traceId, bound: known })
      if (known) stores.benchmark.bound += 1
      else {
        stores.benchmark.orphan += 1
        gaps.push(`benchmark: record with unknown or missing trace_id (${String(traceId)})`)
      }
    }
  } else {
    gaps.push(`benchmark: no ${BENCH_PATH.replace(/\\/g, "/")}`)
  }

  return {
    ok: integrity.ok && gaps.length === 0,
    integrity: { ok: integrity.ok, total: integrity.total, errors: integrity.errors.length, danglingParents: integrity.danglingParents.length },
    traces: integrity.traces,
    stores,
    gaps,
  }
}

// ---------------------------------------------------------------------------
// commit trailer
// commit trailer
//
// A trailer, not prose: `git log --grep=Quality-Gate` becomes the project's quality history for
// free, and the ratchet can read baselines out of history rather than trusting one mutable field.

export function renderTrailer({ report, reportFile, routing }) {
  const value = (metric) => {
    const row = (report.rows ?? []).find((item) => item.metric === metric)
    if (!row) return null
    if (row.status === "unavailable") return "unavailable"
    if (row.value === undefined) return null
    return String(row.value)
  }

  const pairs = [
    ["line", value("line_coverage")],
    ["branch", value("branch_coverage")],
    ["cyclo", value("cyclomatic_max")],
    ["module", value("module_lines_max")],
    ["security", value("security_findings")],
    ["boundaries", value("boundary_violations")],
    ["regression", value("regression_suite")],
    ["mutation", value("mutation_kill_ratio")],
  ].filter(([, found]) => found !== null)

  const sampled = routing?.sample && !routing.sample.empty ? ` (reviewed ${routing.sample.selected.length}/${routing.sample.total} files)` : ""

  // The adherence evidence (continual harness, T07 rows), same shape as Metrics: a row
  // present but unavailable renders `unavailable`; a row the report does not carry at all
  // (e.g. a full-speed row filtered out of a local run) is omitted. `violations` maps to
  // rule_violations_enforced — the only adherence count that may ever become blocking; prose
  // violations are pinned to observe and stay in their own row. This is additional evidence,
  // never a new pass condition: --commit-trailer still refuses on a red, missing or stale gate.
  const adherence = [
    ["violations", value("rule_violations_enforced")],
    ["unciteable", value("unciteable_findings_ratio")],
    ["citation-competence", value("citation_competence")],
    ["rules-active", value("rules_active")],
  ].filter(([, found]) => found !== null)

  return [
    `Quality-Gate: ${report.verdict} (${report.mode})`,
    `Metrics: ${pairs.map(([name, found]) => `${name}=${found}`).join(" ")}`,
    `Adherence: ${adherence.map(([name, found]) => `${name}=${found}`).join(" ")}`,
    `Risk-Tier: ${routing?.tier ?? "unknown"}${sampled}`,
    `Gate-Report: ${reportFile.replace(/\\/g, "/")}`,
    `Source-Hash: ${report.sourceHash ?? "unknown"}`,
  ].join("\n")
}

// ---------------------------------------------------------------------------
// PR body

function renderMetricTable(report) {
  const header = "| Metric | Value | Threshold | Status |\n|---|---|---|---|"
  const body = (report.rows ?? [])
    .map((row) => {
      if (row.status === "unavailable") return `| ${row.metric} | – | – | unavailable — ${row.reason} |`
      const bar = `${row.direction === "min" ? "≥" : "≤"} ${row.threshold}${row.ratchet ? " (ratchet)" : ""}`
      return `| ${row.metric} | ${row.value} | ${bar} | ${row.status === "fail" ? "**FAIL**" : row.status} |`
    })
    .join("\n")
  return `${header}\n${body}`
}

function blindSpotChecklist(root) {
  const text = readTextIfExists(path.join(root, REVIEW_MD))
  if (!text) {
    return [
      "- [ ] business-logic correctness — was the *right* thing built?",
      "- [ ] race conditions / concurrency",
      "- [ ] unbounded loops or slow paths that aren't N+1 shaped",
      "- [ ] authorization logic and trust boundaries",
      "- [ ] idiomatic fit with this codebase",
      `- [ ] (no ${REVIEW_MD} in this project — install it so this list reflects what actually escapes here)`,
    ].join("\n")
  }
  const section = /##+\s*Only a human sees this([\s\S]*?)(?=\n##|$)/i.exec(text)
  const source = section ? section[1] : text
  const items = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => `- [ ] ${line.slice(2)}`)
  return items.length ? items.join("\n") : "- [ ] see docs/review.md"
}

export function renderPrBody(root, { report, reportFile, routing }) {
  const template = readTextIfExists(path.join(root, "docs", "pull-request.md"))
  const rows = report.rows ?? []
  const unavailable = rows.filter((row) => row.status === "unavailable")

  const sections = [
    "## What changed and why",
    "",
    "<!-- one paragraph: the behaviour that is different now, and the reason. Not a file list. -->",
    "",
    "## Measured",
    "",
    renderMetricTable(report),
    "",
    `Report: \`${reportFile.replace(/\\/g, "/")}\` · phase \`${report.phase}\` · verdict **${report.verdict}** · source hash \`${report.sourceHash}\``,
    "",
    ...(unavailable.length
      ? [
          `> **${unavailable.length} of ${rows.length} metric(s) unavailable** — this gate measured ${rows.length - unavailable.length} rows. A green verdict here means less than it looks. Gaps: ${unavailable
            .map((row) => row.metric)
            .join(", ")}.`,
          "",
        ]
      : []),
    "## Review depth",
    "",
    `- Tier: **${routing?.tier}** — ${routing?.tierReason}`,
    `- Risk: ${routing?.risk}${routing?.riskReasons?.length ? ` (${routing.riskReasons[0]})` : ""}`,
    `- Complexity: ${routing?.complexity?.score} (${routing?.complexity?.level})${
      routing?.complexity?.reasons?.length ? ` — ${routing.complexity.reasons.join("; ")}` : ""
    }`,
    ...(routing?.sample
      ? routing.sample.empty
        ? ["- **Sampling tier with nothing to sample** — treated as full; the whole diff needs reading."]
        : [
            `- Sampled: ${routing.sample.selected.length} of ${routing.sample.total} ${routing.sample.kind} files — ${routing.sample.selected.join(", ")}`,
            ...(routing.sample.capped ? [`- **Not sampled:** ${routing.sample.total - routing.sample.cap} files rest on green metrics.`] : []),
          ]
      : []),
    "",
    "## What the gate cannot see — please read for these",
    "",
    blindSpotChecklist(root),
    "",
    "## Rollback",
    "",
    "<!-- how to undo this if it goes wrong -->",
    "",
  ]

  const body = sections.join("\n")
  const composed = template.trim() ? `${body}\n---\n\n<!-- project template: docs/pull-request.md -->\n${template}` : body
  // The body is published; a command line or env value that leaked into a detail must not travel.
  return redact(composed)
}

// ---------------------------------------------------------------------------
// cli

function runCli() {
  const args = process.argv.slice(2)
  const valueOf = (flag, fallback) => {
    const index = args.indexOf(flag)
    return index !== -1 && args[index + 1] ? args[index + 1] : fallback
  }
  const root = path.resolve(valueOf("--project", process.cwd()))
  const mode = valueOf("--mode", "full") === "local" ? "local" : "full"
  const reviewPath = valueOf("--review", null)

  const wantsTrailer = args.includes("--commit-trailer")
  const wantsPrBody = args.includes("--pr-body")
  if (!wantsTrailer && !wantsPrBody) {
    console.error("usage: harness-ship-evidence.mjs (--commit-trailer | --pr-body) [--mode full|local] [--review <path>]")
    process.exitCode = 2
    return
  }

  let checked
  try {
    checked = checkPreconditions(root, { mode, reviewPath })
  } catch (error) {
    console.error(`harness-ship-evidence could not run: ${redact(error.message)}`)
    process.exitCode = 2
    return
  }

  if (wantsTrailer && !checked.ok) {
    console.error("harness-ship-evidence: refusing to emit a commit trailer.\n")
    for (const problem of checked.problems) console.error(`  - ${redact(problem)}`)
    console.error("\nThe refusal IS the gate: fix the cause, do not hand-write the trailer.")
    process.exitCode = 1
    return
  }

  if (wantsTrailer) {
    console.log(renderTrailer(checked))
    return
  }

  if (!checked.report) {
    console.error("harness-ship-evidence: no gate report to build a PR body from. Run the gate first.")
    process.exitCode = 1
    return
  }
  // --pr-body still renders when preconditions fail: a PR that must show a red gate is exactly
  // when the body matters most. It says so at the top.
  if (!checked.ok) {
    console.log("> ⚠️ **This change does not pass the quality gate.**\n>")
    for (const problem of checked.problems) console.log(`> - ${redact(problem)}`)
    console.log("")
  }
  console.log(renderPrBody(root, checked))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli()
