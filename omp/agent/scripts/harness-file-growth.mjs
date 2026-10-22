#!/usr/bin/env node
/**
 * Deterministic source-file growth check.
 *
 * A changed source file which grows past 1,000 lines requires a structural waiver.
 * Human design judgments deliberately stay in the review references, not here.
 */
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

const LIMIT = 1000
const SOURCE = /\.(?:cjs|js|jsx|mjs|ts|tsx|py|rb|go|kt|java|vue|svelte|rs|php|cs|swift)$/i

function args(argv) {
  const out = { metric: false, base: "HEAD", target: process.cwd(), waiver: null, json: false }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === "--metric") out.metric = true
    else if (a === "--json") out.json = true
    else if (a === "--base") out.base = argv[++i] ?? ""
    else if (a === "--target") out.target = path.resolve(argv[++i] ?? "")
    else if (a === "--waiver") out.waiver = path.resolve(argv[++i] ?? "")
    else if (a === "--help" || a === "-h") out.help = true
    else throw new Error(`unknown option: ${a}`)
  }
  return out
}

function git(root, argv) {
  const result = spawnSync("git", ["-C", root, ...argv], { encoding: "utf8", windowsHide: true })
  if (result.status !== 0) throw new Error((result.stderr || "git failed").trim())
  return result.stdout
}

function lineCount(text) {
  if (!text) return 0
  return text.split(/\r?\n/).filter((line, index, rows) => index < rows.length - 1 || line !== "").length
}

function currentLines(file) {
  try { return lineCount(fs.readFileSync(file, "utf8")) } catch { return 0 }
}

function oldLines(root, base, file) {
  try { return lineCount(git(root, ["show", `${base}:${file}`])) } catch { return 0 }
}

function changedFiles(root, base) {
  return git(root, ["diff", base, "--name-only", "--diff-filter=ACMR", "--"]).split(/\r?\n/)
    .map((x) => x.trim()).filter(Boolean).filter((x) => SOURCE.test(x))
}

function readWaiver(file) {
  if (!file) return {}
  try {
    const value = JSON.parse(fs.readFileSync(file, "utf8"))
    return value && typeof value === "object" && !Array.isArray(value) ? value : null
  } catch { return null }
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value && value >= new Date().toISOString().slice(0, 10)
}

function validWaiver(value) {
  if (!value || typeof value !== "object") return false
  const reason = typeof value.reason === "string" ? value.reason.trim() : ""
  const owner = typeof value.owner === "string" ? value.owner.trim() : ""
  // Generic exception text is not a structural decision.
  const generic = /^(n\/a|na|none|exception|legacy|temporary|because|tbd)$/i.test(reason)
  return reason.length >= 12 && !generic && owner.length >= 2 && validDate(value.expires)
}

function waiverFor(waivers, file) {
  if (!waivers) return null
  if (validWaiver(waivers)) return waivers
  return waivers[file] ?? waivers["*"] ?? null
}

function main() {
  const options = args(process.argv.slice(2))
  if (options.help) { console.log("Usage: harness-file-growth.mjs --metric --base REF [--target DIR] [--waiver FILE] [--json]"); return 0 }
  if (!options.metric) throw new Error("--metric is required")
  const root = path.resolve(options.target)
  const waiverPath = options.waiver ?? [".file-growth-waiver.json", "file-growth-waiver.json", "growth-waiver.json", ".growth-waiver.json", "agent-os/file-growth-waiver.json", "agent-os/waivers/file-growth.json"]
    .map((x) => path.join(root, x)).find((x) => fs.existsSync(x))
  const waivers = readWaiver(waiverPath)
  const files = changedFiles(root, options.base)
  const rows = files.map((file) => {
    const before = oldLines(root, options.base, file)
    const after = currentLines(path.join(root, file))
    const grows = after > before
    const requires = grows && after > LIMIT
    const waiver = requires ? waiverFor(waivers, file) : null
    return { file, before, after, delta: after - before, requiresWaiver: requires, waived: requires && validWaiver(waiver), waiverValid: waiver == null ? false : validWaiver(waiver) }
  })
  const violations = rows.filter((row) => row.requiresWaiver && !row.waived)
  const report = { metric: "file_growth_delta", limit: LIMIT, base: options.base, waiver: waiverPath ?? null, rows, violations, value: violations.length, status: violations.length ? "fail" : "pass" }
  if (options.json) console.log(JSON.stringify(report, null, 2)); else {
    for (const row of rows) console.log(`${row.file}: ${row.before} -> ${row.after} (${row.delta >= 0 ? "+" : ""}${row.delta})`)
    console.log(`file_growth_delta: ${report.status} (${report.value} violation${report.value === 1 ? "" : "s"})`)
  }
  return violations.length ? 1 : 0
}

try { process.exitCode = main() } catch (error) { console.error(`file-growth: ${error.message}`); process.exitCode = 1 }
