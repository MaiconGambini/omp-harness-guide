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
function measurement(value, reason = "not instrumented by benchmark runner") {
  if (Number.isFinite(value)) return { value, status: "measured" }
  return { value: null, status: "unavailable", reason }
}

function loadScenarioSet(scenario) {
  const source = fs.readFileSync(scenario, "utf8")
  const parsed = JSON.parse(source)
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.scenarios)) throw new Error("scenario must be schemaVersion 1 with scenarios")
  const classes = ["simple", "medium", "full"]
  const byClass = Object.fromEntries(parsed.scenarios.map((entry) => [entry.class, entry]))
  if (classes.some((className) => !byClass[className])) throw new Error("scenario must contain simple, medium and full classes")
  return { parsed, classes, byClass }
}

export function captureBenchmark({ controls, scenario, runs = 3, output, now = () => Date.now() }) {
  if (controls !== "disabled" && controls !== "enabled") throw new Error("--controls must be disabled or enabled")
  if (!scenario || !output) throw new Error("--scenario and --output are required")
  if (!Number.isInteger(runs) || runs < 3) throw new Error("--runs must be an integer of at least 3")
  const scenarioSet = String(scenario).replaceAll("\\", "/")
  const scenarioPath = path.resolve(scenario)
  const { classes, byClass } = loadScenarioSet(scenarioPath)
  const results = {}
  for (const className of classes) {
    const definition = byClass[className]
    results[className] = []
    for (let run = 1; run <= runs; run += 1) {
      const started = now()
      const ended = now()
      const supplied = definition.measurements ?? {}
      results[className].push({
        run,
        scenarioId: definition.id,
        scenarioClass: className,
        controls,
        wallTime: measurement(Math.max(0, ended - started)),
        calls: measurement(supplied.calls),
        retries: measurement(supplied.retries),
        context: measurement(supplied.context),
        tokens: measurement(supplied.tokens),
        gateOverhead: measurement(supplied.gateOverhead),
        findings: measurement(supplied.findings),
        rework: measurement(supplied.rework),
        regressions: measurement(supplied.regressions),
      })
    }
  }
  const result = {
    schemaVersion: 1,
    kind: "harness-benchmark",
    controls,
    scenarioSet,
    scenarioSetId: loadScenarioSet(scenarioPath).parsed.scenarioSet ?? null,
    runs,
    results,
  }
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true })
  fs.writeFileSync(path.resolve(output), `${JSON.stringify(result, null, 2)}\n`, "utf8")
  return result
}

function delta(baseline, candidate) {
  if (baseline?.status !== "measured" || candidate?.status !== "measured") return { value: null, status: "unavailable", reason: "both baseline and candidate measurements required" }
  return { value: candidate.value - baseline.value, status: "measured" }
}

export function compareBenchmark(baseline, candidate) {
  if (baseline?.schemaVersion !== 1 || candidate?.schemaVersion !== 1) throw new Error("unsupported benchmark schema")
  if (baseline.scenarioSet !== candidate.scenarioSet) throw new Error("baseline and candidate scenario sets differ")
  const classes = ["simple", "medium", "full"]
  const results = {}
  for (const className of classes) {
    const left = baseline.results?.[className] ?? []
    const right = candidate.results?.[className] ?? []
    const metrics = ["wallTime", "calls", "retries", "context", "tokens", "gateOverhead", "findings", "rework", "regressions"]
    results[className] = { runs: Math.min(left.length, right.length), unavailable: [], deltas: {} }
    for (const metric of metrics) {
      const values = left.map((observation, index) => delta(observation[metric], right[index]?.[metric]))
      results[className].deltas[metric] = values
      if (values.some((value) => value.status === "unavailable")) results[className].unavailable.push(metric)
    }
  }
  return { schemaVersion: 1, kind: "harness-benchmark-comparison", scenarioSet: baseline.scenarioSet, controls: { baseline: baseline.controls, candidate: candidate.controls }, classes, results }
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
  if (command === "capture") {
    try {
      const scenario = flag(argv.slice(1), "scenario")
      const output = flag(argv.slice(1), "output")
      const result = captureBenchmark({
        controls: flag(argv.slice(1), "controls"),
        scenario,
        runs: Number(flag(argv.slice(1), "runs") ?? 3),
        output: output ? path.resolve(root, output) : undefined,
        now: () => Date.now(),
      })
      process.stdout.write(`captured ${result.controls}: ${result.runs} run(s) per class\n`)
      return 0
    } catch (error) {
      process.stderr.write(`${error.message}\n`)
      return 2
    }
  }
  if (command === "compare") {
    try {
      const baselinePath = flag(argv.slice(1), "baseline")
      const candidatePath = flag(argv.slice(1), "candidate")
      const output = flag(argv.slice(1), "output")
      if (!baselinePath || !candidatePath || !output) throw new Error("--baseline, --candidate and --output are required")
      const comparison = compareBenchmark(
        JSON.parse(fs.readFileSync(path.resolve(root, baselinePath), "utf8")),
        JSON.parse(fs.readFileSync(path.resolve(root, candidatePath), "utf8")),
      )
      fs.mkdirSync(path.dirname(path.resolve(root, output)), { recursive: true })
      fs.writeFileSync(path.resolve(root, output), `${JSON.stringify(comparison, null, 2)}\n`, "utf8")
      process.stdout.write(`compared ${comparison.controls.baseline} to ${comparison.controls.candidate}\n`)
      return 0
    } catch (error) {
      process.stderr.write(`${error.message}\n`)
      return 2
    }
  }
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
  process.stderr.write(`unknown command: ${command}. Use record | summary | capture | compare.\n`)
  return 2
}

export { main }

// fileURLToPath decodes percent-encoding + the Windows drive letter; a regex on
// URL.pathname leaves a spaced install path encoded and the guard silently false.
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (invokedDirectly) {
  process.exit(main(process.argv.slice(2), process.cwd(), new Date().toISOString()))
}
