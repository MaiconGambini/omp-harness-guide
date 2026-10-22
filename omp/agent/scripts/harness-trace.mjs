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
const TRACE_DIR = path.dirname(TRACE_PATH)
const TRACE_ARCHIVE_PATTERN = /^trace-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)(?:-\d+)?\.jsonl$/
const LEGACY_TRACE_ARCHIVE_PATTERN = /^trace\.jsonl\..+\.jsonl$/

export function findProjectRoot(start = process.cwd()) {
  const requested = path.resolve(start)
  let current = requested
  while (true) {
    if (fs.existsSync(path.join(current, ".git")) || fs.existsSync(path.join(current, "agent-os"))) return current
    const parent = path.dirname(current)
    if (parent === current) return requested
    current = parent
  }
}
// Cross-process writer lock for the stream (spec R3): parallel OMP agents share
// one trace file, so the read-check-hash-append critical section must be mutex'd
// across processes or two writers can read the same tail and both append records
// with the same prev_hash, breaking the chain. The lock file sits next to the
// stream and is removed in `finally`; `--verify` stays read-only and never locks.
export const TRACE_LOCK_PATH = `${TRACE_PATH}.lock`
// Head sidecar: the tail hash, the event count and the byte size of the stream. It
// exists so an append does not have to read and parse the whole stream just to learn
// the previous hash — that made every append O(n) in a file capped at 5 MiB, on the
// critical path of every tool call. It is a CACHE, never evidence: appendEvent
// validates it against the real file size and rebuilds it from the stream on any
// mismatch, and verifyTrace never reads it.
export const TRACE_HEAD_PATH = `${TRACE_PATH}.head.json`
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
    if (typeof input.slug === "string" && !data.slug) {
      data.slug = input.slug
    }
    if (typeof input.source === "string" && !data.source) {
      data.source = input.source
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

function readTraceFile(target) {
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

export function readTrace(root) {
  return readTraceFile(path.join(root, TRACE_PATH))
}

export function listTraceArchives(root) {
  const directory = path.join(root, TRACE_DIR)
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && (TRACE_ARCHIVE_PATTERN.test(entry.name) || LEGACY_TRACE_ARCHIVE_PATTERN.test(entry.name)))
    .map((entry) => ({
      path: toTracePosix(path.relative(root, path.join(directory, entry.name))),
      file: path.join(directory, entry.name),
      legacy: LEGACY_TRACE_ARCHIVE_PATTERN.test(entry.name),
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

export function parseSkillEvent(record) {
  if (!record || typeof record !== "object") return null
  if (record.kind !== "skill_loaded") return null
  const slug = record.data?.slug ?? record.slug
  if (typeof slug !== "string" || !slug.trim()) return null
  const source = record.data?.source ?? record.source ?? "read"
  const ts = record.ts ?? new Date().toISOString()
  return {
    slug: slug.trim(),
    source: source === "command" ? "command" : "read",
    ts: typeof ts === "string" ? ts : new Date(ts).toISOString(),
  }
}

export function summarizeSkillRecords(records) {
  const skills = {}
  let total = 0
  if (Array.isArray(records)) {
    for (const record of records) {
      const parsed = parseSkillEvent(record)
      if (!parsed) continue
      total += 1
      const { slug, ts } = parsed
      if (!skills[slug]) {
        skills[slug] = { count: 0, lastSeen: ts }
      }
      skills[slug].count += 1
      const curTime = new Date(skills[slug].lastSeen).getTime()
      const newTime = new Date(ts).getTime()
      if (Number.isNaN(curTime) || (!Number.isNaN(newTime) && newTime > curTime)) {
        skills[slug].lastSeen = ts
      }
    }
  }
  const result = {
    skills,
    total,
  }
  for (const [slug, data] of Object.entries(skills)) {
    if (!(slug in result)) {
      result[slug] = data
    }
  }
  return result
}

export function summarizeSkills(target) {
  if (Array.isArray(target)) {
    return summarizeSkillRecords(target)
  }
  const root = typeof target === "string" ? path.resolve(target) : findProjectRoot(process.cwd())
  const dir = path.join(root, TRACE_DIR)
  if (!fs.existsSync(dir)) {
    return summarizeSkillRecords([])
  }
  const files = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => path.join(dir, entry.name))
    .sort()

  const records = []
  for (const file of files) {
    try {
      const text = fs.readFileSync(file, "utf8")
      const lines = text.split("\n")
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const rec = JSON.parse(line)
          if (rec && typeof rec === "object") {
            records.push(rec)
          }
        } catch {
          // ignore unparseable line
        }
      }
    } catch {
      // ignore unreadable file
    }
  }
  return summarizeSkillRecords(records)
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
// The synchronous sleep is for the CLI, where blocking the process is exactly what we
// want. Plugins must NEVER use it: an OpenCode plugin runs inside the server's event
// loop, so a blocking sleep here stalls every other lane's streaming response — up to
// LOCK_RETRIES * LOCK_RETRY_MS of dead air. Those callers use appendEventAsync, which
// waits with a timer instead.
const lockSleep = () => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_RETRY_MS)
const lockSleepAsync = () => new Promise((resolve) => { setTimeout(resolve, LOCK_RETRY_MS) })
const lockContention = (error, lockTarget) => {
  if (error.code === "EEXIST") return true
  if (error.code !== "EPERM" && error.code !== "EACCES") return false
  try {
    fs.statSync(lockTarget)
  } catch {
    // The lock can be temporarily unstatable while Windows resolves a concurrent
    // create/delete. The open failure still represents bounded lock contention.
  }
  return true
}

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
      if (!lockContention(error, lockTarget)) throw error
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

/**
 * Same lock, non-blocking wait. Kept as a separate function rather than a flag so the
 * synchronous path stays byte-for-byte the behavior the CLI tests already cover.
 */
async function acquireTraceLockAsync(root, reason) {
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
      if (!lockContention(error, lockTarget)) throw error
      try {
        const stat = fs.statSync(lockTarget)
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          fs.unlinkSync(lockTarget)
          reclaimed = true
          continue
        }
        reclaimed = false
      } catch {
        reclaimed = false
      }
    }
    if (attempt < LOCK_RETRIES - 1) await lockSleepAsync()
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
const toTracePosix = (value) => value.split(path.sep).join("/")

/** Reads the head sidecar. Returns null when absent or unusable — never throws. */
export function readTraceHead(root) {
  const target = path.join(root, TRACE_HEAD_PATH)
  if (!fs.existsSync(target)) return null
  try {
    const head = JSON.parse(fs.readFileSync(target, "utf8"))
    const validHash = head.hash === null || (typeof head.hash === "string" && HASH_PATTERN.test(head.hash))
    if (!validHash) return null
    if (!Number.isInteger(head.events) || head.events < 0) return null
    if (!Number.isInteger(head.bytes) || head.bytes < 0) return null
    return head
  } catch {
    return null
  }
}

function writeTraceHead(root, head) {
  const target = path.join(root, TRACE_HEAD_PATH)
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  try {
    fs.writeFileSync(temporary, `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, ...head })}\n`, "utf8")
    fs.renameSync(temporary, target)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

/**
 * The tail the next append must chain onto: `{ hash, events, bytes, rebuilt }`.
 *
 * Fast path — the sidecar agrees with the file's real size, so it is trusted.
 * Slow path — no sidecar, or its byte count disagrees with the file on disk (another
 * writer appended without updating it, or it was hand-edited): the stream is read once,
 * the sidecar is rebuilt, and `rebuilt` says so. A corrupt stream still refuses.
 */
function resolveTraceTail(root, { maxBytes }) {
  const target = path.join(root, TRACE_PATH)
  const actualBytes = fs.existsSync(target) ? fs.statSync(target).size : 0
  const head = readTraceHead(root)
  if (head && head.bytes === actualBytes) {
    return { ok: true, hash: head.hash, events: head.events, bytes: actualBytes, rebuilt: false }
  }
  const current = readTrace(root)
  if (current.errors.length > 0) {
    return { ok: false, reason: `append refused: trace is corrupt (${current.errors.length} bad line(s)); run --verify before appending` }
  }
  const tailHash = current.records.length > 0
    ? `${HASH_PREFIX}${current.records[current.records.length - 1].hash.replace(/^sha256:/, "")}`
    : null
  return { ok: true, hash: tailHash, events: current.records.length, bytes: actualBytes, rebuilt: true, maxBytes }
}

/**
 * Archives the current stream and starts a fresh one. Called explicitly (CLI `--rotate`
 * or an operator), never automatically: rotation is a retention decision.
 *
 * The archive keeps its own complete, verifiable chain. The new stream starts clean
 * (`prev_hash: null` on its first record, so verifyTrace's chain rule is unchanged); the
 * link back to the archive lives in the returned receipt and in the archive's filename,
 * as data rather than as chain.
 */
export function rotateTrace(root, { now = new Date() } = {}) {
  const lock = acquireTraceLock(root, "rotate")
  if (!lock.acquired) return { ok: false, reason: "rotate refused: concurrent writer holds the trace lock; retry" }
  try {
    const target = path.join(root, TRACE_PATH)
    if (!fs.existsSync(target)) return { ok: false, reason: "rotate refused: no trace stream to rotate" }
    const verified = verifyTrace(root)
    if (!verified.ok) {
      return { ok: false, reason: `rotate refused: trace integrity failed (${verified.errors.length} error(s)); run --verify first` }
    }
    const existing = readTrace(root).records
    const archivedTailHash = existing.length > 0 ? existing[existing.length - 1].hash : null
    const stamp = now.toISOString().replace(/[:.]/g, "-")
    const archiveBase = `trace-${stamp}`
    let archiveName = `${archiveBase}.jsonl`
    let suffix = 1
    while (fs.existsSync(path.join(path.dirname(target), archiveName))) {
      archiveName = `${archiveBase}-${suffix}.jsonl`
      suffix += 1
    }
    const archive = path.join(path.dirname(target), archiveName)
    fs.renameSync(target, archive)
    fs.rmSync(path.join(root, TRACE_HEAD_PATH), { force: true })
    writeTraceHead(root, { hash: null, events: 0, bytes: 0, ts: now.toISOString(), rotatedFrom: path.basename(archive), rotatedTailHash: archivedTailHash })
    return {
      ok: true,
      archive: toTracePosix(path.relative(root, archive)),
      archivedEvents: verified.total,
      archivedTailHash,
    }
  } finally {
    releaseTraceLock(lock.lockTarget)
  }
}

/**
 * The append itself, assuming the writer lock is already held. Shared by the sync and
 * async wrappers so both have identical semantics.
 */
function appendEventLocked(root, validatedEvent, { capEvents, capBytes }) {
  const tail = resolveTraceTail(root, { maxBytes: capBytes })
  if (!tail.ok) return { ok: false, reason: tail.reason }

  const target = path.join(root, TRACE_PATH)
  if (tail.events >= capEvents) {
    return { ok: false, reason: `append refused: event cap reached (${tail.events} >= ${capEvents}); rotate the stream (--rotate) to keep tracing` }
  }

  const record = { ...validatedEvent, prev_hash: tail.hash }
  const hash = hashRecord(record)
  const line = `${JSON.stringify({ ...record, hash: `${HASH_PREFIX}${hash}` })}\n`

  const lineBytes = Buffer.byteLength(line, "utf8")
  const nextBytes = tail.bytes + lineBytes
  if (nextBytes > capBytes) {
    return { ok: false, reason: `append refused: byte cap would be exceeded (${nextBytes} > ${capBytes}); rotate the stream (--rotate) to keep tracing` }
  }

  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.appendFileSync(target, line, "utf8")
  const total = tail.events + 1
  writeTraceHead(root, { hash: `${HASH_PREFIX}${hash}`, events: total, bytes: nextBytes, ts: new Date().toISOString() })
  return {
    ok: true,
    event: { ...record, hash: `${HASH_PREFIX}${hash}` },
    total,
    bytes: nextBytes,
    headRebuilt: tail.rebuilt === true,
    // How much room is left before the caps bite, so a caller can rotate BEFORE the
    // stream starts refusing writes instead of discovering it from a warning.
    remainingBytes: capBytes - nextBytes,
    remainingEvents: capEvents - total,
  }
}

const appendCaps = (maxEvents, maxBytes) => ({
  capEvents: clamp(Number.isFinite(maxEvents) ? maxEvents : MAX_EVENTS, 1, 1_000_000),
  capBytes: clamp(Number.isFinite(maxBytes) ? maxBytes : MAX_BYTES, 1, 64 * 1024 * 1024),
})

export function appendEvent(root, json, { now = new Date(), maxEvents = MAX_EVENTS, maxBytes = MAX_BYTES } = {}) {
  const validated = normalizeEvent(json, { now })
  if (!validated.ok) return { ok: false, reason: validated.reason }

  const lock = acquireTraceLock(root, "append")
  if (!lock.acquired) {
    return { ok: false, reason: "append refused: concurrent writer holds the trace lock; retry" }
  }
  try {
    return appendEventLocked(root, validated.event, appendCaps(maxEvents, maxBytes))
  } finally {
    releaseTraceLock(lock.lockTarget)
  }
}

/**
 * Same contract as appendEvent, but it waits for the lock with a timer instead of
 * blocking the thread. This is the entry point for OpenCode/OMP plugins: they run inside
 * the runtime's event loop, where a blocking wait stalls every concurrent lane.
 */
export async function appendEventAsync(root, json, { now = new Date(), maxEvents = MAX_EVENTS, maxBytes = MAX_BYTES } = {}) {
  const validated = normalizeEvent(json, { now })
  if (!validated.ok) return { ok: false, reason: validated.reason }

  const lock = await acquireTraceLockAsync(root, "append")
  if (!lock.acquired) {
    return { ok: false, reason: "append refused: concurrent writer holds the trace lock; retry" }
  }
  try {
    return appendEventLocked(root, validated.event, appendCaps(maxEvents, maxBytes))
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
// per-record hash mismatches, truncated writes, and correlation gaps.
function verifyTraceFile(records, text) {
  const errors = []
  const warnings = []
  if (text.length > 0 && !text.endsWith("\n")) warnings.push({ reason: "truncated-write: file does not end with a newline" })
  let prevHash = null
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    const line = index + 1
    if (record.prev_hash !== prevHash) {
      errors.push({ line, reason: "chain-break", expected: prevHash, actual: record.prev_hash })
      continue
    }
    const recomputed = hashRecord(record)
    if (recomputed !== record.hash.slice(HASH_PREFIX.length)) {
      errors.push({ line, reason: "hash-mismatch" })
      continue
    }
    prevHash = record.hash
  }
  const correlation = correlate(records)
  if (correlation.danglingParents.length > 0) {
    warnings.push({ reason: `${correlation.danglingParents.length} dangling parent link(s) — correlation gap, parent entity not present in this stream` })
  }
  return { errors, warnings, danglingParents: correlation.danglingParents, traces: correlation.traces }
}

export function verifyTrace(root) {
  const parsed = readTrace(root)
  const target = path.join(root, TRACE_PATH)
  const report = {
    ok: parsed.errors.length === 0,
    file: TRACE_PATH.replace(/\\/g, "/"),
    schemaVersion: SCHEMA_VERSION,
    total: parsed.records.length,
    errors: [...parsed.errors],
    warnings: [],
    danglingParents: [],
    traces: {},
    archives: [],
  }
  if (parsed.records.length > 0 || fs.existsSync(target)) {
    const checked = verifyTraceFile(parsed.records, fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "")
    report.errors.push(...checked.errors)
    report.warnings.push(...checked.warnings)
    report.danglingParents = checked.danglingParents
    report.traces = checked.traces
  }
  for (const archive of listTraceArchives(root)) {
    const archiveParsed = readTraceFile(archive.file)
    const checked = verifyTraceFile(archiveParsed.records, fs.readFileSync(archive.file, "utf8"))
    const archiveErrors = [...archiveParsed.errors, ...checked.errors]
    report.archives.push({ path: archive.path, total: archiveParsed.records.length, ok: archiveErrors.length === 0, errors: archiveErrors })
    for (const error of archiveErrors) report.errors.push({ archive: archive.path, ...error })
    for (const warning of checked.warnings) report.warnings.push({ archive: archive.path, ...warning })
  }
  report.ok = report.errors.length === 0
  if (report.errors.length > 100) {
    report.errors = report.errors.slice(0, 100)
    report.warnings.push({ reason: "integrity error list capped at 100 entries" })
  }
  return report
}

// ---------------------------------------------------------------------------
// retention — bounded prune with re-chaining

function cleanupTraceArtifacts(root) {
  let removed = 0
  const cleanDirectory = (directory) => {
    if (!fs.existsSync(directory)) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      if (!entry.name.endsWith(".tmp") && !LEGACY_TRACE_ARCHIVE_PATTERN.test(entry.name)) continue
      fs.rmSync(path.join(directory, entry.name), { force: true })
      removed += 1
    }
  }
  cleanDirectory(path.join(root, TRACE_DIR))
  const roles = path.join(root, ".maestri", "roles")
  if (fs.existsSync(roles)) {
    for (const entry of fs.readdirSync(roles, { withFileTypes: true })) {
      if (entry.isDirectory()) cleanDirectory(path.join(roles, entry.name, TRACE_DIR))
    }
  }
  return removed
}

export function pruneTrace(root, { now = new Date() } = {}) {
  const lock = acquireTraceLock(root, "prune")
  if (!lock.acquired) {
    return { ok: false, reason: "prune refused: concurrent writer holds the trace lock; retry" }
  }
  try {
    const cleaned = cleanupTraceArtifacts(root)
    const parsed = readTrace(root)
    const target = path.join(root, TRACE_PATH)
    const text = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : ""
    const checked = verifyTraceFile(parsed.records, text)
    const errors = [...parsed.errors, ...checked.errors]
    if (errors.length > 0) {
      return { ok: false, reason: `prune refused: trace integrity failed (${errors.length} error(s)); run --verify first` }
    }
    const cutoff = now.getTime() - RETENTION_DAYS * 86_400_000
    let archivesRemoved = 0
    for (const archive of listTraceArchives(root)) {
      if (archive.legacy) continue
      const archiveParsed = readTraceFile(archive.file)
      const archiveChecked = verifyTraceFile(archiveParsed.records, fs.readFileSync(archive.file, "utf8"))
      if (archiveParsed.errors.length > 0 || archiveChecked.errors.length > 0) {
        return { ok: false, reason: `prune refused: archive integrity failed (${archive.path}); run --verify first` }
      }
      const newest = archiveParsed.records.reduce((latest, record) => {
        const timestamp = new Date(record.ts).getTime()
        return Number.isNaN(timestamp) ? latest : Math.max(latest, timestamp)
      }, fs.statSync(archive.file).mtimeMs)
      if (newest < cutoff) {
        fs.rmSync(archive.file, { force: true })
        archivesRemoved += 1
      }
    }
    const before = parsed.records.length
    const kept = parsed.records.filter((record) => {
      const ts = new Date(record.ts).getTime()
      return Number.isNaN(ts) ? false : ts >= cutoff
    })
    if (kept.length === before) return { ok: true, removed: 0, remaining: before, rechained: false, archivesRemoved, cleaned }

    let prevHash = null
    const rechained = kept.map((record) => {
      const { hash, ...rest } = record
      const next = { ...rest, prev_hash: prevHash }
      const digest = hashRecord(next)
      prevHash = `${HASH_PREFIX}${digest}`
      return { ...next, hash: prevHash }
    })
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const content = rechained.map((record) => `${JSON.stringify(record)}\n`).join("")
    fs.writeFileSync(target, content, "utf8")
    writeTraceHead(root, {
      hash: rechained.length > 0 ? rechained[rechained.length - 1].hash : null,
      events: rechained.length,
      bytes: Buffer.byteLength(content, "utf8"),
      ts: now.toISOString(),
      rebuiltBy: "prune",
    })
    return { ok: true, removed: before - kept.length, remaining: rechained.length, rechained: true, archivesRemoved, cleaned }
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
  const root = valueOf("--root") ? path.resolve(valueOf("--root")) : findProjectRoot(process.cwd())

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

    if (args.includes("--rotate")) {
      const result = rotateTrace(root)
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
      const head = readTraceHead(root)
      console.log(JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        total: current.records.length,
        corruptLines: current.errors.length,
        bytes,
        // Cap pressure, so `--read` answers "is this stream about to stop accepting
        // writes?" without anyone having to do the arithmetic.
        capBytes: MAX_BYTES,
        capEvents: MAX_EVENTS,
        remainingBytes: MAX_BYTES - bytes,
        remainingEvents: MAX_EVENTS - current.records.length,
        head: head === null ? { available: false, reason: "missing or unusable — the next append rebuilds it" } : { available: true, events: head.events, bytes: head.bytes, inSyncWithStream: head.bytes === bytes },
        recent: current.records.slice(-limit),
      }, null, 2))
      return
    }
    if (args.includes("--skills")) {
      const summary = summarizeSkills(root)
      console.log(JSON.stringify(summary, null, 2))
      return
    }


    console.error("usage: harness-trace.mjs --record <json> | --verify | --read [--limit N] | --prune | --rotate | --skills [--root <dir>]")
    process.exitCode = 1
  } catch (error) {
    console.error(`harness-trace: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli()
