// harness-fallback-log — provider fallback event log (R7, persistence half).
//
// Appends, reads, and prunes provider-fallback events in
// `docs/harness/quality/fallback-events.json` ({schemaVersion:1, events: [...]}).
// Events are DATA, not policy: this script contains no retry logic. The scheduler-level
// re-dispatch policy lives in agent/scheduler.md + agent/spec-lead.md (OpenCode) and
// the harness-omp skills + prevc.md (OMP) — exactly one bounded retry on the alternate
// allowed model (deepseek-v4-flash <-> glm-5.3-flash), never for the spec-lead/scheduler
// (alert only), chain exhaustion -> `blocked: provider-fallback-exhausted` with
// operator escalation.
//
// Event shape (validated on --record): {ts?, lane, from_model, to_model, reason,
// task_id, alert?}. Malformed JSON or a missing required field refuses with a non-zero
// exit and writes nothing.
//
// The file sits in docs/harness/quality/, which is excluded from the gate's source
// hash — recorded events can never forge thresholds.

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { readJsonIfExists } from "./harness-quality-core.mjs"

export const EVENTS_PATH = path.join("docs", "harness", "quality", "fallback-events.json")
export const PRUNE_AFTER_DAYS = 90
const REQUIRED_FIELDS = ["lane", "from_model", "to_model", "reason", "task_id"]

export function loadEvents(root) {
  const data = readJsonIfExists(path.join(root, EVENTS_PATH))
  if (!data) return { schemaVersion: 1, events: [] }
  if (data.schemaVersion !== 1 || !Array.isArray(data.events)) {
    throw new Error(`${EVENTS_PATH.replace(/\\/g, "/")} is not a schemaVersion:1 events file`)
  }
  return data
}

export function writeEvents(root, data) {
  const target = path.join(root, EVENTS_PATH)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`, "utf8")
}

export function validateEvent(input) {
  let event
  try {
    event = JSON.parse(input)
  } catch (error) {
    return { ok: false, reason: `event is not parseable JSON (${error.message})` }
  }
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    return { ok: false, reason: "event must be a JSON object" }
  }
  for (const field of REQUIRED_FIELDS) {
    if (typeof event[field] !== "string" || !event[field].trim()) {
      return { ok: false, reason: `event field ${JSON.stringify(field)} is required and must be a non-empty string` }
    }
  }
  const normalized = {
    ts: typeof event.ts === "string" && event.ts ? event.ts : new Date().toISOString(),
    lane: event.lane,
    from_model: event.from_model,
    to_model: event.to_model,
    reason: event.reason,
    task_id: event.task_id,
    alert: event.alert === true,
  }
  return { ok: true, event: normalized }
}

export function recordEvent(root, input) {
  const validated = validateEvent(input)
  if (!validated.ok) return { ok: false, reason: validated.reason }
  const data = loadEvents(root)
  data.events.push(validated.event)
  writeEvents(root, data)
  return { ok: true, event: validated.event, total: data.events.length }
}

export function pruneEvents(root, { now = new Date() } = {}) {
  const data = loadEvents(root)
  const cutoff = now.getTime() - PRUNE_AFTER_DAYS * 86_400_000
  const before = data.events.length
  data.events = data.events.filter((event) => {
    const ts = new Date(event.ts)
    return Number.isNaN(ts.getTime()) ? false : ts.getTime() >= cutoff
  })
  if (data.events.length !== before) writeEvents(root, data)
  return { removed: before - data.events.length, remaining: data.events.length }
}

function runCli() {
  const args = process.argv.slice(2)
  const valueOf = (flag) => {
    const index = args.indexOf(flag)
    return index !== -1 && args[index + 1] ? args[index + 1] : null
  }
  const root = path.resolve(valueOf("--root") ?? process.cwd())

  if (args.includes("--record")) {
    const input = valueOf("--record")
    if (!input) {
      console.error("harness-fallback-log: --record requires a JSON event argument")
      process.exitCode = 1
      return
    }
    try {
      const result = recordEvent(root, input)
      if (!result.ok) {
        console.error(`harness-fallback-log: ${result.reason}`)
        process.exitCode = 1
        return
      }
      console.log(JSON.stringify({ recorded: result.event, total: result.total }, null, 2))
    } catch (error) {
      console.error(`harness-fallback-log: ${error.message}`)
      process.exitCode = 1
    }
    return
  }

  if (args.includes("--prune")) {
    try {
      const result = pruneEvents(root)
      console.log(JSON.stringify(result, null, 2))
    } catch (error) {
      console.error(`harness-fallback-log: ${error.message}`)
      process.exitCode = 1
    }
    return
  }

  // default / --read
  try {
    const data = loadEvents(root)
    const recent = [...data.events].sort((a, b) => (a.ts < b.ts ? 1 : -1)).slice(0, 20)
    console.log(JSON.stringify({ schemaVersion: data.schemaVersion, total: data.events.length, recent }, null, 2))
  } catch (error) {
    console.error(`harness-fallback-log: ${error.message}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli()
