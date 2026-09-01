// harness-trace — shared redacted trace contract (T01, spec R3).
//
// A versioned, redacted, bounded JSONL event stream at
// `docs/harness/traces/trace.jsonl` that can reconstruct one trace across session,
// run, lane/task, tool call, PREVC phase, gate, findings, review, Judge, handoff,
// and model records. This module is the CONTRACT half: it validates, redacts, and
// persists events and verifies their integrity. Runtime adapters (T03 OpenCode,
// T04 OMP) are separate lanes that emit into this stream; this module contains no
// runtime hook and never invents runtime data.
//
// Contract guarantees:
//  1. Stable IDs — trace/run/session IDs and the entity/parent links are validated
//     at append time; malformed or missing correlation IDs refuse the event.
//  2. Redaction BEFORE persistence — every string passes the shared canonical
//     redaction (`harness-quality-core.redact`); prompt-ish fields and oversized
//     values are truncated with an explicit marker, so planted secrets, prompts,
//     and oversized values never reach the file.
//  3. Bounded append — MAX_EVENTS / MAX_BYTES caps refuse appends with an explicit
//     reason; per-record field/array/depth caps keep every record bounded.
//  4. Integrity — a SHA-256 hash chain (`prev_hash` -> `hash`) over the canonical
//     stable stringify of each record; `--verify` detects unparseable lines, chain
//     breaks, hash mismatches, and truncated writes; a corrupt stream refuses
//     further appends and pruning instead of silently extending it.
//  5. Retention — `--prune` drops events older than RETENTION_DAYS and re-chains
//     the survivors deterministically.
//  6. Unavailable semantics — model usage/cost/context are persisted as
//     `{available:false, reason}` when the runtime did not supply them. Missing
//     data is NEVER represented as zero or an inferred value; a measured zero is
//     only accepted when explicitly supplied.
//
// Derived audit evidence: the stream is audit evidence only after `--verify`
// passes; diagnostic activity logs remain diagnostic. The file lives in
// `docs/harness/traces/` (outside the gate's source hash), so trace records can
// never forge thresholds.
//
// CLI: --record <json> | --verify | --read [--limit N] | --prune  (--root <dir>)

import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { redact, stableStringify } from "./harness-quality-core.mjs"
import { MIN_BEARER_TOKEN_LEN, SK_TOKEN_PATTERN } from "./harness-common.mjs"

export const SCHEMA_VERSION = 1
export const TRACE_PATH = path.join("docs", "harness", "traces", "trace.jsonl")
// Cross-process writer lock for the stream (spec R3): parallel OMP agents share
// one trace file, so the read-check-hash-append critical section must be mutex'd
// across processes or two writers can read the same tail and both append records
// with the same prev_hash, breaking the chain. The lock file sits next to the
// stream and is removed in `finally`; `--verify` stays read-only and never locks.
export const TRACE_LOCK_PATH = `${TRACE_PATH}.lock`
export const MAX_EVENTS = 10_000
export const MAX_BYTES = 5 * 1024 * 1024 // 5 MiB, matching the tool-activity diagnostic cap
export const RETENTION_DAYS = 90
export const MAX_FIELD_CHARS = 2000
export const PROMPT_MAX_CHARS = 500
export const MAX_ARRAY_ITEMS = 100
export const MAX_DEPTH = 8

export const ENTITY_TYPES = [
  "session",
  "run",
  "lane",
  "tool",
  "phase",
  "gate",
  "finding",
  "review",
  "judge",
  "handoff",
  "model",
]

// Stable correlation IDs: 3-192 chars of [A-Za-z0-9._:-], never starting with a
// separator, no whitespace, no path separators — safe for JSON, logs, and file names.
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,191}$/
export function validateId(id) {
  return typeof id === "string" && ID_PATTERN.test(id)
}

// Prompt-bearing field names get a tighter cap so prompt bodies never persist whole.
const PROMPT_FIELD = /^(?:prompt|input|output|result|query|body|content|transcript|tool_input|tool_output|.*prompt)$/i

export function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(16).toString("hex")}`
}

// ---------------------------------------------------------------------------
// unavailable semantics — missing runtime data is explicit, never zero/inferred

const unavailable = (reason) => ({ available: false, reason })

function normalizeCounters(value, fields, label) {
  if (value === undefined || value === null) return null
  if (typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  if (value.available === false) {
    return unavailable(typeof value.reason === "string" && value.reason.trim() ? value.reason : "unavailable")
  }
  const out = { available: true }
  for (const field of fields) {
    if (value[field] !== undefined && value[field] !== null) {
      if (typeof value[field] !== "number" || !Number.isFinite(value[field]) || value[field] < 0) {
        throw new Error(`${label}.${field} must be a finite non-negative number`)
      }
      out[field] = value[field]
    }
  }
  if (Object.keys(out).length === 1) return unavailable(`${label}-counters-not-supplied`)
  return out
}

export function normalizeUsage(value) {
  return normalizeCounters(value, ["input_tokens", "output_tokens", "total_tokens", "context_window"], "usage")
}

export function normalizeCost(value) {
  const base = normalizeCounters(value, ["usd"], "cost")
  if (base === null) return unavailable("not-supplied")
  return base
}

export function normalizeContext(value) {
  return normalizeCounters(value, ["window_tokens", "used_tokens", "percent"], "context")
}

// Trace-grade redaction: the shared canonical composition
// (`harness-quality-core.redact` -> `harness-common.redactSensitiveText`) runs its
// key/value pattern BEFORE the global bearer/sk patterns, so the prose shape
// `Authorization: Bearer <token>` loses its prefix first and the token itself
// survives. Structured trace records persist JSON, where a leaked token is a
// permanent record — so the credential-global patterns run FIRST here (same
// shared length thresholds), then the canonical composition, then whole private
// key blocks. Redaction precedes persistence and hashing.
function redactTraceText(text) {
  const bearer = new RegExp(`bearer\\s+[a-z0-9._-]{${MIN_BEARER_TOKEN_LEN},}`, "gi")
  const sk = new RegExp(SK_TOKEN_PATTERN, "gi")
  // credential globals run on the RAW text first — after the key/value pattern
  // consumed the "Bearer " prefix, the token itself would survive
  const credentialFirst = text
    .replace(bearer, "Bearer [REDACTED]")
    .replace(sk, "sk-[REDACTED]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gi, "-----BEGIN [REDACTED]-----")
  return redact(credentialFirst)
}

// Recursively redact every string with the shared canonical redaction, then cap:
//   - prompt-ish fields at PROMPT_MAX_CHARS,
//   - every other string at MAX_FIELD_CHARS,
//   - arrays at MAX_ARRAY_ITEMS, object depth at MAX_DEPTH.
// Truncation is explicit: the value is replaced with its bounded prefix plus a
// deterministic `[truncated:<original length>]` marker.
function sanitizeValue(value, { depth = 0, key = "" } = {}) {
  if (depth > MAX_DEPTH) return `[depth-capped:${depth}]`
  if (typeof value === "string") {
    const redacted = redactTraceText(value)
    const max = PROMPT_FIELD.test(key) ? PROMPT_MAX_CHARS : MAX_FIELD_CHARS
    if (redacted.length > max) return `${redacted.slice(0, max)}[truncated:${redacted.length}]`
    return redacted
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) {
      return [...value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeValue(item, { depth: depth + 1, key })), `[array-truncated:${value.length}]`]
    }
    return value.map((item) => sanitizeValue(item, { depth: depth + 1, key }))
  }
  if (value !== null && typeof value === "object") {
    const out = {}
    for (const [childKey, child] of Object.entries(value)) out[childKey] = sanitizeValue(child, { depth: depth + 1, key: childKey })
    return out
  }
  return value
}

// ---------------------------------------------------------------------------
// event validation + normalization

// Validates a JSON event string and returns the normalized, redacted record
// (without chain fields — those are computed at append). Refusals carry a reason.
export function normalizeEvent(json, { now = new Date() } = {}) {
  let input
  try {
    input = JSON.parse(json)
  } catch (error) {
    return { ok: false, reason: `event is not parseable JSON (${error.message})` }
  }
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "event must be a JSON object" }
  }
  try {
    for (const field of ["trace_id", "run_id", "session_id"]) {
      if (!validateId(input[field])) {
        return { ok: false, reason: `event field ${field} must be a stable id (3-192 chars of [A-Za-z0-9._:-], no leading separator)` }
      }
    }
    const eventId = input.event_id === undefined ? newId("evt") : input.event_id
    if (!validateId(eventId)) {
      return { ok: false, reason: "event field event_id must be a stable id" }
    }

    const entity = input.entity
    if (entity === null || typeof entity !== "object" || Array.isArray(entity) || !ENTITY_TYPES.includes(entity.type) || !validateId(entity.id)) {
      return { ok: false, reason: `entity must be {type, id} with type in [${ENTITY_TYPES.join(", ")}] and a stable id` }
    }

    let parent = null
    if (input.parent !== undefined && input.parent !== null) {
      if (typeof input.parent !== "object" || Array.isArray(input.parent) || !ENTITY_TYPES.includes(input.parent.type) || !validateId(input.parent.id)) {
        return { ok: false, reason: "parent must be null or {type, id} with a known entity type and a stable id" }
      }
      if (input.parent.type === entity.type && input.parent.id === entity.id) {
        return { ok: false, reason: "parent must not self-reference the entity" }
      }
      parent = { type: input.parent.type, id: input.parent.id }
    }

    const tsDate = input.ts ? new Date(input.ts) : new Date(now)
    if (Number.isNaN(tsDate.getTime())) return { ok: false, reason: "event ts must be a parseable date" }

    let error = null
    if (input.error !== undefined && input.error !== null) {
      if (typeof input.error !== "object" || Array.isArray(input.error)) return { ok: false, reason: "error must be an object or null" }
      error = sanitizeValue(input.error)
      error.type = typeof input.error.type === "string" ? input.error.type.slice(0, 64) : "unknown"
    }

    let model = null
    if (input.model !== undefined && input.model !== null) {
      if (typeof input.model !== "object" || Array.isArray(input.model)) return { ok: false, reason: "model must be an object or null" }
      model = sanitizeValue({
        provider: typeof input.model.provider === "string" ? input.model.provider.slice(0, 128) : null,
        name: typeof input.model.name === "string" ? input.model.name.slice(0, 128) : null,
        variant: typeof input.model.variant === "string" ? input.model.variant.slice(0, 128) : null,
      })
    }

    let data = {}
    if (input.data !== undefined && input.data !== null) {
      data = sanitizeValue(input.data)
      if (typeof data !== "object" || Array.isArray(data)) return { ok: false, reason: "data must be an object or null" }
    }

    const usage = normalizeUsage(input.usage) ?? unavailable("not-supplied")
    const cost = normalizeCost(input.cost) ?? unavailable("not-supplied")
    const context = normalizeContext(input.context) ?? unavailable("not-supplied")

    return {
      ok: true,
      event: {
        schemaVersion: SCHEMA_VERSION,
        event_id: eventId,
        ts: tsDate.toISOString(),
        trace_id: input.trace_id,
        run_id: input.run_id,
        session_id: input.session_id,
        entity,
        parent,
        kind: typeof input.kind === "string" ? input.kind.slice(0, 64) : "record",
        outcome: typeof input.outcome === "string" ? input.outcome.slice(0, 32) : null,
        error,
        model,
        usage,
        cost,
        context,
        data,
      },
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

// ---------------------------------------------------------------------------
// hash chain

const HASH_PREFIX = "sha256:"
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/

function hashRecord(record) {
  const { hash, ...rest } = record // the hash never participates in its own digest
  return crypto.createHash("sha256").update(stableStringify(rest)).digest("hex")
}

// ---------------------------------------------------------------------------
// durable writer — bounded append

export function readTrace(root) {
  const target = path.join(root, TRACE_PATH)
  if (!fs.existsSync(target)) return { records: [], errors: [] }
  const text = fs.readFileSync(target, "utf8")
  const records = []
  const errors = []
  const lines = text.split("\n")
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineNo = index + 1
    if (!line.trim()) {
      if (index < lines.length - 1) errors.push({ line: lineNo, reason: "blank line" })
      continue
    }
    let record
    try {
      record = JSON.parse(line)
    } catch (error) {
      errors.push({ line: lineNo, reason: `unparseable line (${error.message})` })
      continue
    }
    // The stream only ever holds records written by appendEvent/pruneTrace.
    // A line that parses but is not such a record is corruption, not a crash:
    // entity shape feeds correlate, hash shape feeds the chain and the append
    // tail — reject foreign shapes here so verify/append/prune surface them as
    // structured errors instead of dereferencing undefined.
    if (record === null || typeof record !== "object" || Array.isArray(record)) {
      errors.push({ line: lineNo, reason: "record must be a JSON object" })
      continue
    }
    const entity = record.entity
    if (entity === null || typeof entity !== "object" || Array.isArray(entity) || typeof entity.type !== "string" || typeof entity.id !== "string") {
      errors.push({ line: lineNo, reason: "record is not a trace event (entity must be {type, id} with string values)" })
      continue
    }
    if (typeof record.hash !== "string" || !HASH_PATTERN.test(record.hash)) {
      errors.push({ line: lineNo, reason: "record is not a trace event (hash must be a sha256:<64 hex> string)" })
      continue
    }
    records.push(record)
  }
  return { records, errors }
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

// ---------------------------------------------------------------------------
// cross-process writer lock

// The lock is an exclusive-creation lock file next to the stream: openSync with
// "wx" (O_CREAT|O_EXCL) is atomic on Windows and POSIX, so only one writer can
// ever own it. Acquisition retries a bounded number of times with a bounded
// sleep; a lock that has not been touched for STALE_LOCK_MS is reclaimed
// conservatively (never a fresh lock), and the reclaim is named in the new lock
// owner payload. The owner payload (pid/reason/ts) is advisory — the exclusive
// file itself is the lock.
const LOCK_RETRIES = 40
const LOCK_RETRY_MS = 20
const STALE_LOCK_MS = 30_000
const lockSleep = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_RETRY_MS)

function acquireTraceLock(root, reason) {
  const lockTarget = path.join(root, TRACE_LOCK_PATH)
  fs.mkdirSync(path.dirname(lockTarget), { recursive: true })
  let reclaimed = false
  for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
    try {
      const fd = fs.openSync(lockTarget, "wx")
      try {
        const owner = { pid: process.pid, reason, ts: new Date().toISOString() }
        if (reclaimed) owner.reclaimed = `stale-lock: lock untouched for more than ${STALE_LOCK_MS}ms`
        fs.writeSync(fd, JSON.stringify(owner))
      } catch {
        // owner info is advisory; the exclusive file itself is the lock
      }
      fs.closeSync(fd)
      return { acquired: true, lockTarget }
    } catch (error) {
      if (error.code !== "EEXIST") throw error
      try {
        const stat = fs.statSync(lockTarget)
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          // conservative reclaim: only a lock untouched past the age threshold
          fs.unlinkSync(lockTarget)
          reclaimed = true
          continue
        }
        reclaimed = false
      } catch {
        reclaimed = false // lock vanished between EEXIST and stat — retry the loop
      }
    }
    if (attempt < LOCK_RETRIES - 1) lockSleep()
  }
  return { acquired: false, lockTarget }
}

function releaseTraceLock(lockTarget) {
  try {
    fs.unlinkSync(lockTarget)
  } catch {
    // already gone — nothing to release
  }
}

// Validates and appends one event. Bounds refuse the append with an explicit
// reason; a corrupt existing stream refuses instead of extending it. The whole
// read-check-hash-append section runs under the cross-process writer lock so two
// parallel agents can never compute the same prev_hash; if the lock cannot be
// acquired the append fails closed with an explicit concurrent-writer refusal.
export function appendEvent(root, json, { now = new Date(), maxEvents = MAX_EVENTS, maxBytes = MAX_BYTES } = {}) {
  const capEvents = clamp(Number.isFinite(maxEvents) ? maxEvents : MAX_EVENTS, 1, 1_000_000)
  const capBytes = clamp(Number.isFinite(maxBytes) ? maxBytes : MAX_BYTES, 1, 64 * 1024 * 1024)

  const validated = normalizeEvent(json, { now })
  if (!validated.ok) return { ok: false, reason: validated.reason }

  const lock = acquireTraceLock(root, "append")
  if (!lock.acquired) {
    return { ok: false, reason: "append refused: concurrent writer holds the trace lock; retry" }
  }
  try {
    const current = readTrace(root)
    if (current.errors.length > 0) {
      return { ok: false, reason: `append refused: trace is corrupt (${current.errors.length} bad line(s)); run --verify before appending` }
    }

    const target = path.join(root, TRACE_PATH)
    if (current.records.length >= capEvents) {
      return { ok: false, reason: `append refused: event cap reached (${current.records.length} >= ${capEvents})` }
    }

    const prevHash = current.records.length > 0 ? `${HASH_PREFIX}${current.records[current.records.length - 1].hash.replace(/^sha256:/, "")}` : null
    const record = { ...validated.event, prev_hash: prevHash }
    const hash = hashRecord(record)
    const line = `${JSON.stringify({ ...record, hash: `${HASH_PREFIX}${hash}` })}\n`

    const existingBytes = fs.existsSync(target) ? fs.statSync(target).size : 0
    const lineBytes = Buffer.byteLength(line, "utf8")
    if (existingBytes + lineBytes > capBytes) {
      return { ok: false, reason: `append refused: byte cap would be exceeded (${existingBytes + lineBytes} > ${capBytes})` }
    }

    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.appendFileSync(target, line, "utf8")
    return { ok: true, event: { ...record, hash: `${HASH_PREFIX}${hash}` }, total: current.records.length + 1, bytes: existingBytes + lineBytes }
  } finally {
    releaseTraceLock(lock.lockTarget)
  }
}

// ---------------------------------------------------------------------------
// correlation / join rules

// Builds the join index: one entry per trace with the unique entity ids grouped by
// entity type, plus every parent link that does not resolve to an entity in the
// stream (a correlation gap — surfaced, never silently dropped).
export function correlate(records) {
  const traces = {}
  const seenEntities = new Set()
  for (const record of records) {
    seenEntities.add(`${record.entity.type}:${record.entity.id}`)
    const entry = traces[record.trace_id] ?? { trace_id: record.trace_id, events: 0, entities: {}, first_ts: null, last_ts: null }
    entry.events += 1
    const group = entry.entities[record.entity.type] ?? new Set()
    group.add(record.entity.id)
    entry.entities[record.entity.type] = group
    if (entry.first_ts === null || record.ts < entry.first_ts) entry.first_ts = record.ts
    if (entry.last_ts === null || record.ts > entry.last_ts) entry.last_ts = record.ts
    traces[record.trace_id] = entry
  }
  const danglingParents = []
  for (const record of records) {
    if (record.parent && !seenEntities.has(`${record.parent.type}:${record.parent.id}`)) {
      danglingParents.push({ event_id: record.event_id, trace_id: record.trace_id, parent: record.parent })
    }
  }
  const sorted = {}
  for (const [traceId, entry] of Object.entries(traces)) {
    const entities = {}
    for (const [type, ids] of Object.entries(entry.entities)) entities[type] = [...ids].sort()
    sorted[traceId] = { trace_id: traceId, events: entry.events, entities, first_ts: entry.first_ts, last_ts: entry.last_ts }
  }
  return { traces: sorted, danglingParents: danglingParents.slice(0, 100) }
}

// ---------------------------------------------------------------------------
// integrity verifier

// Walks the stream and reports: unparseable/blank lines, hash-chain breaks,
// per-record hash mismatches, truncated writes, and correlation gaps. `ok` is
// false when any integrity error exists; dangling parents are warnings (the
// parent may live in another store or not yet be emitted).
export function verifyTrace(root) {
  const { records, errors } = readTrace(root)
  const report = {
    ok: errors.length === 0,
    file: TRACE_PATH.replace(/\\/g, "/"),
    schemaVersion: SCHEMA_VERSION,
    total: records.length,
    errors: [...errors],
    warnings: [],
    danglingParents: [],
    traces: {},
  }
  if (records.length === 0) return report

  const target = path.join(root, TRACE_PATH)
  const text = fs.readFileSync(target, "utf8")
  if (text.length > 0 && !text.endsWith("\n")) report.warnings.push({ reason: "truncated-write: file does not end with a newline" })

  let prevHash = null
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    const line = index + 1
    if (typeof record.hash !== "string" || !HASH_PATTERN.test(record.hash)) {
      report.errors.push({ line, reason: "bad hash field" })
      report.ok = false
      continue
    }
    if (record.prev_hash !== prevHash) {
      report.errors.push({ line, reason: "chain-break", expected: prevHash, actual: record.prev_hash })
      report.ok = false
      continue
    }
    const recomputed = hashRecord(record)
    if (recomputed !== record.hash.slice(HASH_PREFIX.length)) {
      report.errors.push({ line, reason: "hash-mismatch" })
      report.ok = false
      continue
    }
    prevHash = record.hash
  }

  const correlation = correlate(records)
  report.danglingParents = correlation.danglingParents
  report.traces = correlation.traces
  if (correlation.danglingParents.length > 0) {
    report.warnings.push({ reason: `${correlation.danglingParents.length} dangling parent link(s) — correlation gap, parent entity not present in this stream` })
  }
  if (report.errors.length > 100) {
    report.errors = report.errors.slice(0, 100)
    report.warnings.push({ reason: "integrity error list capped at 100 entries" })
  }
  return report
}

// ---------------------------------------------------------------------------
// retention — bounded prune with re-chaining

export function pruneTrace(root, { now = new Date() } = {}) {
  // Prune rewrites the whole stream, so it must exclude concurrent appends:
  // an append that read the pre-prune tail while prune truncated would chain
  // onto a tail that no longer exists. Same lock as appendEvent.
  const lock = acquireTraceLock(root, "prune")
  if (!lock.acquired) {
    return { ok: false, reason: "prune refused: concurrent writer holds the trace lock; retry" }
  }
  try {
    const verified = verifyTrace(root)
    if (!verified.ok) {
      return { ok: false, reason: `prune refused: trace integrity failed (${verified.errors.length} error(s)); run --verify first` }
    }
    const cutoff = now.getTime() - RETENTION_DAYS * 86_400_000
    const before = verified.total
    const kept = verified.total === 0 ? [] : readTrace(root).records.filter((record) => {
      const ts = new Date(record.ts).getTime()
      return Number.isNaN(ts) ? false : ts >= cutoff
    })
    if (kept.length === before) return { ok: true, removed: 0, remaining: before, rechained: false }

    let prevHash = null
    const rechained = kept.map((record) => {
      const { hash, ...rest } = record
      const next = { ...rest, prev_hash: prevHash }
      const digest = hashRecord(next)
      prevHash = `${HASH_PREFIX}${digest}`
      return { ...next, hash: prevHash }
    })

    const target = path.join(root, TRACE_PATH)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, rechained.map((record) => `${JSON.stringify(record)}\n`).join(""), "utf8")
    return { ok: true, removed: before - kept.length, remaining: rechained.length, rechained: true }
  } finally {
    releaseTraceLock(lock.lockTarget)
  }
}

// ---------------------------------------------------------------------------
// CLI

function runCli() {
  const args = process.argv.slice(2)
  const valueOf = (flag) => {
    const index = args.indexOf(flag)
    return index !== -1 && args[index + 1] ? args[index + 1] : null
  }
  const root = path.resolve(valueOf("--root") ?? process.cwd())

  try {
    if (args.includes("--record")) {
      const input = valueOf("--record")
      if (!input) {
        console.error("harness-trace: --record requires a JSON event argument")
        process.exitCode = 1
        return
      }
      const result = appendEvent(root, input)
      if (!result.ok) {
        console.error(`harness-trace: ${result.reason}`)
        process.exitCode = 1
        return
      }
      const { event } = result
      console.log(JSON.stringify({ recorded: { event_id: event.event_id, trace_id: event.trace_id, entity: event.entity, parent: event.parent, hash: event.hash }, total: result.total, bytes: result.bytes }, null, 2))
      return
    }

    if (args.includes("--verify")) {
      const report = verifyTrace(root)
      console.log(JSON.stringify(report, null, 2))
      if (!report.ok) process.exitCode = 2
      return
    }

    if (args.includes("--prune")) {
      const result = pruneTrace(root)
      if (!result.ok) {
        console.error(`harness-trace: ${result.reason}`)
        process.exitCode = 1
        return
      }
      console.log(JSON.stringify(result, null, 2))
      return
    }

    if (args.includes("--read")) {
      const limitArg = Number(valueOf("--limit"))
      const limit = Number.isFinite(limitArg) && limitArg > 0 ? Math.floor(limitArg) : 20
      const current = readTrace(root)
      const target = path.join(root, TRACE_PATH)
      const bytes = fs.existsSync(target) ? fs.statSync(target).size : 0
      console.log(JSON.stringify({ schemaVersion: SCHEMA_VERSION, total: current.records.length, corruptLines: current.errors.length, bytes, recent: current.records.slice(-limit) }, null, 2))
      return
    }

    console.error("usage: harness-trace.mjs --record <json> | --verify | --read [--limit N] | --prune [--root <dir>]")
    process.exitCode = 1
  } catch (error) {
    console.error(`harness-trace: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli()
