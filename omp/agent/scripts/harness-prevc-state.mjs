// harness-prevc-state — the durable PREVC lifecycle boundary.
//
// The lifecycle phase is a single source of truth in docs/harness/state/prevc.json.
// PREVC is the ONLY agent that may write it; every transition goes through this CLI
// so a failed or illegal transition can never leave a partial write (the state file
// is replaced atomically and only after every precondition passed).
// Exit codes: 0 the transition/init/inspect succeeded · 2 refused — illegal edge,
// missing/red/stale/invalid gate, invalid judge receipt, missing operator argument, or
// an unreadable/invalid state file. A refusal NEVER writes: attempting validate -> judge
// against a RED full gate is refused (exit 2) without writing state, advising the loop
// transition to execute com o diagnóstico; attempting validate -> execute with attempts
// >= maxAttempts is accepted without blocking, returning a fix-loop-exhausted advisory.
//
// Autofix loop (amendments R6.4, GS-04): the edge validate -> execute is accepted ONLY
// when the newest full gate report is structurally valid and RED (kind "red"). When attempts
// reach or exceed maxAttempts, the transition succeeds with an advisory.
// Green, missing, stale, or malformed gates are refused (exit 2) without write.
// The gate contract follows the measured-gate conventions (scripts/harness-quality-gate.mjs):
// the NEWEST docs/harness/quality/*.json at --mode full is authoritative regardless of
// verdict — an older green report cannot override a newer red one. To advance, the newest
// full report must be credible (verdict pass, not unconfigured, non-empty rows, sourceHash
// present — aligned with checkReportShape) and fresh (sourceHash == current tree hash).
//
// The judge receipt is the exact JSON emitted by the read-only judge agent (agent/judge.md)
// and persisted by PREVC under docs/harness/judge/<timestamp>.json:
//   schemaVersion: 1, sourceHash, gateReport, tier, verdict: accept|revise|block,
//   rubricScore, blockingCriteria[], evidencePaths[], judge: "judge", judgedAt,
//   completionPayload: { criteria[], evidence[], adversarial[] }.
// The receipt must be a regular file under docs/harness/judge/ with EXACTLY those eleven
// keys; gateReport must name the exact newest full report (canonical path under
// docs/harness/quality/, existing regular file); evidencePaths are non-empty relative repo
// paths that exist as regular files; verdict accept requires an empty blockingCriteria and
// revise/block require at least one non-empty criterion. completionPayload is validated by
// the canonical completion-gate validator. judge -> refine accepts only a parseable receipt
// whose sourceHash equals the newest full green gate; refine -> awaiting_confirmation
// requires verdict accept; revise/block route to revision_requested/blocked; complete
// requires the operator confirm action AND an existing docs/harness/session-handoff.md.
//
// Relative paths resolve from --root (default: the current working directory).
// Trace identity (T01 contract): every lifecycle write — init and legal transitions —
// appends a hash-chained phase event to the shared stream docs/harness/traces/trace.jsonl
// BEFORE the atomic state replacement,
// and the state records the stable trace/run/session identity plus the event id of
// each transition in history, so the state file is an index into the stream. init
// opens session -> run -> phase prepare; transitions append entity phase parented to
// the run. A refused transition appends nothing and writes nothing. A corrupt stream
// refuses lifecycle writes with a pointer to --verify — the audit spine is never
// silently skipped. The stream is gitignored (*.jsonl) and outside the gate's source
// hash, so trace appends can never stale a green gate. Legacy pre-trace state is
// still readable and is bound on the first successful transition, never by a direct
// file edit.

import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  checkReportShape,
  makeGit,
  readTextIfExists,
  REPORT_DIR,
  resolveInsideRoot,
  sourceHash,
} from "./harness-quality-core.mjs"
import { TRACE_PATH, appendEvent, newId, readTrace, validateId } from "./harness-trace.mjs"
import { generateProgress } from "./harness-progress.mjs"
import { validateCompletionPayload } from "./harness-completion-gate.mjs"
import { DEFAULT_FIX_LOOP, readProjectProfile } from "./harness-project-profile.mjs"

export const STATE_PATH = path.join("docs", "harness", "state", "prevc.json")
export const ARCHIVE_DIR = path.join("docs", "harness", "state", "archive")
export const PROGRESS_PATH = path.join("docs", "harness", "progress.md")
export const JUDGE_DIR = path.join("docs", "harness", "judge")
export const HANDOFF_PATH = path.join("docs", "harness", "session-handoff.md")
export const AUTONOMY_POLICY_PATH = path.join("agent-os", "prevc-autonomy.json")
export const REVIEW_DIR = path.join("docs", "harness", "review")
export const SCHEMA_VERSION = 1
export const PHASES = [
  "prepare",
  "awaiting_plan_approval",
  "execute",
  "validate",
  "judge",
  "refine",
  "awaiting_confirmation",
  "revision_requested",
  "blocked",
  "aborted",
  "complete",
]
export const RISKS = ["low", "medium", "high", "untrusted"]
export const OPERATOR_ACTIONS = ["confirm", "revise", "abort", "auto-confirm"]
export const RECEIPT_VERDICTS = ["accept", "revise", "block"]
export const RECEIPT_TIERS = ["auto", "sampling", "full"]

// Exact top-level key set of the state file — nothing else may appear.
export const STATE_KEYS = [
  "blocker",
  "gateSourceHash",
  "history",
  "judgeReceiptPath",
  "objective",
  "operatorDecision",
  "phase",
  "risk",
  "runId",
  "schemaVersion",
  "sessionId",
  "specPath",
  "traceId",
  "updatedAt",
]

// Exact top-level key set of the judge receipt (the approved contract, agent/judge.md).
export const RECEIPT_KEYS = [
  "blockingCriteria",
  "completionPayload",
  "evidencePaths",
  "gateReport",
  "judge",
  "judgedAt",
  "rubricScore",
  "schemaVersion",
  "sourceHash",
  "tier",
  "verdict",
]

/**
 * The legal edge table. Every other edge is refused with exit 2 and no write.
 * Aborted is the operator escape hatch from every non-terminal phase; complete and
 * aborted are terminal.
 * validate -> execute is the autofix edge for a structurally valid red gate (advisory when attempts >= maxAttempts).
 * judge -> validate and refine -> validate allow re-validation without dead-ending.
 * blocked -> execute allows explicitly blocked runs to resume coding without a new plan approval.
 */
export const TRANSITIONS = {
  prepare: ["awaiting_plan_approval", "blocked", "aborted"],
  awaiting_plan_approval: ["execute", "blocked", "aborted"],
  execute: ["validate", "blocked", "aborted"],
  validate: ["judge", "execute", "blocked", "aborted"],
  judge: ["refine", "validate", "revision_requested", "blocked", "aborted"],
  refine: ["awaiting_confirmation", "validate", "revision_requested", "blocked", "aborted"],
  awaiting_confirmation: ["complete", "revision_requested", "aborted"],
  revision_requested: ["execute", "awaiting_plan_approval", "blocked", "aborted"],
  blocked: ["awaiting_plan_approval", "execute", "aborted"],
  aborted: [],
  complete: [],
}

// ---------------------------------------------------------------------------
// repository-local cross-process lock
//
// init and every transition serialize their read-validate-write through an atomic
// mkdir lock inside docs/harness/state/ (itself excluded from the source hash). The
// lock is held through the final rename and released in `finally`; a lock whose owner
// died or that is older than LOCK_STALE_MS is stolen, so a crashed process can never
// wedge the lifecycle.

export const LOCK_DIR = path.join("docs", "harness", "state", ".prevc.lock")
export const LOCK_TIMEOUT_MS = 10_000
export const LOCK_STALE_MS = 60_000

function pidAlive(pid) {
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function sleepMs(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
  } catch {
    // busy fallback when Atomics.wait is unavailable
  }
}

/** Resolve a repository directory and verify it cannot escape via symlink/junction. */
function safeRealDirectory(root, relative, label) {
  const dir = path.resolve(root, relative)
  let real
  try {
    real = fs.realpathSync(dir)
  } catch {
    return { ok: false, reason: `${label} directory missing: ${relative.replace(/\\/g, "/")}` }
  }
  if (resolveInsideRoot(root, real) === null) {
    return { ok: false, reason: `${label} directory ${relative.replace(/\\/g, "/")} resolves outside the repository — a symlink/junction escape is refused` }
  }
  return { ok: true, real }
}

function insideDir(parent, child) {
  return child === parent || child.startsWith(parent + path.sep)
}

/**
 * Stale-lock decision, pure and testable. A lock is stolen ONLY when it is old enough
 * AND its owner metadata is missing or dead: a fresh lock (owner.json not yet written
 * by the winner) is ACTIVE, and an old lock whose owner process is still alive is never
 * stolen on age alone.
 */
export function lockIsStale(owner, stat, { nowMs, alive }) {
  if (!stat) return { stale: false, reason: "lock vanished" }
  const age = nowMs - stat.mtimeMs
  const overAge = age > LOCK_STALE_MS
  if (!overAge) return { stale: false, reason: "fresh" }
  if (owner === null || typeof owner !== "object" || Array.isArray(owner)) {
    return { stale: true, reason: "owner metadata missing or unreadable" }
  }
  if (!alive) return { stale: true, reason: "owner dead" }
  return { stale: false, reason: "owner alive" }
}

export function acquireLock(root, { timeoutMs = LOCK_TIMEOUT_MS, staleMs = LOCK_STALE_MS, sleep = sleepMs, now = Date.now } = {}) {
  fs.mkdirSync(path.join(root, path.dirname(STATE_PATH)), { recursive: true }) // the lock lives here; init may not have created it yet
  const stateDir = safeRealDirectory(root, path.dirname(STATE_PATH), "state")
  if (!stateDir.ok) return stateDir
  const token = crypto.randomUUID()
  const lock = path.join(stateDir.real, path.basename(LOCK_DIR))
  const deadline = now() + timeoutMs
  for (;;) {
    try {
      fs.mkdirSync(lock) // atomic: EEXIST when held
      fs.writeFileSync(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid, token, at: new Date(now()).toISOString() }))
      return { ok: true, lock, token }
    } catch (error) {
      if (error.code !== "EEXIST") return { ok: false, reason: `cannot acquire the lifecycle lock: ${error.message}` }
      let stat = null
      try {
        stat = fs.statSync(lock)
      } catch {
        continue // lock vanished between checks; retry immediately
      }
      let owner = null
      try {
        owner = JSON.parse(fs.readFileSync(path.join(lock, "owner.json"), "utf8"))
      } catch {
        owner = null // fresh winner mid-write, or unreadable metadata
      }
      const decision = lockIsStale(owner, stat, { nowMs: now(), alive: owner?.pid ? pidAlive(owner.pid) : false })
      if (decision.stale) {
        const reclaimed = tryReclaimMainLock({ stateDirReal: stateDir.real, lock, timeoutMs, staleMs, sleep, now })
        if (!reclaimed.ok) return reclaimed // fail closed: manual cleanup documented
        if (reclaimed.acquired) return reclaimed.acquired // main lock reacquired under the recovery mutex
        // re-read showed a live/nonstale lock: release happened inside; resume normal wait
        continue
      }
      if (now() > deadline) {
        return { ok: false, reason: `timed out waiting for the lifecycle lock (${timeoutMs}ms)` }
      }
      sleep(25)
    }
  }
}

/**
 * Release ONLY when this owner's random token still owns the lock. If the lock was
 * re-owned (stolen and recreated, or the token changed), leave it alone.
 */
export function releaseLock(lock, token) {
  try {
    let owner = null
    try {
      owner = JSON.parse(fs.readFileSync(path.join(lock, "owner.json"), "utf8"))
    } catch {
      owner = null
    }
    if (owner?.token === token) fs.rmSync(lock, { recursive: true, force: true })
    // otherwise: reowned — never delete another owner's lock
  } catch {
    // already gone
  }
}

// ---------------------------------------------------------------------------
// recovery mutex
//
// Stale reclaim has a check-then-act race: two contenders can both decide a lock is
// stale, both remove it, and both proceed as owners. Reclaim therefore happens under a
// SECOND repository-local mutex (docs/harness/state/.prevc-recover.lock) held across
// re-read -> stale decision -> stale removal -> main-lock reacquire. The recovery
// mutex itself NEVER auto-steals: bounded timeout, fail closed. A crash while holding
// it can leave it behind — remove docs/harness/state/.prevc-recover.lock manually
// (its owner.json names the dead owner).

export const RECOVERY_LOCK_NAME = ".prevc-recover.lock"

function acquireRecoveryMutex(stateDirReal, { timeoutMs, sleep, now }) {
  const recLock = path.join(stateDirReal, RECOVERY_LOCK_NAME)
  const token = crypto.randomUUID()
  const deadline = now() + Math.min(timeoutMs, LOCK_TIMEOUT_MS)
  for (;;) {
    try {
      fs.mkdirSync(recLock) // atomic: EEXIST when held; NEVER stolen
      fs.writeFileSync(path.join(recLock, "owner.json"), JSON.stringify({ pid: process.pid, token, at: new Date(now()).toISOString() }))
      return { ok: true, lock: recLock, token }
    } catch (error) {
      if (error.code !== "EEXIST") return { ok: false, reason: `cannot acquire the recovery mutex: ${error.message}` }
      if (now() > deadline) {
        return { ok: false, reason: `timed out waiting for the recovery mutex ${RECOVERY_LOCK_NAME} — remove it manually if its owner crashed` }
      }
      sleep(25)
    }
  }
}

function releaseRecoveryMutex(lock, token) {
  releaseLock(lock, token)
}

/**
 * Under the recovery mutex: re-read the main lock, decide stale again, remove it, and
 * reacquire it — all while no other contender can be reclaiming. Returns:
 *  - { ok: false, reason }  fail closed (recovery mutex unavailable / recreate failed)
 *  - { ok: true, acquired } the main lock is now OURS
 *  - { ok: true, acquired: null } the main lock turned live/nonstale: resume normal wait
 */
function tryReclaimMainLock({ stateDirReal, lock, timeoutMs, staleMs, sleep, now }) {
  const rec = acquireRecoveryMutex(stateDirReal, { timeoutMs, sleep, now })
  if (!rec.ok) return rec
  try {
    let stat = null
    try {
      stat = fs.statSync(lock)
    } catch {
      stat = null
    }
    let owner = null
    try {
      owner = JSON.parse(fs.readFileSync(path.join(lock, "owner.json"), "utf8"))
    } catch {
      owner = null
    }
    const redecided = lockIsStale(owner, stat, { nowMs: now(), alive: owner?.pid ? pidAlive(owner.pid) : false })
    if (!redecided.stale) return { ok: true, acquired: null } // someone else reclaimed it: resume normal wait
    fs.rmSync(lock, { recursive: true, force: true })
    try {
      const token = crypto.randomUUID()
      fs.mkdirSync(lock)
      fs.writeFileSync(path.join(lock, "owner.json"), JSON.stringify({ pid: process.pid, token, at: new Date(now()).toISOString() }))
      return { ok: true, acquired: { ok: true, lock, token } }
    } catch (error) {
      if (error.code === "EEXIST") {
        return { ok: false, reason: `main lock recreated concurrently while the recovery mutex was held — manual cleanup of docs/harness/state/.prevc.lock may be required` }
      }
      return { ok: false, reason: `cannot recreate the lifecycle lock: ${error.message}` }
    }
  } finally {
    releaseRecoveryMutex(rec.lock, rec.token)
  }
}

// ---------------------------------------------------------------------------
// state file



export function validateState(state) {
  const reasons = []
  if (typeof state !== "object" || state === null || Array.isArray(state)) {
    return { ok: false, reasons: ["state must be a JSON object"] }
  }
  const keys = Object.keys(state).sort()
  const LEGACY_STATE_KEYS = STATE_KEYS.filter((key) => key !== "traceId" && key !== "runId" && key !== "sessionId")
  const hasTraceIdentity = keys.includes("traceId") || keys.includes("runId") || keys.includes("sessionId")
  if (hasTraceIdentity) {
    if (keys.length !== STATE_KEYS.length || !STATE_KEYS.every((key) => keys.includes(key))) {
      reasons.push(`state must carry exactly the keys ${STATE_KEYS.join(",")}`)
    }
    for (const key of ["traceId", "runId", "sessionId"]) {
      if (!validateId(state[key])) {
        reasons.push(`${key} must be a stable trace id (3-192 chars of [A-Za-z0-9._:-], no leading separator)`)
      }
    }
  } else {
    // Pre-trace (legacy) state stays readable so the live lifecycle survives the
    // schema extension; the first successful transition binds it to the full shape.
    if (keys.length !== LEGACY_STATE_KEYS.length || !LEGACY_STATE_KEYS.every((key) => keys.includes(key))) {
      reasons.push(`state must carry exactly the keys ${LEGACY_STATE_KEYS.join(",")} (trace identity keys are added by the first transition)`)
    }
  }
  if (state.schemaVersion !== SCHEMA_VERSION) reasons.push(`schemaVersion must be ${SCHEMA_VERSION}`)
  if (typeof state.objective !== "string" || state.objective.length === 0) reasons.push("objective must be a non-empty string")
  if (typeof state.specPath !== "string" || state.specPath.length === 0) reasons.push("specPath must be a non-empty string")
  if (!PHASES.includes(state.phase)) reasons.push(`unknown phase ${JSON.stringify(state.phase)}`)
  if (!RISKS.includes(state.risk)) reasons.push(`unknown risk ${JSON.stringify(state.risk)}`)
  if (state.gateSourceHash !== null && typeof state.gateSourceHash !== "string") reasons.push("gateSourceHash must be a string or null")
  if (state.judgeReceiptPath !== null && typeof state.judgeReceiptPath !== "string") reasons.push("judgeReceiptPath must be a string or null")
  if (state.operatorDecision !== null && !OPERATOR_ACTIONS.includes(state.operatorDecision)) {
    reasons.push(`operatorDecision must be one of ${OPERATOR_ACTIONS.join("|")} or null`)
  }
  if (state.blocker !== null && typeof state.blocker !== "string") reasons.push("blocker must be a string or null")
  if (typeof state.updatedAt !== "string" || state.updatedAt.length === 0) reasons.push("updatedAt must be a timestamp string")
  if (!Array.isArray(state.history) || state.history.length === 0) {
    reasons.push("history must be a non-empty array")
  } else {
    for (const entry of state.history) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        reasons.push("history entries must be JSON objects")
        continue
      }
      const entryKeys = Object.keys(entry).sort()
      const legacyEntry = entryKeys.length === 2 && entryKeys.includes("phase") && entryKeys.includes("at")
      const tracedEntry = entryKeys.length === 3 && entryKeys.includes("phase") && entryKeys.includes("at") && entryKeys.includes("eventId")
      if (!legacyEntry && !tracedEntry) {
        reasons.push("history entries must carry exactly the keys phase,at (legacy) or phase,at,eventId")
      }
      if (entry.eventId !== undefined && !validateId(entry.eventId)) {
        reasons.push("history eventId must be a stable trace event id")
      }
      if (!PHASES.includes(entry.phase)) reasons.push(`history entry has unknown phase ${JSON.stringify(entry.phase)}`)
      if (typeof entry.at !== "string" || entry.at.length === 0) reasons.push("history entries must carry a timestamp string `at`")
    }
  }
  return { ok: reasons.length === 0, reasons }
}

export function readState(root) {
  const file = path.join(root, STATE_PATH)
  const text = readTextIfExists(file)
  if (!text.trim()) return { ok: false, reason: `no lifecycle state at ${STATE_PATH} — run 'init' first` }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { ok: false, reason: `lifecycle state at ${STATE_PATH} is not valid JSON (${error.message})` }
  }
  const check = validateState(parsed)
  if (!check.ok) return { ok: false, reason: `lifecycle state at ${STATE_PATH} is invalid: ${check.reasons.join("; ")}` }
  return { ok: true, state: parsed }
}

/** Atomic replace: write a sibling temp file, then rename over the target. */
export function writeStateAtomic(root, state) {
  const file = path.join(root, STATE_PATH)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`)
  try {
    fs.renameSync(tmp, file)
  } catch (error) {
    try {
      fs.rmSync(tmp, { force: true })
    } catch {
      // best-effort temp cleanup
    }
    throw error
  }
}

function validateInitArguments({ objective, spec, risk }) {
  if (typeof objective !== "string" || objective.length === 0) return { ok: false, reason: "init requires --objective <text>" }
  if (typeof spec !== "string" || spec.length === 0) return { ok: false, reason: "init requires --spec <path>" }
  if (!RISKS.includes(risk)) return { ok: false, reason: `init requires --risk one of ${RISKS.join("|")}` }
  return { ok: true }
}

function createInitialState(root, { objective, spec, risk, kind, data = {} }) {
  const valid = validateInitArguments({ objective, spec, risk })
  if (!valid.ok) return valid
  const now = new Date().toISOString()
  const traceId = newId("trace")
  const runId = newId("run")
  const sessionId = newId("ses")
  const opened = openLifecycleTrace(root, { traceId, runId, sessionId, phase: "prepare", kind, now, data: { ...data, risk, objective } })
  if (!opened.ok) return opened
  return {
    ok: true,
    state: {
      schemaVersion: SCHEMA_VERSION,
      objective,
      specPath: toPosix(spec),
      phase: "prepare",
      risk,
      traceId,
      runId,
      sessionId,
      gateSourceHash: null,
      judgeReceiptPath: null,
      operatorDecision: null,
      blocker: null,
      updatedAt: now,
      history: [{ phase: "prepare", at: now, eventId: opened.eventId }],
    },
  }
}

function archiveState(root, previous) {
  const directory = path.join(root, ARCHIVE_DIR)
  try {
    fs.mkdirSync(directory, { recursive: true })
  } catch (error) {
    return { ok: false, reason: `cannot prepare archive directory: ${error.message}` }
  }
  const archiveDirectory = safeRealDirectory(root, ARCHIVE_DIR, "archive")
  if (!archiveDirectory.ok) return archiveDirectory

  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  let suffix = 0
  let filename
  let target
  do {
    const extra = suffix === 0 ? "" : `-${suffix}`
    filename = `prevc-${stamp}-${previous.phase}${extra}.json`
    target = path.join(archiveDirectory.real, filename)
    suffix += 1
    try {
      fs.lstatSync(target)
    } catch (error) {
      if (error.code === "ENOENT") break
      return { ok: false, reason: `cannot inspect archive target: ${error.message}` }
    }
  } while (true)

  if (resolveInsideRoot(root, target) === null) {
    return { ok: false, reason: `archive target ${filename} resolves outside the repository — a symlink/junction escape is refused` }
  }
  const temporary = `${target}.tmp-${process.pid}`
  let descriptor = null
  try {
    descriptor = fs.openSync(temporary, "wx")
    fs.writeFileSync(descriptor, `${JSON.stringify(previous, null, 2)}\n`)
    fs.closeSync(descriptor)
    descriptor = null
    fs.renameSync(temporary, target)
  } catch (error) {
    if (descriptor !== null) {
      try {
        fs.closeSync(descriptor)
      } catch {
        // best-effort descriptor cleanup
      }
    }
    try {
      fs.rmSync(temporary, { force: true })
    } catch {
      // best-effort temp cleanup
    }
    return { ok: false, reason: `cannot archive lifecycle state: ${error.message}` }
  }
  return { ok: true, relative: toPosix(path.relative(root, target)) }
}

export function initState({ root, objective, spec, risk }) {
  const acquired = acquireLock(root)
  if (!acquired.ok) return acquired
  try {
    return initStateLocked({ root, objective, spec, risk })
  } finally {
    releaseLock(acquired.lock, acquired.token)
  }
}

function initStateLocked({ root, objective, spec, risk }) {
  const file = path.join(root, STATE_PATH)
  if (fs.existsSync(file)) {
    return { ok: false, reason: `lifecycle state already exists at ${STATE_PATH} — init refuses to overwrite it` }
  }
  const created = createInitialState(root, { objective, spec, risk, kind: "init" })
  if (!created.ok) return created
  writeStateAtomic(root, created.state)
  return created
}

export function rotateState({ root, objective = null, spec = null, risk = null }) {
  const acquired = acquireLock(root)
  if (!acquired.ok) return acquired
  try {
    return rotateStateLocked({ root, objective, spec, risk })
  } finally {
    releaseLock(acquired.lock, acquired.token)
  }
}

function rotateStateLocked({ root, objective, spec, risk }) {
  const current = readState(root)
  if (!current.ok) return current
  const previous = current.state
  if (!["aborted", "complete"].includes(previous.phase)) {
    return { ok: false, reason: `rotate requires a terminal phase (aborted|complete); current phase is ${previous.phase}` }
  }
  const next = {
    objective: objective ?? previous.objective,
    spec: spec ?? previous.specPath,
    risk: risk ?? previous.risk,
  }
  const valid = validateInitArguments(next)
  if (!valid.ok) return { ...valid, reason: valid.reason.replace(/^init/, "rotate") }
  const archived = archiveState(root, previous)
  if (!archived.ok) return archived
  const created = createInitialState(root, { ...next, kind: "rotate", data: { archived: archived.relative } })
  if (!created.ok) return created
  writeStateAtomic(root, created.state)
  return { ...created, archive: archived.relative }
}

export function inspectState(root) {
  return readState(root)
}

// ---------------------------------------------------------------------------
// the gate contract

/** Newest full-mode quality report candidate — malformed files fail closed (see newestFullReportCandidate). */
export function latestFullGateReport(root) {
  return newestFullReportCandidate(root)
}

/** The report's rows must be an array of plain objects with a known status for the gate to read them. */
export const ROW_STATUSES = ["pass", "fail", "observe", "unavailable", "not_configured", "not_applicable"]
export function reportRowsValid(report) {
  return (
    Array.isArray(report.rows) &&
    report.rows.every((row) => row !== null && typeof row === "object" && !Array.isArray(row) && ROW_STATUSES.includes(row.status))
  )
}

/**
 * Scan docs/harness/quality/*.json newest-first (filename sort, like findReport) for the
 * full-mode report. The FIRST file that cannot be read as a JSON object fails closed:
 * its mode is unknowable, so an older green must never be reached past it.
 */
export function newestFullReportCandidate(root) {
  const lexical = path.join(root, REPORT_DIR)
  if (!fs.existsSync(lexical)) return null // no gate reports at all
  const dirCheck = safeRealDirectory(root, REPORT_DIR, "gate")
  if (!dirCheck.ok) return { report: null, file: null, malformed: true, reason: dirCheck.reason }
  const dir = dirCheck.real
  let names
  try {
    names = fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort().reverse()
  } catch {
    return { report: null, file: null, malformed: true, reason: `gate directory ${REPORT_DIR.replace(/\\/g, "/")} is unreadable` }
  }
  for (const name of names) {
    const file = path.join(REPORT_DIR, name)
    const full = path.join(dir, name)
    let stat
    try {
      stat = fs.lstatSync(full)
    } catch {
      return { report: null, file, malformed: true, reason: `quality report ${name} is unreadable` }
    }
    if (!stat.isFile()) {
      return { report: null, file, malformed: true, reason: `quality report ${name} is not a regular file — symlinks and directories are refused` }
    }
    let real
    try {
      real = fs.realpathSync(full)
    } catch {
      return { report: null, file, malformed: true, reason: `quality report ${name} is unresolvable` }
    }
    if (!insideDir(dir, real)) {
      return { report: null, file, malformed: true, reason: `quality report ${name} resolves outside the gate directory — a symlink escape is refused` }
    }
    const text = readTextIfExists(real) // read the VERIFIED real path
    let report = null
    try {
      report = JSON.parse(text)
    } catch {
      return { report: null, file, malformed: true, reason: `newest quality report ${file.replace(/\\/g, "/")} is not readable JSON — its mode is unknowable, so no older report can vouch for the tree; re-run the gate at --mode full` }
    }
    if (typeof report !== "object" || report === null || Array.isArray(report)) {
      return { report: null, file, malformed: true, reason: `newest quality report ${file.replace(/\\/g, "/")} is not a JSON object — its mode is unknowable; re-run the gate at --mode full` }
    }
    if (report.mode !== "full") continue
    return { report, file, malformed: false }
  }
  return null
}

/**
 * Green AND fresh — and the NEWEST full report is authoritative. A newer red report
 * overrides an older green one: falling back to the older green would vouch for a gate
 * the tree has already outgrown. Missing, red, unconfigured, empty, hashless, stale,
 * and future/malformed-timestamp gates all fail closed here. `kind` classifies the
 * failure: missing | red | invalid | stale | no-git, so the caller can decide whether
 * a red gate must additionally persist `blocked`.
 */
export function validateReportTimestamp(report, { now = Date.now(), skewMs = 5 * 60 * 1000 } = {}) {
  const timestamp = report?.timestamp
  if (typeof timestamp !== "string" || !ISO_TIMESTAMP.test(timestamp)) {
    return { ok: false, reason: `${JSON.stringify(timestamp)} is not a full ISO 8601 timestamp` }
  }
  const ms = Date.parse(timestamp)
  if (!Number.isFinite(ms)) return { ok: false, reason: `${timestamp} does not parse to a finite timestamp` }
  if (ms > now + skewMs) return { ok: false, reason: `${timestamp} is materially in the future` }
  return { ok: true, ms }
}

// A gate report may be written milliseconds before the validate entry that follows it in
// the same cycle; this slack keeps the cycle-binding check deterministic across clock and
// scheduling precision.
export const REPORT_PREDATE_TOLERANCE_MS = 5_000

export function gateCheck(root, { git, notBefore } = {}) {
  const found = latestFullGateReport(root)
  if (!found) {
    return { ok: false, kind: "missing", reason: `no full-mode gate report in ${REPORT_DIR} — run the gate at --mode full first`, report: null, currentHash: null }
  }
  if (found.malformed) {
    return {
      ok: false,
      kind: "invalid",
      reason: found.reason ?? `newest quality report ${found.file ?? "(unknown)"} is not readable JSON — its mode is unknowable, so no older report can vouch for the tree; re-run the gate at --mode full`,
      report: null,
      currentHash: null,
    }
  }
  const { report, file } = found
  const timestampCheck = validateReportTimestamp(report)
  if (!timestampCheck.ok) {
    return {
      ok: false,
      kind: "invalid",
      reason: `gate report ${file} has an invalid timestamp: ${timestampCheck.reason}; re-run the gate at --mode full`,
      report,
      currentHash: null,
    }
  }
  if (notBefore !== undefined && notBefore !== null && timestampCheck.ms + REPORT_PREDATE_TOLERANCE_MS < notBefore) {
    return {
      ok: false,
      kind: "invalid",
      reason: `gate report ${file} (${report.timestamp}) predates the current validate cycle (${new Date(notBefore).toISOString()}) — a fresh gate run is required before judging`,
      report,
      currentHash: null,
    }
  }
  if (report.verdict !== "pass") {
    const rowsValid = reportRowsValid(report)
    return {
      ok: false,
      kind: "red",
      rowsValid,
      reason: rowsValid
        ? `gate report ${file} is ${report.verdict} at --mode full — sinal de loop: o judge espera gate verde; volte para execute com o diagnóstico abaixo, corrija e re-rode o gate`
        : `gate report ${file} is ${report.verdict} with malformed rows — it cannot be read to persist a blocker; re-run the gate`,
      report,
      currentHash: null,
    }
  }
  // verdict pass: the report must still be CREDIBLE — aligned with checkReportShape —
  // and its metric rows must be structurally sound; a pass with garbage rows measured nothing.
  const shape = checkReportShape(report)
  if (!shape.credible) {
    return { ok: false, kind: "invalid", reason: `gate report ${file} is not credible: ${shape.reason}; re-run the gate at --mode full`, report, currentHash: null }
  }
  if (!reportRowsValid(report)) {
    return {
      ok: false,
      kind: "invalid",
      reason: `gate report ${file} is pass but carries malformed metric rows — cannot advance; re-run the gate at --mode full`,
      report,
      currentHash: null,
    }
  }
  const currentHash = sourceHash(root, { git: git ?? makeGit(root), fresh: true })
  if (currentHash === null) {
    return { ok: false, kind: "no-git", reason: "not a git repository — cannot verify the gate is fresh", report, currentHash: null }
  }
  if (report.sourceHash !== currentHash) {
    return {
      ok: false,
      kind: "stale",
      reason: `gate report ${file} is stale: report sourceHash ${report.sourceHash} does not match the tree (${currentHash}); re-run the gate at --mode full`,
      report,
      currentHash,
    }
  }
  return { ok: true, kind: null, report, file, currentHash }
}

/**
 * Derive the validate->blocked blocker from the newest full report: red rows keep
 * metric/value/threshold. Malformed rows fail closed ({ ok: false }) so nothing is
 * written from an unreadable report.
 */
export function gateBlockerText(root, { git } = {}) {
  const found = newestFullReportCandidate(root)
  if (!found) return { ok: true, text: "sinal: no full-mode gate report found — run the gate at --mode full first" }
  if (found.malformed) {
    return { ok: false, reason: found.reason ?? `newest quality report ${found.file ?? "(unknown)"} is not readable JSON — its mode is unknowable; re-run the gate at --mode full` }
  }
  const { report } = found
  if (report.verdict !== "pass") {
    if (!reportRowsValid(report)) {
      return { ok: false, reason: `gate report ${found.file} is ${report.verdict} with malformed rows — cannot derive a blocker; re-run the gate at --mode full` }
    }
    const red = report.rows.filter((row) => row.status === "fail")
    if (red.length === 0) return { ok: true, text: `sinal: gate verdict ${report.verdict} at --mode full (no red rows parsed)` }
    const detail = red
      .map((row) => {
        const value = row.value === undefined ? "unavailable" : String(row.value)
        return `${row.metric}=${value} (needs ${row.direction === "min" ? ">=" : "<="} ${row.threshold})`
      })
      .join("; ")
    return { ok: true, text: `sinal: gate red at --mode full: ${detail}` }
  }
  const currentHash = sourceHash(root, { git: git ?? makeGit(root), fresh: true })
  if (currentHash !== null && report.sourceHash !== currentHash) {
    return { ok: true, text: `sinal: gate report is stale (report sourceHash ${report.sourceHash}, tree ${currentHash}) — re-run the gate at --mode full` }
  }
  return { ok: true, text: "sinal: latest full gate is green but stale or unverifiable — re-run the gate at --mode full" }
}

// ---------------------------------------------------------------------------
// the judge receipt

/** True when the path is a regular file (symlinks and directories refused), with no escape via realpath. */
function regularFileInside(root, candidate, { expectUnder, label }) {
  const resolved = resolveInsideRoot(root, candidate)
  if (resolved === null) return { ok: false, reason: `${label} ${JSON.stringify(candidate)} is outside the repository — refused` }
  if (expectUnder) {
    const base = path.resolve(root, expectUnder)
    if (!(resolved === base || resolved.startsWith(base + path.sep))) {
      return { ok: false, reason: `${label} ${JSON.stringify(candidate)} must live under ${expectUnder.replace(/\\/g, "/")}` }
    }
  }
  let stat
  try {
    stat = fs.lstatSync(resolved)
  } catch {
    return { ok: false, reason: `${label} not found: ${candidate}` }
  }
  if (!stat.isFile()) return { ok: false, reason: `${label} ${JSON.stringify(candidate)} is not a regular file — symlinks and directories are refused` }
  let real
  try {
    real = fs.realpathSync(resolved)
  } catch {
    return { ok: false, reason: `${label} not found: ${candidate}` }
  }
  if (resolveInsideRoot(root, real) === null) {
    return { ok: false, reason: `${label} ${JSON.stringify(candidate)} resolves outside the repository — a symlink escape is refused` }
  }
  if (expectUnder) {
    let baseReal
    try {
      baseReal = fs.realpathSync(path.resolve(root, expectUnder))
    } catch {
      return { ok: false, reason: `${label} base directory missing: ${expectUnder.replace(/\\/g, "/")}` }
    }
    if (!insideDir(baseReal, real)) {
      return { ok: false, reason: `${label} ${JSON.stringify(candidate)} resolves outside ${expectUnder.replace(/\\/g, "/")} — a symlink/junction escape is refused` }
    }
  }
  return { ok: true, resolved, real }
}

/**
 * The exact judge JSON contract (agent/judge.md): exactly eleven keys, every
 * field required; the receipt must be a regular file under docs/harness/judge/ and every
 * path inside it must be a real in-repo regular file.
 */
export function parseJudgeReceipt(root, receiptPath) {
  if (typeof receiptPath !== "string" || receiptPath.length === 0) {
    return { ok: false, reason: "judge transitions require --judge-receipt <path>" }
  }
  const located = regularFileInside(root, receiptPath, { expectUnder: JUDGE_DIR, label: "judge receipt" })
  if (!located.ok) return located
  const text = readTextIfExists(located.real) // read the VERIFIED real path, never the lexical one
  let receipt
  try {
    receipt = JSON.parse(text)
  } catch (error) {
    return { ok: false, reason: `judge receipt ${receiptPath} is not valid JSON (${error.message})` }
  }
  if (typeof receipt !== "object" || receipt === null || Array.isArray(receipt)) {
    return { ok: false, reason: `judge receipt ${receiptPath} must be a JSON object` }
  }
  const problems = []
  const keys = Object.keys(receipt).sort()
  if (keys.length !== RECEIPT_KEYS.length || !RECEIPT_KEYS.every((key) => keys.includes(key))) {
    problems.push(`exact key set required: ${RECEIPT_KEYS.join(",")}`)
  }
  const completion = validateCompletionPayload(receipt.completionPayload)
  if (!completion.valid) problems.push(`completionPayload is invalid: ${completion.errors.join(",")}`)
  if (completion.valid) {
    const invalidEvidencePath = receipt.completionPayload.evidence.some((record) => {
      const evidencePath = record?.path
      const normalizedEvidencePath = typeof evidencePath === "string" ? evidencePath.replaceAll("\\", "/") : ""
      const escapesRoot = normalizedEvidencePath === ".." || normalizedEvidencePath.startsWith("../")
      return (
        typeof evidencePath !== "string" ||
        evidencePath.length === 0 ||
        path.isAbsolute(evidencePath) ||
        path.posix.isAbsolute(evidencePath) ||
        path.win32.isAbsolute(evidencePath) ||
        escapesRoot
      )
    })
    if (invalidEvidencePath) problems.push("completionPayload evidence paths must be non-empty relative paths")
  }
  if (receipt.schemaVersion !== 1) problems.push(`schemaVersion must be 1 (got ${JSON.stringify(receipt.schemaVersion)})`)
  if (typeof receipt.sourceHash !== "string" || receipt.sourceHash.length === 0) problems.push("sourceHash must be a non-empty string")
  if (!RECEIPT_VERDICTS.includes(receipt.verdict)) problems.push(`verdict must be one of ${RECEIPT_VERDICTS.join("|")}`)
  if (receipt.judge !== "judge") problems.push(`judge must be "judge" (got ${JSON.stringify(receipt.judge)})`)
  if (!RECEIPT_TIERS.includes(receipt.tier)) problems.push(`tier must be one of ${RECEIPT_TIERS.join("|")}`)
  if (typeof receipt.rubricScore !== "number" || !Number.isFinite(receipt.rubricScore) || receipt.rubricScore < 0 || receipt.rubricScore > 10) {
    problems.push("rubricScore must be a number between 0 and 10")
  }
  if (typeof receipt.judgedAt !== "string" || receipt.judgedAt.length === 0) problems.push("judgedAt must be a timestamp string")

  // gateReport: canonical path under docs/harness/quality naming an existing regular file.
  if (typeof receipt.gateReport !== "string" || receipt.gateReport.length === 0) {
    problems.push("gateReport must name the judged gate report")
  } else {
    const gate = regularFileInside(root, receipt.gateReport, { expectUnder: REPORT_DIR, label: "gateReport" })
    if (!gate.ok) problems.push(`gateReport is not a real report file: ${gate.reason}`)
  }

  // blockingCriteria: non-empty strings; verdict accept requires none, revise/block at least one.
  if (!Array.isArray(receipt.blockingCriteria) || receipt.blockingCriteria.some((item) => typeof item !== "string" || item.length === 0)) {
    problems.push("blockingCriteria must be an array of non-empty strings")
  } else if (receipt.verdict === "accept" && receipt.blockingCriteria.length > 0) {
    problems.push("verdict accept requires an empty blockingCriteria")
  } else if (receipt.verdict !== "accept" && receipt.blockingCriteria.length === 0) {
    problems.push(`verdict ${receipt.verdict} requires at least one blocking criterion`)
  }

  // evidencePaths: non-empty relative repo paths that exist as regular files.
  if (!Array.isArray(receipt.evidencePaths) || receipt.evidencePaths.length === 0) {
    problems.push("evidencePaths must be a non-empty array of relative repo paths")
  } else {
    for (const entry of receipt.evidencePaths) {
      if (typeof entry !== "string" || entry.length === 0 || path.isAbsolute(entry)) {
        problems.push(`evidencePaths entries must be non-empty relative paths (got ${JSON.stringify(entry)})`)
        continue
      }
      const evidence = regularFileInside(root, entry, { label: "evidencePaths entry" })
      if (!evidence.ok) problems.push(`evidencePaths entry is not an existing in-repo regular file: ${evidence.reason}`)
    }
  }

  if (problems.length > 0) return { ok: false, reason: `judge receipt ${receiptPath} is invalid: ${problems.join("; ")}` }
  return { ok: true, receipt, resolved: located.real, relative: toPosix(path.relative(root, located.real)) }
}

/**
 * Reads review files from docs/harness/review/, returning regular files with metadata.
 */
export function listReviewFiles(root) {
  const reviewDir = path.join(root, REVIEW_DIR)
  let reviewFiles = []
  try {
    if (fs.existsSync(reviewDir) && fs.statSync(reviewDir).isDirectory()) {
      reviewFiles = fs
        .readdirSync(reviewDir)
        .map((name) => {
          const fullPath = path.join(reviewDir, name)
          const stat = fs.statSync(fullPath)
          return { name, fullPath, mtimeMs: stat.mtimeMs, isFile: stat.isFile() }
        })
        .filter((file) => file.isFile)
    }
  } catch {
    // failed directory scan leaves reviewFiles empty
  }
  return reviewFiles
}

// ---------------------------------------------------------------------------
// trace identity binding (T01 contract)

/** Root events that open a lifecycle in the trace: session -> run -> first phase. */
function openLifecycleTrace(root, { traceId, runId, sessionId, phase, kind, now, data = {} }) {
  const corrupt = readTrace(root)
  if (corrupt.errors.length > 0) {
    return {
      ok: false,
      reason: `trace stream ${TRACE_PATH.replace(/\\/g, "/")} is corrupt (${corrupt.errors.length} bad line(s)) — run 'node scripts/harness-trace.mjs --verify' before lifecycle writes`,
    }
  }

  const base = { trace_id: traceId, run_id: runId, session_id: sessionId, ts: now }
  const session = appendEvent(root, JSON.stringify({ ...base, entity: { type: "session", id: sessionId }, parent: null, kind: "start" }))
  if (!session.ok) return session
  const run = appendEvent(root, JSON.stringify({ ...base, entity: { type: "run", id: runId }, parent: { type: "session", id: sessionId }, kind: "start" }))
  if (!run.ok) return run
  const eventId = newId("evt")
  const phaseEvent = appendEvent(root, JSON.stringify({ ...base, event_id: eventId, entity: { type: "phase", id: newId("phase") }, parent: { type: "run", id: runId }, kind, outcome: phase, data: { ...data, phase } }))
  if (!phaseEvent.ok) return phaseEvent
  return { ok: true, eventId }
}

/** Appends the transition event for one lifecycle write; the stream refuses corruption itself. */
function appendPhaseEvent(root, { state, from, to, eventId, now, data }) {
  return appendEvent(
    root,
    JSON.stringify({
      event_id: eventId,
      trace_id: state.traceId,
      run_id: state.runId,
      session_id: state.sessionId,
      ts: now,
      entity: { type: "phase", id: newId("phase") },
      parent: { type: "run", id: state.runId },
      kind: "transition",
      outcome: to,
      data,
    }),
  )
}

/**
 * Pre-trace (legacy) state is bound to a fresh stable identity on the FIRST successful
 * write after the upgrade: the session/run roots and a `migrate` phase event are
 * appended, and the bound shape is returned for the state replacement. Refused
 * transitions never reach this point, so a legacy file stays untouched until a
 * transition actually succeeds.
 */
function bindLegacyState(root, state, { now }) {
  if (typeof state.traceId === "string" && state.traceId.length > 0) return { ok: true, bound: state }
  const traceId = newId("trace")
  const runId = newId("run")
  const sessionId = newId("ses")
  const opened = openLifecycleTrace(root, { traceId, runId, sessionId, phase: state.phase, kind: "migrate", now, data: { reason: "legacy state bound to trace identity" } })
  if (!opened.ok) return opened
  return { ok: true, bound: { ...state, traceId, runId, sessionId } }
}

// ---------------------------------------------------------------------------
/**
 * Derives the number of autofix attempts from state history.
 * Counts transitions validate -> execute since the last entry into execute whose previous phase was awaiting_plan_approval.
 */
export function countAutofixAttempts(history) {
  if (!Array.isArray(history) || history.length < 2) return 0

  let lastExecuteFromApprovalIdx = -1
  for (let i = 1; i < history.length; i++) {
    if (history[i]?.phase === "execute" && history[i - 1]?.phase === "awaiting_plan_approval") {
      lastExecuteFromApprovalIdx = i
    }
  }

  const startIdx = lastExecuteFromApprovalIdx !== -1 ? lastExecuteFromApprovalIdx : 0
  let attempts = 0
  for (let i = startIdx + 1; i < history.length; i++) {
    if (history[i]?.phase === "execute" && history[i - 1]?.phase === "validate") {
      attempts++
    }
  }
  return attempts
}

/**
 * Resolves max fix attempts from agent-os/project-profile.json (fixLoop.maxAttempts)
 * or DEFAULT_FIX_LOOP.maxAttempts, clamped to 1..10.
 */
export function resolveMaxFixAttempts(root) {
  let configured = null
  try {
    const res = readProjectProfile(root)
    if (res && res.ok && res.profile?.fixLoop && typeof res.profile.fixLoop.maxAttempts === "number") {
      configured = res.profile.fixLoop.maxAttempts
    }
  } catch {
    configured = null
  }
  const raw = configured ?? DEFAULT_FIX_LOOP?.maxAttempts ?? 3
  return Math.max(1, Math.min(10, Math.floor(raw)))
}

// transitions

function toPosix(value) {
  return value.split(path.sep).join("/")
}

/** The exact state shape — built field by field so no extra key can ever survive a transition. */
function nextState(state, { phase, gateSourceHash, judgeReceiptPath, operatorDecision, blocker, eventId, now = new Date().toISOString() }) {
  return {
    schemaVersion: state.schemaVersion,
    objective: state.objective,
    specPath: state.specPath,
    phase,
    risk: state.risk,
    traceId: state.traceId,
    runId: state.runId,
    sessionId: state.sessionId,
    gateSourceHash,
    judgeReceiptPath,
    operatorDecision,
    blocker,
    updatedAt: now,
    history: [...state.history, { phase, at: now, eventId }],
  }
}

/**
 * Transition the lifecycle. Every precondition is validated BEFORE any write, and the
 * state file is replaced atomically only on success — a refused transition (ok: false)
 * leaves the file byte-identical; gate failures and stale gates are refused without mutation.
 */
export function transitionState({ root, to, judgeReceipt = null, operatorAction = null, blocker = null, git }) {
  const acquired = acquireLock(root)
  if (!acquired.ok) return acquired
  try {
    return transitionStateLocked({ root, to, judgeReceipt, operatorAction, blocker, git })
  } finally {
    releaseLock(acquired.lock, acquired.token)
  }
}

function transitionStateLocked({ root, to, judgeReceipt = null, operatorAction = null, blocker = null, git }) {
  const current = readState(root)
  if (!current.ok) return current
  const { state } = current
  const from = state.phase
  let advisory = null
  if (typeof to !== "string" || !PHASES.includes(to)) {
    return { ok: false, reason: `unknown phase ${JSON.stringify(to)} — one of ${PHASES.join("|")}` }
  }
  if (!TRANSITIONS[from]?.includes(to)) {
    return { ok: false, reason: `transition ${from} -> ${to} is not in the lifecycle table` }
  }

  const consumesAction = to === "aborted" || to === "complete" || (from === "awaiting_confirmation" && to === "revision_requested")
  if (operatorAction !== null && operatorAction !== undefined) {
    if (!OPERATOR_ACTIONS.includes(operatorAction)) {
      return { ok: false, reason: `unknown operator action ${JSON.stringify(operatorAction)} — one of ${OPERATOR_ACTIONS.join("|")}` }
    }
    if (!consumesAction) {
      return { ok: false, reason: `--operator-action ${operatorAction} is not consumed by ${from} -> ${to}` }
    }
    if (operatorAction === "auto-confirm" && !(from === "awaiting_confirmation" && to === "complete")) {
      return { ok: false, reason: `--operator-action auto-confirm is not consumed by ${from} -> ${to}` }
    }
  }

  // -- receipt-gated edges: judge exits route by the receipt verdict. The receipt is
  // validated BEFORE the gate so a missing/invalid receipt is named, not masked by a
  // gate failure; the hash and report-identity tie-ins come after.
  let receipt = null
  if (from === "judge" && to !== "aborted" && to !== "validate") {
    const parsed = parseJudgeReceipt(root, judgeReceipt)
    if (!parsed.ok) return parsed
    const expected = { refine: "accept", revision_requested: "revise", blocked: "block" }[to]
    if (parsed.receipt.verdict !== expected) {
      return { ok: false, reason: `receipt verdict ${parsed.receipt.verdict} cannot route judge -> ${to}; expected ${expected}` }
    }
    receipt = parsed
  }

  // -- refine exits re-parse the receipt recorded at judge entry.
  if (from === "refine" && to !== "aborted" && to !== "validate") {
    if (state.judgeReceiptPath === null) {
      return { ok: false, reason: "refine exit requires a recorded judge receipt (state.judgeReceiptPath is null)" }
    }
    const parsed = parseJudgeReceipt(root, state.judgeReceiptPath)
    if (!parsed.ok) return { ok: false, reason: `recorded judge receipt is no longer valid: ${parsed.reason}` }
    const expected = { awaiting_confirmation: "accept", revision_requested: "revise", blocked: "block" }[to]
    if (parsed.receipt.verdict !== expected) {
      return { ok: false, reason: `receipt verdict ${parsed.receipt.verdict} cannot route refine -> ${to}; expected ${expected}` }
    }
    receipt = parsed
  }
  // -- autofix edge: validate -> execute (amendment R6.4, gate as signal revision GS-04)
  // Accepted ONLY when gateCheck finds the newest full report structurally valid and RED (kind red);
  // green, missing, stale or malformed -> refuse exit 2 without write.
  // When attempts >= maxAttempts, the transition is accepted without blocking, returning advisory.
  let gate = null
  if (from === "validate" && to === "execute") {
    gate = gateCheck(root, { git })
    if (gate.ok) {
      return { ok: false, reason: "gate report is green — autofix edge validate -> execute requires a red gate" }
    }
    if (gate.kind !== "red" || gate.rowsValid === false) {
      return { ok: false, reason: gate.reason ?? "gate report must be structurally valid and red to advance validate -> execute" }
    }
    const currentHash = sourceHash(root, { git: git ?? makeGit(root), fresh: true })
    if (currentHash !== null && gate.report?.sourceHash && gate.report.sourceHash !== currentHash) {
      return {
        ok: false,
        kind: "stale",
        reason: `gate report is stale: report sourceHash ${gate.report.sourceHash} does not match current tree (${currentHash})`,
      }
    }
    const attempts = countAutofixAttempts(state.history)
    const maxAttempts = resolveMaxFixAttempts(root)
    if (attempts >= maxAttempts) {
      const derived = gateBlockerText(root, { git })
      const metricDetail = derived.ok ? `: ${derived.text}` : ""
      advisory = `fix-loop-exhausted (${attempts}/${maxAttempts})${metricDetail}`
    }
  }

  // -- the gate, when the edge demands it: green AND fresh (sourceHash == current tree).
  // Gate-gated edges: validate -> judge, every judge exit except operator abort and validate,
  // and every refine exit except operator abort and validate.
  const gateRequired =
    (from === "validate" && to === "judge") ||
    (from === "judge" && to !== "aborted" && to !== "validate") ||
    (from === "refine" && to !== "aborted" && to !== "validate")
  // judge/refine exits bind the gate to the CURRENT validate cycle: a report from a
  // previous cycle (even hash-matching) cannot vouch for this run's judging.
  const validateEntries = state.history.filter((entry) => entry.phase === "validate")
  const notBefore = from === "validate" ? undefined : validateEntries.length > 0 ? Date.parse(validateEntries[validateEntries.length - 1].at) : undefined
  if (gateRequired) {
    gate = gateCheck(root, { git, notBefore })
    if (!gate.ok) {
      if (from === "judge" && to !== "aborted" && to !== "validate" && gate.kind === "stale") {
        return {
          ok: false,
          kind: "stale",
          reason: gate.reason || "gate report is stale — re-run the gate at --mode full",
        }
      }
      if (from === "validate" && to === "judge" && gate.kind === "red") {
        const derived = gateBlockerText(root, { git })
        const detail = derived.ok ? `: ${derived.text}` : ""
        return {
          ok: false,
          kind: "red",
          reason: `${gate.reason}${detail} — loop: rode transition --to execute com o diagnóstico`,
        }
      }
      return gate
    }
  }

  // -- the receipt must vouch for the very gate being judged: the state's recorded
  // gate hash, the newest full gate, and the receipt must all agree (three-way), and
  // the receipt must name the same exact report (canonical path under docs/harness/quality).
  if (receipt) {
    if (!gate) {
      return { ok: false, reason: "internal error: receipt-gated edge without a gate check" }
    }
    if (state.gateSourceHash !== gate.report.sourceHash) {
      return {
        ok: false,
        reason: `sinal: gate changed since judge entry (state gateSourceHash ${state.gateSourceHash}, newest gate ${gate.report.sourceHash}) — re-run the gate at --mode full`,
      }
    }
    const timeCheck = validateJudgedAt(receipt.receipt, state)
    if (!timeCheck.ok) return timeCheck
    if (gate.report.sourceHash !== receipt.receipt.sourceHash) {
      return {
        ok: false,
        reason: `receipt sourceHash ${receipt.receipt.sourceHash} does not match the latest full green gate (${gate.report.sourceHash})`,
      }
    }
    if (toPosix(receipt.receipt.gateReport) !== toPosix(gate.file)) {
      return {
        ok: false,
        reason: `receipt gateReport ${receipt.receipt.gateReport} does not match the newest full gate report ${toPosix(gate.file)}`,
      }
    }
    if (from === "judge" && to === "refine" && receipt.receipt.verdict === "accept" && (receipt.receipt.tier === "full" || state.risk === "high")) {
      const reviewFiles = listReviewFiles(root)
      const hasApprovedRedTeamReview = reviewFiles.some((file) => {
        const reviewContent = readTextIfExists(file.fullPath) ?? ""
        const sourceHashMatches = [...reviewContent.matchAll(/^sourceHash:\s*(.*)$/gm)]
        const hasHash = sourceHashMatches.some((m) => m[1].trim() === gate.report.sourceHash)
        const redTeamMatches = [...reviewContent.matchAll(/^Red-team:\s*(\d+)\s+tentativas/gm)]
        const hasAttempts = redTeamMatches.some((m) => {
          const n = parseInt(m[1], 10)
          return Number.isFinite(n) && n >= 3
        })
        const verdictMatches = [...reviewContent.matchAll(/^Verdict:\s*(.*)$/gm)]
        const hasApprove = verdictMatches.length > 0 && verdictMatches.every((m) => m[1].trim() === "APPROVE")
        return hasHash && hasAttempts && hasApprove
      })

      if (!hasApprovedRedTeamReview) {
        return {
          ok: false,
          reason: `tier full requires an approved red-team review bound to sourceHash ${gate.report.sourceHash}`,
        }
      }
    }
  }

  // -- blocked edges.
  let derivedBlocker = blocker ?? null
  if (to === "blocked") {
    if (from === "validate") {
      if (!blocker) {
        const derived = gateBlockerText(root, { git })
        if (!derived.ok) return derived
        derivedBlocker = derived.text
      }
    } else if (from === "judge" || from === "refine") {
      const criteria = (receipt?.receipt.blockingCriteria ?? []).filter((item) => typeof item === "string" && item.length > 0)
      derivedBlocker = blocker ?? `judge verdict block: ${criteria.length > 0 ? criteria.join("; ") : "no blocking criteria listed"}`
    }
    if (typeof derivedBlocker !== "string" || derivedBlocker.length === 0) {
      return { ok: false, reason: `transition to blocked requires --blocker <text>` }
    }
  }

  // -- operator-gated edges.
  if (to === "aborted" && operatorAction !== "abort") {
    return { ok: false, reason: "transition to aborted requires --operator-action abort" }
  }
  if (to === "complete") {
    if (operatorAction !== "confirm" && operatorAction !== "auto-confirm") {
      return { ok: false, reason: "complete requires --operator-action confirm or auto-confirm" }
    }
    if (operatorAction === "auto-confirm") {
      const locatedPolicy = regularFileInside(root, AUTONOMY_POLICY_PATH, { label: "autonomy policy" })
      if (!locatedPolicy.ok) {
        return { ok: false, reason: `auto-confirm requires autonomy policy file ${AUTONOMY_POLICY_PATH.replace(/\\/g, "/")}: ${locatedPolicy.reason}` }
      }
      let policy
      try {
        const text = readTextIfExists(locatedPolicy.real)
        policy = JSON.parse(text)
      } catch (error) {
        return { ok: false, reason: `autonomy policy ${AUTONOMY_POLICY_PATH.replace(/\\/g, "/")} is not valid JSON (${error.message})` }
      }
      if (typeof policy !== "object" || policy === null || Array.isArray(policy)) {
        return { ok: false, reason: `autonomy policy ${AUTONOMY_POLICY_PATH.replace(/\\/g, "/")} must be a JSON object` }
      }
      const policyKeys = Object.keys(policy).sort()
      const expectedKeys = ["autoConfirm", "maxRevisionCycles", "schemaVersion"]
      if (policyKeys.length !== expectedKeys.length || !expectedKeys.every((key) => policyKeys.includes(key))) {
        return { ok: false, reason: `autonomy policy ${AUTONOMY_POLICY_PATH.replace(/\\/g, "/")} has invalid keys: exact keys {${expectedKeys.join(", ")}} required` }
      }
      if (policy.schemaVersion !== 1) {
        return { ok: false, reason: `autonomy policy schemaVersion must be 1 (found ${policy.schemaVersion})` }
      }
      if (typeof policy.autoConfirm !== "boolean" || policy.autoConfirm !== true) {
        return { ok: false, reason: `auto-confirm is disabled by policy (autoConfirm: ${policy.autoConfirm})` }
      }
      if (
        typeof policy.maxRevisionCycles !== "number" ||
        !Number.isInteger(policy.maxRevisionCycles) ||
        policy.maxRevisionCycles < 0 ||
        policy.maxRevisionCycles > 10
      ) {
        return { ok: false, reason: "autonomy policy maxRevisionCycles must be an integer between 0 and 10" }
      }
      const revisionCount = state.history.filter((entry) => entry.phase === "revision_requested").length
      if (revisionCount > policy.maxRevisionCycles) {
        return { ok: false, reason: "revision budget exhausted, operator required" }
      }
      if (state.judgeReceiptPath === null) {
        return { ok: false, reason: "auto-confirm requires a recorded judge receipt (state.judgeReceiptPath is null)" }
      }
      const parsedReceipt = parseJudgeReceipt(root, state.judgeReceiptPath)
      if (!parsedReceipt.ok) {
        return { ok: false, reason: `recorded judge receipt is no longer valid: ${parsedReceipt.reason}` }
      }
      if (parsedReceipt.receipt.verdict !== "accept") {
        return { ok: false, reason: `judge receipt verdict is ${parsedReceipt.receipt.verdict}; auto-confirm requires accept` }
      }
      if (!Array.isArray(parsedReceipt.receipt.blockingCriteria) || parsedReceipt.receipt.blockingCriteria.length > 0) {
        return { ok: false, reason: "judge receipt has non-empty blockingCriteria; auto-confirm requires empty blockingCriteria" }
      }
      const validateEntries = state.history.filter((entry) => entry.phase === "validate")
      const notBefore = validateEntries.length > 0 ? Date.parse(validateEntries[validateEntries.length - 1].at) : undefined
      const gate = gateCheck(root, { git, notBefore })
      if (!gate.ok) {
        return gate
      }
      if (parsedReceipt.receipt.sourceHash !== gate.report.sourceHash) {
        return {
          ok: false,
          reason: `receipt sourceHash ${parsedReceipt.receipt.sourceHash} does not match the latest full green gate (${gate.report.sourceHash})`,
        }
      }
      if (state.gateSourceHash !== gate.report.sourceHash) {
        return {
          ok: false,
          reason: `gate changed since judge entry (state gateSourceHash ${state.gateSourceHash}, newest gate ${gate.report.sourceHash}) — re-run the gate at --mode full`,
        }
      }
      if (toPosix(parsedReceipt.receipt.gateReport) !== toPosix(gate.file)) {
        return {
          ok: false,
          reason: `receipt gateReport ${parsedReceipt.receipt.gateReport} does not match the newest full gate report ${toPosix(gate.file)}`,
        }
      }
      const reviewFiles = listReviewFiles(root).filter((file) => /\.md$/i.test(file.name))
      if (reviewFiles.length === 0) {
        return { ok: false, reason: "auto-confirm requires an approving review in docs/harness/review/ (no review files found)" }
      }
      const latestValidateAt = validateEntries.length > 0 ? Date.parse(validateEntries[validateEntries.length - 1].at) : NaN
      if (!Number.isFinite(latestValidateAt)) {
        return { ok: false, reason: "auto-confirm requires a validate cycle in state history" }
      }
      const freshReviews = reviewFiles.filter((file) => file.mtimeMs >= latestValidateAt)
      if (freshReviews.length === 0) {
        return {
          ok: false,
          reason: "auto-confirm requires at least one review in docs/harness/review/ written after the latest validate cycle",
        }
      }
      for (const file of freshReviews) {
        const reviewContent = readTextIfExists(file.fullPath) ?? ""
        const verdictLines = [...reviewContent.matchAll(/^Verdict:\s*(.*)$/gm)]
        if (verdictLines.length === 0) {
          return { ok: false, reason: `review ${file.name} does not carry an anchored "Verdict: APPROVE" line` }
        }
        for (const match of verdictLines) {
          if (match[1].trim() !== "APPROVE") {
            return { ok: false, reason: `review ${file.name} has a Verdict line other than APPROVE (${match[1].trim()})` }
          }
        }
      }
    }
    const located = regularFileInside(root, HANDOFF_PATH, { label: "handoff" })
    if (!located.ok) {
      return { ok: false, reason: `complete requires a regular in-repo ${HANDOFF_PATH}: ${located.reason}` }
    }
    // Freshness: the handoff must postdate the current awaiting_confirmation cycle; a
    // handoff left over from a previous run is stale and must be rewritten.
    const confirmEntries = state.history.filter((entry) => entry.phase === "awaiting_confirmation")
    if (confirmEntries.length > 0) {
      const entryAt = Date.parse(confirmEntries[confirmEntries.length - 1].at)
      const mtime = fs.statSync(located.real).mtimeMs
      if (Number.isFinite(entryAt) && mtime + 1000 < entryAt) {
        return {
          ok: false,
          reason: `handoff is stale: written before the current awaiting_confirmation cycle (${confirmEntries[confirmEntries.length - 1].at}) — rewrite the session handoff`,
        }
      }
    }
  }
  if (from === "awaiting_confirmation" && to === "revision_requested" && operatorAction !== "revise") {
    return { ok: false, reason: "awaiting_confirmation -> revision_requested requires --operator-action revise" }
  }

  // -- build the next state and bind the trace. The phase event is appended BEFORE
  // the atomic state replacement, so a refused append (corrupt stream, caps) can
  // never leave a moved phase without its trace record. The state write is
  // authoritative; the derived progress refresh below is best-effort.
  const now = new Date().toISOString()
  const bound = bindLegacyState(root, state, { now })
  if (!bound.ok) return bound
  const gateSourceHashNext = to === "judge" ? gate.report.sourceHash : bound.bound.gateSourceHash
  const judgeReceiptPathNext = receipt ? receipt.relative : bound.bound.judgeReceiptPath
  const operatorDecisionNext = operatorAction ?? bound.bound.operatorDecision
  const blockerNext = to === "blocked" ? derivedBlocker : null
  const eventId = newId("evt")
  const appended = appendPhaseEvent(root, {
    state: bound.bound,
    from,
    to,
    eventId,
    now,
    data: { from, to, gateSourceHash: gateSourceHashNext, judgeReceiptPath: judgeReceiptPathNext, operatorDecision: operatorDecisionNext, blocker: blockerNext },
  })
  if (!appended.ok) return appended
  const next = nextState(bound.bound, {
    phase: to,
    gateSourceHash: gateSourceHashNext,
    judgeReceiptPath: judgeReceiptPathNext,
    operatorDecision: operatorDecisionNext,
    blocker: blockerNext,
    eventId,
    now,
  })
  writeStateAtomic(root, next)
  let progress = { ok: true }
  if (!fs.existsSync(path.join(root, PROGRESS_PATH))) {
    progress = { ok: false, reason: `progress refresh skipped: no existing ${PROGRESS_PATH}` }
  } else {
    try {
      const generated = generateProgress(root, { write: true })
      progress = { ok: true, path: generated.path }
    } catch (error) {
      progress = { ok: false, reason: error instanceof Error ? error.message : String(error) }
    }
  }
  return {
    ok: true,
    state: next,
    from,
    to,
    progress,
    trace: { trace_id: bound.bound.traceId, run_id: bound.bound.runId, event_id: eventId },
    ...(advisory ? { advisory } : {}),
  }
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/
const FUTURE_SKEW_MS = 5 * 60 * 1000

/**
 * Strict judgedAt contract: full ISO 8601 that parses to a finite timestamp, no earlier
 * than the latest judge entry of the current cycle (an old receipt replayed after a
 * revision cycle must fail), and not materially in the future.
 */
export function validateJudgedAt(receipt, state, { now = Date.now(), skewMs = FUTURE_SKEW_MS } = {}) {
  const judgedAt = receipt?.judgedAt
  if (typeof judgedAt !== "string" || !ISO_TIMESTAMP.test(judgedAt)) {
    return { ok: false, reason: `judgedAt ${JSON.stringify(judgedAt)} is not a full ISO 8601 timestamp` }
  }
  const judged = Date.parse(judgedAt)
  if (!Number.isFinite(judged)) {
    return { ok: false, reason: `judgedAt ${judgedAt} does not parse to a finite timestamp` }
  }
  const judgeEntries = (state?.history ?? []).filter((entry) => entry.phase === "judge")
  if (judgeEntries.length > 0) {
    const latest = Date.parse(judgeEntries[judgeEntries.length - 1].at)
    if (Number.isFinite(latest) && judged < latest) {
      return { ok: false, reason: `judgedAt ${judgedAt} predates the latest judge entry (${judgeEntries[judgeEntries.length - 1].at}) — stale receipt replay; revalidate before judging` }
    }
  }
  if (judged > now + skewMs) {
    return { ok: false, reason: `judgedAt ${judgedAt} is materially in the future` }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// CLI

export function runCli(argv, { git } = {}) {
  const take = (name) => {
    const index = argv.indexOf(name)
    return index !== -1 && index + 1 < argv.length && !argv[index + 1].startsWith("--") ? argv[index + 1] : null
  }
  const command = argv[0]
  const options = {
    command,
    objective: take("--objective"),
    spec: take("--spec"),
    risk: take("--risk"),
    to: take("--to"),
    judgeReceipt: take("--judge-receipt"),
    operatorAction: take("--operator-action"),
    blocker: take("--blocker"),
    root: path.resolve(take("--root") ?? process.cwd()),
  }

  let result
  if (command === "init") {
    result = initState({ root: options.root, objective: options.objective, spec: options.spec, risk: options.risk })
  } else if (command === "rotate") {
    result = rotateState({ root: options.root, objective: options.objective, spec: options.spec, risk: options.risk })
  } else if (command === "transition") {
    result = transitionState({
      root: options.root,
      to: options.to,
      judgeReceipt: options.judgeReceipt,
      operatorAction: options.operatorAction,
      blocker: options.blocker,
      git,
    })
  } else if (command === "inspect") {
    result = inspectState(options.root)
  } else {
    result = { ok: false, reason: `unknown command ${JSON.stringify(command)} — use init|rotate|transition|inspect` }
  }
  if (result.ok) {
    if (command === "inspect") {
      process.stdout.write(`${JSON.stringify(result.state, null, 2)}\n`)
    } else if (command === "transition") {
      process.stdout.write(`prevc: ${result.from} -> ${result.to} (${STATE_PATH})\n`)
      if (result.advisory) {
        process.stdout.write(`prevc-state: advisory ${result.advisory}\n`)
      }
      if (result.progress && !result.progress.ok) {
        process.stderr.write(`prevc-state: accepted transition but progress refresh failed: ${result.progress.reason}\n`)
      }
    } else if (command === "rotate") {
      process.stdout.write(`prevc: archived ${result.archive} and initialized phase prepare (${STATE_PATH})\n`)
    } else {
      process.stdout.write(`prevc: initialized phase prepare (${STATE_PATH})\n`)
    }
    return 0
  }
  process.stderr.write(`prevc-state: ${result.reason}\n`)
  return 2
}

const main = () => {
  process.exitCode = runCli(process.argv.slice(2))
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main()
