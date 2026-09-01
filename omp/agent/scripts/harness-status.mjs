// Guardrails v2 (spec 2026-08-31-1317) adds four DERIVED OBSERVABILITY surfaces — score,
// fallback events, capabilities, and the red-team quickcheck row — each degrading to a
// named `unavailable` marker when its artifact is missing (never invented values), and
// each informational only: like a missing gate in early phases, a missing derived
// artifact does not flip the overall status (no false WARN on a fresh repo).
//
// The whole composition is exported and injectable (runGit / sourceHash) so the WARN and
// gaps[] contract is testable without shelling out. CLI flags are unchanged: --json
// (default), --markdown, --exit-code (non-PASS -> exit 1; kept for CI).

import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"
import { cursorRoot, globalOpenCodeRoot, pathExists } from "./harness-common.mjs"
import { checkReportShape, makeGit, readJsonIfExists, REPORT_DIR, sourceHash } from "./harness-quality-core.mjs"
import { HANDOFF_PATH, inspectState, latestFullGateReport, PHASES } from "./harness-prevc-state.mjs"
// The whole composition is exported and injectable (runGit / sourceHash) so the WARN and
// gaps[] contract is testable without shelling out. CLI flags are unchanged: --json
// (default), --markdown, --exit-code (non-PASS -> exit 1; kept for CI).

function defaultRunGit(root, args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim()
  } catch {
    return "unavailable"
  }
}

// Freshness parity (live-smoke finding): the current-tree hash MUST come from
// harness-quality-core's sourceHash — the exact algorithm and GATE_ARTIFACTS exclusion
// set the gate itself used when it stamped the report. Operational artifacts the lifecycle
// writes after the gate (quality reports, reviews, findings, state transitions, judge
// receipts, the session handoff) must never make a green gate read stale.
function defaultSourceHash(root) {
  try {
    return sourceHash(root, { git: makeGit(root), fresh: true })
  } catch {
    return null
  }
}
// ---------------------------------------------------------------------------
// Guardrails v2 observability surfaces (informational; named gaps, never invented)

const SCORE_ARTIFACT = path.join("docs", "harness", "quality", "aggregate.json")
const FALLBACK_ARTIFACT = path.join("docs", "harness", "quality", "fallback-events.json")
const CAPABILITIES_ARTIFACT = path.join("docs", "harness", "capabilities.json")

export function readScoreSurface(root) {
  const data = readJsonIfExists(path.join(root, SCORE_ARTIFACT))
  if (!data) return { status: "unavailable", reason: `no ${SCORE_ARTIFACT.replace(/\\/g, "/")} — run harness-score.mjs` }
  if (typeof data.score !== "number") return { status: "unavailable", reason: "aggregate.json carries no numeric score" }
  return {
    status: "ok",
    score: data.score,
    updatedAt: data.updatedAt ?? null,
    historyEntries: Array.isArray(data.history) ? data.history.length : 0,
    available: typeof data.available === "number" ? data.available : null,
    total: typeof data.total === "number" ? data.total : null,
    coverage: typeof data.coverage === "number" ? data.coverage : null,
    gaps: Array.isArray(data.gaps) ? data.gaps : [],
  }
}

export function readFallbackSurface(root) {
  const data = readJsonIfExists(path.join(root, FALLBACK_ARTIFACT))
  if (!data) return { status: "unavailable", reason: `no ${FALLBACK_ARTIFACT.replace(/\\/g, "/")} — no fallback events recorded` }
  const events = Array.isArray(data.events) ? data.events : []
  return {
    status: "ok",
    total: events.length,
    last: events.length ? events[events.length - 1] : null,
  }
}

export function readCapabilitiesSurface(root) {
  const data = readJsonIfExists(path.join(root, CAPABILITIES_ARTIFACT))
  if (!data) return { status: "unavailable", reason: `no ${CAPABILITIES_ARTIFACT.replace(/\\/g, "/")} — run harness-capability-check.mjs` }
  return {
    status: "ok",
    source: data.source ?? "unknown",
    cached: Boolean(data.cached),
    models: (data.models ?? []).map((model) => `${model.id}:${(model.input ?? []).join("+")}`),
  }
}

export function readRedteamSurface(root, gateReport) {
  const rows = Array.isArray(gateReport?.rows) ? gateReport.rows : []
  const row = rows.find((entry) => entry?.metric === "redteam_quickcheck")
  if (!row) return { status: "unavailable", reason: "newest full gate report has no redteam_quickcheck row" }
  return { status: "ok", state: row.status, value: row.value ?? null }
}

export function composeStatus(root = process.cwd(), deps = {}) {
  const runGit = deps.runGit ?? defaultRunGit
  const currentSourceHash = deps.sourceHash ?? defaultSourceHash

  const status = { status: "PASS" }
  const gaps = []
  const warn = (gap) => {
    gaps.push(gap)
    status.status = "WARN"
  }
  const hasHarness = pathExists(path.join(root, "agent-os")) || pathExists(path.join(root, "docs", "harness"))

  status.branch = runGit(root, ["branch", "--show-current"])
  status.dirtyState = runGit(root, ["status", "--short"])
  if (status.branch === "unavailable" || status.dirtyState === "unavailable") {
    // Fail closed: a tree whose git state cannot be read is never a clean tree.
    warn("git: git errored — branch/dirty state unavailable; an unreadable git state is never a clean tree")
  } else if (status.dirtyState) {
    const entries = status.dirtyState.split("\n").filter(Boolean).length
    warn(`git: working tree has uncommitted changes (${entries} entr${entries === 1 ? "y" : "ies"})`)
  }

  const inspected = (deps.inspectState ?? inspectState)(root)
  let phase = "unknown"
  if (!inspected.ok) {
    status.prevcPhase = "unknown"
    if (hasHarness) warn(`prevc-state: ${inspected.reason}`)
  } else {
    phase = inspected.state.phase
    status.prevcPhase = phase
    status.prevc = {
      phase,
      risk: inspected.state.risk,
      blocker: inspected.state.blocker,
      gateSourceHash: inspected.state.gateSourceHash,
      judgeReceiptPath: inspected.state.judgeReceiptPath,
      operatorDecision: inspected.state.operatorDecision,
      updatedAt: inspected.state.updatedAt,
    }
    if (!PHASES.includes(phase)) {
      if (hasHarness) warn(`prevc-state: unknown phase ${JSON.stringify(phase)}`)
    } else if (phase === "blocked" && hasHarness) {
      warn(`prevc-state: phase blocked — ${inspected.state.blocker ?? "no blocker text recorded"}`)
    }
  }

  const gate = (deps.latestFullGateReport ?? latestFullGateReport)(root)
  let parsedReport = null
  if (gate === null) {
    status.gate = { status: "none" }
    // P1 (quality review): a lifecycle that is PAST validate without any full-mode gate
    // report is a false green — Judge cannot have accepted, Refine cannot have run, the
    // operator cannot have confirmed. Only the pre-gate phases may legitimately have no
    // report. `blocked` is included: a blocked lifecycle whose gate evidence cannot be
    // seen is never a clean status, and the phase itself already forces WARN.
    const gateRequiredPhases = new Set(["judge", "refine", "awaiting_confirmation", "revision_requested", "blocked", "complete"])
    if (hasHarness && gateRequiredPhases.has(phase)) {
      warn(
        `gate: no full-mode gate report in ${REPORT_DIR.replace(/\\/g, "/")} while phase is ${phase} — a post-validate phase without a measured gate is never green; run the gate at --mode full`,
      )
    }
  } else if (gate.malformed) {
    status.gate = { status: "unreadable", file: gate.file, reason: gate.reason }
    if (hasHarness) warn(`gate: newest full report is unreadable — ${gate.reason}`)
  } else {
    const { report, file } = gate
    const failRows = Array.isArray(report.rows) ? report.rows.filter((row) => row?.status === "fail") : []
    parsedReport = report
    const red = report.verdict !== "pass" || failRows.length > 0
    status.gate = {
      status: red ? "red" : "green",
      file,
      verdict: report.verdict,
      sourceHash: report.sourceHash ?? null,
      timestamp: report.timestamp ?? null,
    }
    if (red) {
      const where = failRows.length
        ? ` failing rows: ${failRows.map((row) => `${row.metric} (${row.value} > ${row.threshold})`).join(", ")}`
        : ` verdict: ${report.verdict}`
      if (hasHarness) warn(`gate: newest full report ${String(file).replace(/\\/g, "/")} is RED —${where}`)
    } else {
      const credible = checkReportShape(report).credible
      if (!report.sourceHash) {
        if (hasHarness) warn(`gate: newest full report ${String(file).replace(/\\/g, "/")} is green but carries no source hash — freshness cannot be verified`)
      } else {
        const current = currentSourceHash(root)
        if (credible && current !== null && current !== report.sourceHash) {
          status.gate.status = "stale"
          if (hasHarness) warn(`gate: newest full report ${String(file).replace(/\\/g, "/")} is stale — report sourceHash ${report.sourceHash} != current tree hash ${current}; re-run the gate at --mode full`)
        } else if (credible && current === null) {
          // Fail closed: a green report whose freshness cannot be checked is not a green.
          status.gate.status = "unverifiable"
          if (hasHarness) warn(`gate: newest full report ${String(file).replace(/\\/g, "/")} is green but its freshness cannot be verified — the current tree hash is unavailable; never green without a verified match`)
        } else if (!credible) {
          status.gate.status = "stale"
          if (hasHarness) warn(`gate: newest full report ${String(file).replace(/\\/g, "/")} is green but not credible (${checkReportShape(report).reason})`)
        }
      }
    }
  }

  status.handoffExists = pathExists(path.join(root, HANDOFF_PATH))
  if (hasHarness && (phase === "awaiting_confirmation" || phase === "complete") && !status.handoffExists) {
    warn(`handoff: ${HANDOFF_PATH.replace(/\\/g, "/")} is missing while phase is ${phase}`)
  }
  // Guardrails v2 derived observability — informational fields with named gaps.
  status.score = readScoreSurface(root)
  status.fallbackEvents = readFallbackSurface(root)
  status.capabilities = readCapabilitiesSurface(root)
  status.redteam = readRedteamSurface(root, parsedReport)

  status.globalOpenCodeConfigExists = pathExists(path.join(globalOpenCodeRoot(), "opencode.jsonc"))
  status.globalCursorExists = pathExists(cursorRoot())
  status.securityScanCommand = "node .opencode/scripts/harness-security-scan.mjs"
  status.contextBudgetCommand = "node .opencode/scripts/harness-context-budget.mjs"
  status.globalSecurityScanCommand = `node ${path.join(globalOpenCodeRoot(), "scripts", "harness-security-scan.mjs")}`
  status.gaps = gaps
  return status
}

// Finding-4: argv flags. --json (default) keeps the JSON block; --markdown emits
// a Markdown status block; --exit-code opts into the non-PASS -> exitCode=1 gate.
function renderMarkdown(statusReport) {
  const rows = Object.entries(statusReport)
    .filter(([key]) => key !== "status" && key !== "gaps")
    .map(([key, value]) => `| ${key} | ${JSON.stringify(value)} |`)
  const gapsRows = (statusReport.gaps ?? []).length
    ? ["", "## Gaps", ...statusReport.gaps.map((gap) => `- ${gap}`)]
    : []
  return [
    `## Harness Status: ${statusReport.status}`,
    "",
    "| field | value |",
    "| --- | --- |",
    ...rows,
    ...gapsRows,
  ].join("\n")
}

// Auto-run only when invoked directly; stays silent when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const statusArgs = process.argv.slice(2)
  const report = composeStatus(process.cwd())
  if (statusArgs.includes("--markdown")) console.log(renderMarkdown(report))
  else console.log(JSON.stringify(report, null, 2))

  // Keep prior behavior: still set exitCode on non-PASS even without the flag.
  if (statusArgs.includes("--exit-code") || report.status !== "PASS") {
    if (report.status !== "PASS") process.exitCode = 1
  }
}
