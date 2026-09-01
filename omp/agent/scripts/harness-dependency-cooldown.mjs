// harness-dependency-cooldown — fixed 7-day dependency admission cooldown (R3).
//
// Scans the project's lockfiles (package-lock.json, pnpm-lock.yaml, uv.lock,
// poetry.lock, requirements.txt) against `agent-os/dependency-ledger.json`
// ({schemaVersion:1, packages: {name: {versions: {version: {firstSeen, approvedAt}}}}}).
// A package+version whose `firstSeen` is less than 7 days ago and has no `approvedAt`
// is a violation. The 7-day window is operator-fixed policy (R3) — no global threshold
// is invented here, and no knob exists to change it.
//
// Grandfathering: when the ledger file does not exist, the first run seeds it from the
// current lockfiles with firstSeen = approvedAt = today (existing content is admitted
// with zero violations). Any package+version that later appears in a lockfile without a
// ledger entry is a NEW dependency: it starts the cooldown now (firstSeen = today, no
// approval) and blocks the full gate until 7 days pass or the operator approves.
//
// Operator approval: `--approve <name>@<version>` writes approvedAt = today and
// REQUIRES `--yes` (operator consent). The script never auto-approves.
//
// Output contract (gate metric `dependency_cooldown` via commands.cooldown):
//   --metric prints a summary whose LAST non-empty line is the violation count
//   (mirrors harness-security-scan.mjs --metric). A missing ledger AND missing
//   lockfiles prints lines with NO digits (named gap). Exit: 0 no violations · 1
//   violations · 2 cannot determine (gap) or operator-consent missing.

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { readJsonIfExists } from "./harness-quality-core.mjs"

export const COOLDOWN_DAYS = 7
export const LEDGER_PATH = path.join("agent-os", "dependency-ledger.json")
const LOCKFILES = ["package-lock.json", "pnpm-lock.yaml", "uv.lock", "poetry.lock", "requirements.txt"]

const isoDay = (date) => date.toISOString().slice(0, 10)

function daysSince(isoDate, now) {
  const then = new Date(`${isoDate}T00:00:00.000Z`)
  if (Number.isNaN(then.getTime())) return null
  return Math.floor((now.getTime() - then.getTime()) / 86_400_000)
}

// ---------------------------------------------------------------------------
// minimal lockfile parsers (no new dependencies; bounded, deterministic)

export function lockfileEntries(root) {
  const entries = new Map() // "name@version" -> name
  const add = (name, version) => {
    if (typeof name !== "string" || !name || typeof version !== "string" || !version) return
    entries.set(`${name}@${version}`, name)
  }
  const packageNameFromPath = (key, entry) => {
    if (typeof entry?.name === "string" && entry.name) return entry.name
    const marker = "node_modules/"
    const markerIndex = key.lastIndexOf(marker)
    const relative = markerIndex >= 0 ? key.slice(markerIndex + marker.length) : key
    const parts = relative.split("/")
    if (parts[0]?.startsWith("@")) return parts.slice(0, 2).join("/")
    return parts.at(-1)
  }

  const packageLock = path.join(root, "package-lock.json")
  if (fs.existsSync(packageLock)) {
    let data
    try {
      data = JSON.parse(fs.readFileSync(packageLock, "utf8"))
    } catch {
      throw new Error("package-lock.json is unreadable or malformed")
    }
    if (data.packages && typeof data.packages === "object") {
      for (const [key, entry] of Object.entries(data.packages)) {
        if (key === "") continue
        const name = packageNameFromPath(key, entry)
        if (entry?.version) add(name, entry.version)
      }
    }
    const walk = (node) => {
      for (const [name, entry] of Object.entries(node ?? {})) {
        if (entry?.version) add(name, entry.version)
        if (entry?.dependencies) walk(entry.dependencies)
      }
    }
    walk(data.dependencies)
  }

  // pnpm-lock.yaml: `  /name@version:` or `  name@version:` lines (the simple v6/v9
  // shapes that a minimal line parser can own).
  const pnpm = path.join(root, "pnpm-lock.yaml")
  if (fs.existsSync(pnpm)) {
    for (const line of fs.readFileSync(pnpm, "utf8").split(/\r?\n/)) {
      const match = /^\s{2}(?:\/)?(@[^/]+\/[^@\s]+|[^/@\s]+)@(\S+):\s*$/.exec(line)
      if (match) add(match[1], match[2].replace(/\([^)]*\)/g, ""))
    }
  }

  // uv.lock: `name = "..."` + `version = "..."` pairs inside package blocks.
  const uv = path.join(root, "uv.lock")
  if (fs.existsSync(uv)) {
    let current = null
    for (const line of fs.readFileSync(uv, "utf8").split(/\r?\n/)) {
      const nameMatch = /^name\s*=\s*"([^"]+)"/.exec(line)
      const versionMatch = /^version\s*=\s*"([^"]+)"/.exec(line)
      if (nameMatch) current = nameMatch[1]
      else if (versionMatch && current) add(current, versionMatch[1])
    }
  }

  // poetry.lock: `[[package]]` blocks with `name = "..."` / `version = "..."`.
  const poetry = path.join(root, "poetry.lock")
  if (fs.existsSync(poetry)) {
    let current = null
    for (const line of fs.readFileSync(poetry, "utf8").split(/\r?\n/)) {
      const nameMatch = /^name\s*=\s*"([^"]+)"/.exec(line)
      const versionMatch = /^version\s*=\s*"([^"]+)"/.exec(line)
      if (nameMatch) current = nameMatch[1]
      else if (versionMatch && current) add(current, versionMatch[1])
    }
  }

  // requirements.txt: `name==version` lines (bare names without a pinned version are
  // not version-pairs and cannot be cooldown-checked).
  const requirements = path.join(root, "requirements.txt")
  if (fs.existsSync(requirements)) {
    for (const line of fs.readFileSync(requirements, "utf8").split(/\r?\n/)) {
      const clean = line.replace(/\s*#.*$/, "").trim()
      const match = /^([A-Za-z0-9_.-]+)==([^\s;]+)/.exec(clean)
      if (match) add(match[1], match[2].replace(/[,\s]+$/, ""))
    }
  }

  return entries
}

export function loadLedger(root) {
  return readJsonIfExists(path.join(root, LEDGER_PATH))
}

export function writeLedger(root, ledger) {
  const target = path.join(root, LEDGER_PATH)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${JSON.stringify(ledger, null, 2)}\n`, "utf8")
}

export function seedLedger(entries, now) {
  const today = isoDay(now)
  const packages = {}
  for (const key of [...entries.keys()].sort()) {
    const name = entries.get(key)
    const version = key.slice(name.length + 1)
    packages[name] ??= { versions: {} }
    packages[name].versions[version] = { firstSeen: today, approvedAt: today }
  }
  return { schemaVersion: 1, packages }
}

export function inspectCooldown(root, { now = new Date(), ledgerOverride = null } = {}) {
  const entries = lockfileEntries(root)
  const presentLockfiles = LOCKFILES.filter((name) => fs.existsSync(path.join(root, name)))
  if (presentLockfiles.length > 0 && entries.size === 0) {
    return {
      status: "unavailable",
      reason: `${presentLockfiles.join(", ")} exists but contains no parseable dependency entries — a blocking cooldown check cannot pass silently`,
      violations: [],
      grandfathered: false,
    }
  }
  let ledger = ledgerOverride ?? loadLedger(root)
  let grandfathered = false

  if (!ledger || typeof ledger.packages !== "object") {
    if (entries.size === 0) {
      return { status: "unavailable", reason: `no lockfile entries and no ${LEDGER_PATH.replace(/\\/g, "/")} — nothing to cooldown-check; a named gap, not a pass`, violations: [], grandfathered: false }
    }
    ledger = seedLedger(entries, now)
    writeLedger(root, ledger)
    grandfathered = true
    return { status: "ok", violations: [], grandfathered: true, seeded: entries.size }
  }

  const violations = []
  for (const key of [...entries.keys()].sort()) {
    const name = entries.get(key)
    const version = key.slice(name.length + 1)
    const record = ledger.packages[name]?.versions?.[version]
    if (!record) {
      // New dependency: start the cooldown now, no approval.
      ledger.packages[name] ??= { versions: {} }
      ledger.packages[name].versions[version] = { firstSeen: isoDay(now), approvedAt: null }
      violations.push({ name, version, firstSeen: isoDay(now), reason: "new dependency — cooldown started now" })
      continue
    }
    const age = daysSince(record.firstSeen, now)
    if (age === null) {
      violations.push({ name, version, firstSeen: record.firstSeen, reason: "unparseable firstSeen" })
      continue
    }
    if (age < COOLDOWN_DAYS && !record.approvedAt) {
      violations.push({ name, version, firstSeen: record.firstSeen, ageDays: age, reason: `first seen ${age} day(s) ago — under the ${COOLDOWN_DAYS}-day cooldown, no operator approval` })
    }
  }
  if (violations.length) writeLedger(root, ledger)
  return { status: violations.length ? "violation" : "ok", violations, grandfathered }
}

function approve(root, spec, { now = new Date(), yes = false } = {}) {
  if (!yes) {
    return { ok: false, reason: "--approve requires --yes (operator consent); nothing was written" }
  }
  const match = /^(.+?)@([^\s@]+)$/.exec(spec)
  if (!match) return { ok: false, reason: `invalid dependency spec ${JSON.stringify(spec)} — expected name@version` }
  const [, name, version] = match
  let ledger = loadLedger(root)
  if (!ledger || typeof ledger.packages !== "object") {
    const entries = lockfileEntries(root)
    ledger = seedLedger(entries, now)
  }
  ledger.packages[name] ??= { versions: {} }
  const record = ledger.packages[name].versions[version] ?? { firstSeen: isoDay(now), approvedAt: null }
  record.approvedAt = isoDay(now)
  ledger.packages[name].versions[version] = record
  writeLedger(root, ledger)
  return { ok: true, name, version, approvedAt: record.approvedAt }
}

function printMetric(report) {
  if (report.status === "unavailable") {
    console.log(`status: unavailable\nreason: ${report.reason}`)
    return
  }
  const lines = [
    `status: ${report.status}`,
    `violations: ${report.violations.length}`,
    ...(report.grandfathered ? [`grandfathered: true (ledger seeded from lockfiles with firstSeen=approvedAt=today)`] : []),
    ...report.violations.map((v) => `  - ${v.name}@${v.version}: ${v.reason}`),
    String(report.violations.length),
  ]
  console.log(lines.join("\n"))
}

function runCli() {
  const args = process.argv.slice(2)
  const valueOf = (flag) => {
    const index = args.indexOf(flag)
    return index !== -1 && args[index + 1] ? args[index + 1] : null
  }
  const root = path.resolve(valueOf("--root") ?? process.cwd())
  const useMetric = args.includes("--metric")

  const approveIndex = args.indexOf("--approve")
  if (approveIndex !== -1) {
    const spec = args[approveIndex + 1]
    const result = approve(root, spec, { yes: args.includes("--yes") })
    if (!result.ok) {
      console.error(`harness-dependency-cooldown: ${result.reason}`)
      process.exitCode = 1
      return
    }
    console.log(JSON.stringify({ approved: `${result.name}@${result.version}`, approvedAt: result.approvedAt }, null, 2))
    return
  }

  let report
  try {
    report = inspectCooldown(root)
  } catch (error) {
    console.error(`harness-dependency-cooldown could not run: ${error.message}`)
    process.exitCode = 2
    return
  }
  if (useMetric) printMetric(report)
  else console.log(JSON.stringify(report, null, 2))
  if (report.status === "violation") process.exitCode = 1
  else if (report.status === "unavailable") process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli()
