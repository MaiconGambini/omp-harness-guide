#!/usr/bin/env node
// harness-benchmark — advisory wall-clock benchmark for the harness workflow.
//
// This is a BENCHMARK, not a quality gate. Duration never blocks a commit
// (non-goal in the plan); it exists to calibrate effort routing — is `max`
// variant on a one-file fix actually buying anything? — with evidence instead
// of a guess. It records per-phase wall-clock, call counts, agents and retries
// to `.opencode/state/benchmark.jsonl` and summarizes them on demand.
//
//   node scripts/harness-benchmark.mjs record --phase plan --ms 203 --observed-at 2026-08-25T12:49:44.572Z --basis "lifecycle history prepare entry"
//   node scripts/harness-benchmark.mjs summary        human-readable rollup
//   node scripts/harness-benchmark.mjs summary --json machine-readable rollup
//
// --observed-at <ISO> pins the record's timestamp to an explicit, validated
// canonical UTC ISO instant (e.g. the corrected lifecycle history) instead of
// "now"; it is refused with exit 2 when it is not canonical. --basis <text>
// records why/on what basis the record was taken. Both are advisory metadata.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { loadTraceIdentity } from "./harness-ship-evidence.mjs"

const BENCH_FILE = path.join(".opencode", "state", "benchmark.jsonl")

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/**
 * Validate an explicit --observed-at value: it must be a canonical UTC ISO
 * timestamp (exactly what Date.prototype.toISOString produces). Returns the
 * normalized value or null when invalid.
 */
export function validateObservedAt(value) {
  if (typeof value !== "string" || !ISO_RE.test(value)) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) || date.toISOString() !== value ? null : value
}

export function summarizeBenchmark(lines) {
  const byPhase = {}
  let totalMs = 0
  let totalCalls = 0
  let records = 0
  for (const line of lines) {
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    const phase = typeof entry.phase === "string" ? entry.phase : "unknown"
    const ms = Number.isFinite(entry.ms) ? entry.ms : 0
    const calls = Number.isFinite(entry.calls) ? entry.calls : 0
    const agents = Number.isFinite(entry.agents) ? entry.agents : 0
    const retries = Number.isFinite(entry.retries) ? entry.retries : 0
    byPhase[phase] ??= { ms: 0, calls: 0, agents: 0, retries: 0, runs: 0 }
    byPhase[phase].ms += ms
    byPhase[phase].calls += calls
    byPhase[phase].agents += agents
    byPhase[phase].retries += retries
    byPhase[phase].runs += 1
    totalMs += ms
    totalCalls += calls
    records += 1
  }
  return { records, totalMs, totalCalls, byPhase }
}

function readLines(root) {
  try {
    const content = fs.readFileSync(path.join(root, BENCH_FILE), "utf8")
    return content.split("\n").filter((line) => line.trim())
  } catch {
    return []
  }
}

function flag(argv, name) {
  const index = argv.indexOf(`--${name}`)
  return index !== -1 ? argv[index + 1] : undefined
}

function recordEntry(root, argv, nowIso) {
  const observedAt = flag(argv, "observed-at")
  const at = observedAt ? validateObservedAt(observedAt) : nowIso
  if (observedAt && !at) throw new Error(`invalid --observed-at (must be a canonical UTC ISO timestamp): ${observedAt}`)
  const entry = {
    at,
    phase: flag(argv, "phase") ?? "unknown",
    ms: Number(flag(argv, "ms") ?? 0),
    calls: Number(flag(argv, "calls") ?? 0),
    agents: Number(flag(argv, "agents") ?? 0),
    retries: Number(flag(argv, "retries") ?? 0),
    variant: flag(argv, "variant") ?? null,
    basis: flag(argv, "basis") ?? null,
  }
  // T03: bind the advisory record to the canonical trace identity when a PREVC lifecycle
  // exists, so the benchmark log joins the trace stream (cross-store join). Without a
  // lifecycle the record stays unbound — a named gap in verifyTraceJoin, never a guess.
  const resolved = loadTraceIdentity(root)
  if (resolved.ok) {
    entry.trace_id = resolved.identity.traceId
    entry.run_id = resolved.identity.runId
    entry.session_id = resolved.identity.sessionId
  }
  const dir = path.join(root, path.dirname(BENCH_FILE))
  fs.mkdirSync(dir, { recursive: true })
  fs.appendFileSync(path.join(root, BENCH_FILE), `${JSON.stringify(entry)}\n`, "utf8")
  return entry
}

function renderSummary(summary) {
  const out = [`benchmark — ${summary.records} record(s), ${summary.totalMs} ms total, ${summary.totalCalls} calls`, ""]
  const phases = Object.entries(summary.byPhase).sort((a, b) => b[1].ms - a[1].ms)
  for (const [phase, s] of phases) {
    out.push(`  ${phase.padEnd(12)} ${String(s.ms).padStart(8)} ms  ${String(s.calls).padStart(4)} calls  ${s.agents} agents  ${s.retries} retries  (${s.runs} run/s)`)
  }
  if (phases.length === 0) out.push("  no records yet — advisory only, nothing to report")
  return out.join("\n")
}

function main(argv, root, nowIso) {
  const command = argv[0]
  if (command === "record") {
    let entry
    try {
      entry = recordEntry(root, argv.slice(1), nowIso)
    } catch (error) {
      process.stderr.write(`${error.message}\n`)
      return 2
    }
    process.stdout.write(`recorded ${entry.phase}: ${entry.ms} ms, ${entry.calls} calls\n`)
    return 0
  }
  if (command === "summary" || command === undefined) {
    const summary = summarizeBenchmark(readLines(root))
    if (argv.includes("--json")) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    else process.stdout.write(`${renderSummary(summary)}\n`)
    return 0
  }
  process.stderr.write(`unknown command: ${command}. Use record | summary.\n`)
  return 2
}

// fileURLToPath decodes percent-encoding + the Windows drive letter; a regex on
// URL.pathname leaves a spaced install path encoded and the guard silently false.
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (invokedDirectly) {
  process.exit(main(process.argv.slice(2), process.cwd(), new Date().toISOString()))
}
