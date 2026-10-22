import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { spawn } from "node:child_process"
import { pathToFileURL } from "node:url"
import { acquireLock, releaseLock, LOCK_TIMEOUT_MS } from "./harness-prevc-state.mjs"

export const SESSION_SCHEMA_VERSION = 1
export const SESSION_DIR = path.join("docs", "harness", "sessions")
export const HANDOFF_PATH = path.join("docs", "harness", "session-handoff.md")
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const PHASES = new Set(["prepare", "awaiting_plan_approval", "execute", "validate", "judge", "refine", "awaiting_confirmation", "revision_requested", "blocked", "aborted", "complete"])

function nowIso() {
  return new Date().toISOString()
}

function addError(errors, code) {
  if (!errors.includes(code)) errors.push(code)
}

export function validateSessionRecord(record) {
  const errors = []
  if (!record || typeof record !== "object" || Array.isArray(record)) return { valid: false, errors: ["INVALID_RECORD"] }
  if (record.schemaVersion !== SESSION_SCHEMA_VERSION) addError(errors, "INVALID_SCHEMA_VERSION")
  if (typeof record.sessionId !== "string" || !SESSION_ID_PATTERN.test(record.sessionId)) addError(errors, "INVALID_SESSION_ID")
  if (!Number.isInteger(record.revision) || record.revision < 0) addError(errors, "INVALID_REVISION")
  for (const field of ["createdAt", "updatedAt"]) if (typeof record[field] !== "string" || record[field].trim() === "") addError(errors, `INVALID_${field.toUpperCase()}`)
  if (typeof record.phase !== "string" || !PHASES.has(record.phase)) addError(errors, "INVALID_PHASE")
  for (const field of ["activeTask", "spec", "risk", "blocker", "nextAction"]) if (record[field] !== null && typeof record[field] !== "string") addError(errors, `INVALID_${field.toUpperCase()}`)
  for (const field of ["evidence", "commands"]) if (!Array.isArray(record[field])) addError(errors, `INVALID_${field.toUpperCase()}`)
  if (Array.isArray(record.blockers) && record.blockers.some((item) => typeof item !== "string")) addError(errors, "INVALID_BLOCKERS")
  if (!Array.isArray(record.blockers)) addError(errors, "INVALID_BLOCKERS")
  return { valid: errors.length === 0, errors }
}

export function sessionFile(root, sessionId) {
  if (typeof sessionId !== "string" || !SESSION_ID_PATTERN.test(sessionId)) throw new Error("INVALID_SESSION_ID")
  const digest = crypto.createHash("sha256").update(sessionId).digest("hex")
  return path.join(path.resolve(root), SESSION_DIR, `${digest}.json`)
}

function readJson(file) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(file, "utf8")) }
  } catch (error) {
    return { ok: false, reason: error.code === "ENOENT" ? "NOT_FOUND" : `UNREADABLE:${error.message}` }
  }
}

function fsyncDirectory(directory) {
  let descriptor
  try {
    descriptor = fs.openSync(directory, "r")
    fs.fsyncSync(descriptor)
  } catch {
    // Windows does not support directory fsync; the file fsync remains mandatory.
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor)
  }
}

export function writeAtomicFile(file, content) {
  const directory = path.dirname(file)
  fs.mkdirSync(directory, { recursive: true })
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`
  let descriptor
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600)
    fs.writeFileSync(descriptor, content)
    fs.fsyncSync(descriptor)
    fs.closeSync(descriptor)
    descriptor = undefined
    fs.renameSync(temporary, file)
    fsyncDirectory(directory)
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor)
    try { fs.rmSync(temporary, { force: true }) } catch {}
    throw error
  }
}

function withStoreLock(root, operation) {
  const acquired = acquireLock(root, { timeoutMs: LOCK_TIMEOUT_MS })
  if (!acquired.ok) return acquired
  try {
    return operation()
  } finally {
    releaseLock(acquired.lock, acquired.token)
  }
}

function defaultRecord(sessionId, fields = {}) {
  const timestamp = nowIso()
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId,
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    phase: "prepare",
    activeTask: null,
    spec: null,
    risk: null,
    blocker: null,
    blockers: [],
    nextAction: null,
    evidence: [],
    commands: [],
    ...fields,
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId,
    revision: 0,
    createdAt: fields.createdAt ?? timestamp,
    updatedAt: timestamp,
  }
}

export function readSession({ root, sessionId }) {
  let file
  try { file = sessionFile(root, sessionId) } catch (error) { return { ok: false, errors: [error.message] } }
  const loaded = readJson(file)
  if (!loaded.ok) return { ok: false, errors: [loaded.reason], file }
  const checked = validateSessionRecord(loaded.value)
  if (!checked.valid) return { ok: false, errors: checked.errors, file }
  if (loaded.value.sessionId !== sessionId) return { ok: false, errors: ["SESSION_ID_MISMATCH"], file }
  return { ok: true, record: loaded.value, file }
}

export function createSession({ root, sessionId, fields = {} }) {
  return withStoreLock(root, () => {
    const file = sessionFile(root, sessionId)
    if (fs.existsSync(file)) return { ok: false, errors: ["ALREADY_EXISTS"], file }
    const record = defaultRecord(sessionId, fields)
    const checked = validateSessionRecord(record)
    if (!checked.valid) return { ok: false, errors: checked.errors, file }
    writeAtomicFile(file, `${JSON.stringify(record, null, 2)}\n`)
    return { ok: true, record, file }
  })
}

export function updateSession({ root, sessionId, expectedRevision, changes = {} }) {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) return { ok: false, errors: ["EXPECTED_REVISION_REQUIRED"] }
  return withStoreLock(root, () => {
    const current = readSession({ root, sessionId })
    if (!current.ok) return current
    if (current.record.revision !== expectedRevision) {
      return { ok: false, conflict: true, errors: ["REVISION_CONFLICT"], currentRevision: current.record.revision }
    }
    const next = {
      ...current.record,
      ...changes,
      schemaVersion: SESSION_SCHEMA_VERSION,
      sessionId,
      revision: expectedRevision + 1,
      updatedAt: nowIso(),
      createdAt: current.record.createdAt,
    }
    const checked = validateSessionRecord(next)
    if (!checked.valid) return { ok: false, errors: checked.errors }
    writeAtomicFile(current.file, `${JSON.stringify(next, null, 2)}\n`)
    return { ok: true, record: next, file: current.file }
  })
}

function markdownValue(value) {
  if (value === null || value === undefined || value === "") return "none"
  return String(value).replaceAll("\n", " ")
}

function markdownList(values) {
  if (!Array.isArray(values) || values.length === 0) return "- none"
  return values.map((value) => `- ${typeof value === "string" ? value : JSON.stringify(value)}`).join("\n")
}

export function projectHandoff({ root, sessionId }) {
  return withStoreLock(root, () => {
    const loaded = readSession({ root, sessionId })
    if (!loaded.ok) return loaded
    const record = loaded.record
    const content = [
      "# Session handoff",
      "",
      "This file is a harness projection of the validated session record. It is authoritative for handoff state and is not rendered from ai-memory.",
      "",
      "## PREVC state",
      "",
      `- Session: ${record.sessionId}`,
      `- Revision: ${record.revision}`,
      `- Phase: ${markdownValue(record.phase)}`,
      `- Spec: ${markdownValue(record.spec)}`,
      `- Risk: ${markdownValue(record.risk)}`,
      `- Active task: ${markdownValue(record.activeTask)}`,
      `- Blocker: ${markdownValue(record.blocker)}`,
      `- Next action: ${markdownValue(record.nextAction)}`,
      "",
      "## Verified evidence",
      "",
      markdownList(record.evidence),
      "",
      "## Commands",
      "",
      markdownList(record.commands),
      "",
      `Updated: ${record.updatedAt}`,
      "",
    ].join("\n")
    const file = path.join(path.resolve(root), HANDOFF_PATH)
    writeAtomicFile(file, content)
    return { ok: true, record, file }
  })
}

function parseCli(args) {
  const options = { root: process.cwd() }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--root" || arg === "--session-id" || arg === "--record-file" || arg === "--expected-revision" || arg === "--hold-ms") {
      const value = args[index + 1]
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`)
      options[arg.slice(2).replaceAll("-", "_")] = value
      index += 1
    } else if (arg.startsWith("--")) {
      options[arg.slice(2).replaceAll("-", "_")] = true
    } else {
      throw new Error(`unexpected argument: ${arg}`)
    }
  }
  return options
}

async function waitForProcess(child) {
  return new Promise((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.once("error", reject)
    child.once("exit", (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
}

async function waitForLine(stream, expected, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = ""
    const timer = setTimeout(() => reject(new Error("child did not acquire lock")), timeoutMs)
    stream.setEncoding("utf8")
    stream.on("data", (chunk) => {
      buffer += chunk
      if (buffer.includes(expected)) {
        clearTimeout(timer)
        resolve()
      }
    })
    stream.once("error", (error) => { clearTimeout(timer); reject(error) })
  })
}

function staleLockFixture(root, pid) {
  const lock = path.join(path.resolve(root), "docs", "harness", "state", ".prevc.lock")
  fs.mkdirSync(lock, { recursive: true })
  fs.writeFileSync(path.join(lock, "owner.json"), JSON.stringify({ pid, token: "dead-token", at: nowIso() }))
  const old = new Date(Date.now() - 120_000)
  fs.utimesSync(lock, old, old)
}
async function selfTest(root) {
  const fixture = path.join(path.resolve(root), `.harness-session-store-self-test-${process.pid}-${crypto.randomUUID()}`)
  fs.mkdirSync(fixture, { recursive: true })
  let atomic = false
  let conflict = false
  let staleRecovery = false
  let liveLockProtected = false
  try {
    const created = createSession({ root: fixture, sessionId: "self-test-session", fields: { phase: "execute", nextAction: "verify" } })
    if (!created.ok) throw new Error(`create failed: ${created.errors.join(",")}`)
    const loaded = readSession({ root: fixture, sessionId: "self-test-session" })
    atomic = loaded.ok && loaded.record.revision === 0 && !fs.readdirSync(path.dirname(loaded.file)).some((name) => name.includes(".tmp-"))
    const competingRecord = path.join(fixture, "competing-record.json")
    fs.writeFileSync(competingRecord, JSON.stringify({ nextAction: "competing-writer" }))
    const competing = spawn(process.execPath, [process.argv[1], "--write", "--root", fixture, "--session-id", "self-test-session", "--record-file", competingRecord, "--expected-revision", "0"], { stdio: ["ignore", "pipe", "pipe"] })
    const parentResult = updateSession({ root: fixture, sessionId: "self-test-session", expectedRevision: 0, changes: { nextAction: "parent-writer" } })
    const competingOutput = await waitForProcess(competing)
    if (competingOutput.code !== 0 && competingOutput.code !== 1) throw new Error(`competing writer failed: ${competingOutput.stderr}`)
    const competingResult = JSON.parse(competingOutput.stdout)
    conflict = [parentResult, competingResult].some((result) => result.conflict === true && result.errors.includes("REVISION_CONFLICT")) && [parentResult, competingResult].some((result) => result.ok === true && result.record.revision === 1)

    staleLockFixture(fixture, 2147483647)
    const recovered = acquireLock(fixture, { timeoutMs: 500 })
    if (!recovered.ok) throw new Error(`stale recovery failed: ${recovered.reason}`)
    staleRecovery = true
    releaseLock(recovered.lock, recovered.token)

    const child = spawn(process.execPath, [process.argv[1], "--hold-lock", "--root", fixture, "--hold-ms", "700"], { stdio: ["ignore", "pipe", "pipe"] })
    await waitForLine(child.stdout, "LOCK_HELD", 2_000)
    const liveLock = path.join(fixture, "docs", "harness", "state", ".prevc.lock")
    const old = new Date(Date.now() - 120_000)
    fs.utimesSync(liveLock, old, old)
    const attemptedSteal = acquireLock(fixture, { timeoutMs: 150 })
    liveLockProtected = !attemptedSteal.ok && attemptedSteal.reason.includes("timed out")
    await new Promise((resolve) => child.once("exit", resolve))
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
  const result = { atomic, conflict, staleRecovery: staleRecovery && liveLockProtected }
  console.log(JSON.stringify(result))
  if (!result.atomic || !result.conflict || !result.staleRecovery) process.exitCode = 1
}

async function runCli() {
  let options
  try { options = parseCli(process.argv.slice(2)) } catch (error) { console.error(error.message); process.exitCode = 1; return }
  const root = path.resolve(options.root)
  try {
    if (options.self_test) return await selfTest(root)
    if (options.hold_lock) {
      const acquired = acquireLock(root, { timeoutMs: LOCK_TIMEOUT_MS })
      if (!acquired.ok) throw new Error(acquired.reason)
      console.log("LOCK_HELD")
      await new Promise((resolve) => setTimeout(resolve, Number(options.hold_ms ?? 500)))
      releaseLock(acquired.lock, acquired.token)
      return
    }
    if (!options.session_id) throw new Error("--session-id is required")
    let result
    if (options.create) {
      let fields = {}
      if (options.record_file) {
        const loaded = readJson(path.resolve(options.record_file))
        if (!loaded.ok) throw new Error(loaded.reason)
        fields = loaded.value
      }
      result = createSession({ root, sessionId: options.session_id, fields })
    }
    else if (options.read) result = readSession({ root, sessionId: options.session_id })
    else if (options.project_handoff) result = projectHandoff({ root, sessionId: options.session_id })
    else if (options.write) {
      if (!options.record_file) throw new Error("--record-file is required")
      const loaded = readJson(path.resolve(options.record_file))
      if (!loaded.ok) throw new Error(loaded.reason)
      result = updateSession({ root, sessionId: options.session_id, expectedRevision: Number(options.expected_revision), changes: loaded.value })
    } else throw new Error("one operation is required: --create, --read, --write, or --project-handoff")
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli()
