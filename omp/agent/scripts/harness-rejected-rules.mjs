#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

export const MAX_REJECTED_RULES = 50
const ENTRY_KEYS = new Set(["id", "proposal", "reason", "rejected_at", "source_hash"])
const EXECUTABLE_KEYS = new Set([
  "action",
  "actions",
  "command",
  "commands",
  "code",
  "exec",
  "executable",
  "instructions",
  "instruction",
  "script",
  "scripts",
  "shell",
  "tool",
  "tools",
])
const ISO_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function hasContent(value) {
  if (typeof value === "string") return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return isRecord(value) && Object.keys(value).length > 0
}

function isStrictIsoTimestamp(value) {
  if (typeof value !== "string") return false
  const match = ISO_UTC.exec(value)
  if (!match) return false
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return false
  const canonical = parsed.toISOString()
  return canonical === (value.includes(".") ? value : value.replace("Z", ".000Z"))
}

function executableField(value, location = "entry") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = executableField(value[index], `${location}[${index}]`)
      if (found) return found
    }
    return null
  }
  if (!isRecord(value)) return null
  for (const [key, child] of Object.entries(value)) {
    if (EXECUTABLE_KEYS.has(key.toLowerCase())) return `${location}.${key}`
    const found = executableField(child, `${location}.${key}`)
    if (found) return found
  }
  return null
}

export function validateRejectedLedger(ledger) {
  const errors = []
  if (!isRecord(ledger)) return { valid: false, errors: ["LEDGER_OBJECT_REQUIRED"], count: 0, ceiling: MAX_REJECTED_RULES }

  const topLevelKeys = Object.keys(ledger)
  for (const key of topLevelKeys) {
    if (!["version", "entries"].includes(key)) errors.push(`UNKNOWN_TOP_LEVEL_FIELD:${key}`)
  }
  if (ledger.version !== 1) errors.push("VERSION_MUST_BE_1")
  if (!Array.isArray(ledger.entries)) {
    errors.push("ENTRIES_ARRAY_REQUIRED")
    return { valid: false, errors, count: 0, ceiling: MAX_REJECTED_RULES }
  }
  if (ledger.entries.length > MAX_REJECTED_RULES) errors.push(`ENTRY_LIMIT_EXCEEDED:${MAX_REJECTED_RULES}`)

  const ids = new Set()
  ledger.entries.forEach((entry, index) => {
    const prefix = `entries[${index}]`
    if (!isRecord(entry)) {
      errors.push(`${prefix}:OBJECT_REQUIRED`)
      return
    }
    for (const key of Object.keys(entry)) {
      if (!ENTRY_KEYS.has(key)) errors.push(`${prefix}:UNKNOWN_FIELD:${key}`)
    }
    for (const key of ENTRY_KEYS) {
      if (!(key in entry)) errors.push(`${prefix}:MISSING_FIELD:${key}`)
    }
    for (const key of ["id", "reason", "rejected_at", "source_hash"]) {
      if (!(key in entry) || typeof entry[key] !== "string" || entry[key].trim().length === 0) {
        errors.push(`${prefix}:${key.toUpperCase()}_MUST_BE_NON_EMPTY`)
      }
    }
    if (!("proposal" in entry) || !hasContent(entry.proposal)) errors.push(`${prefix}:PROPOSAL_MUST_BE_NON_EMPTY`)
    if (typeof entry.id === "string" && entry.id.trim()) {
      if (ids.has(entry.id)) errors.push(`${prefix}:DUPLICATE_ID:${entry.id}`)
      ids.add(entry.id)
    }
    if ("rejected_at" in entry && !isStrictIsoTimestamp(entry.rejected_at)) errors.push(`${prefix}:REJECTED_AT_MUST_BE_STRICT_ISO_UTC`)
    const executable = executableField(entry)
    if (executable) errors.push(`${prefix}:EXECUTABLE_FIELD:${executable}`)
  })

  return { valid: errors.length === 0, errors, count: ledger.entries.length, ceiling: MAX_REJECTED_RULES }
}

export function validateRejectedRulesFile(file, root = process.cwd()) {
  const resolvedRoot = path.resolve(root)
  const resolvedFile = path.resolve(file)
  let ledger
  try {
    ledger = JSON.parse(fs.readFileSync(resolvedFile, "utf8"))
  } catch (error) {
    return {
      valid: false,
      errors: [`FILE_UNREADABLE:${error.code ?? "INVALID_JSON"}`],
      file: resolvedFile,
      root: resolvedRoot,
      count: 0,
      ceiling: MAX_REJECTED_RULES,
    }
  }
  return { ...validateRejectedLedger(ledger), file: resolvedFile, root: resolvedRoot }
}

function valueOf(argv, flag) {
  const index = argv.indexOf(flag)
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : null
}

export function runCli(argv = process.argv.slice(2)) {
  const file = valueOf(argv, "--validate")
  const root = valueOf(argv, "--root")
  if (!file || !root) {
    console.log(JSON.stringify({ valid: false, errors: ["USAGE: --validate <file> --root <root>"] }, null, 2))
    return 2
  }
  const result = validateRejectedRulesFile(file, root)
  console.log(JSON.stringify(result, null, 2))
  return result.valid ? 0 : 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = runCli()
}
