#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
const TEXT_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".rst"])
const EXCLUDED_FILE = "review-findings.md"
const EXCLUDED_DIR = "evidence"

function isExcluded(file) {
  const parts = file.split(/[\\/]/)
  return parts.at(-1) === EXCLUDED_FILE || parts.includes(EXCLUDED_DIR)
}

function collectFiles(inputs, root = process.cwd()) {
  const files = []
  const visit = (entry) => {
    if (!fs.existsSync(entry)) return
    const stat = fs.statSync(entry)
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(entry).sort()) visit(path.join(entry, child))
      return
    }
    if (TEXT_EXTENSIONS.has(path.extname(entry).toLowerCase()) && !isExcluded(entry)) files.push(entry)
  }
  for (const input of inputs) visit(path.resolve(root, input))
  return files.sort()
}

function inFence(line, state) {
  if (/^\s*(```|~~~)/.test(line)) {
    const marker = line.trim().slice(0, 3)
    if (!state.marker) state.marker = marker
    else if (state.marker === marker) state.marker = null
    return true
  }
  return Boolean(state.marker)
}

function suppressed(line) {
  return /prose-lint-ok\s*:\s*\S(?:.*)?$/i.test(line)
}

function findingsForLine(file, lineNumber, line, lines) {
  if (suppressed(line)) return []
  const findings = []
  if (/[\u2012\u2013\u2014\u2015]/.test(line)) findings.push({ file, line: lineNumber, rule: "long-dash", message: "Use plain hyphen or separate sentence instead of decorative long dash" })
  if (/[\u2018\u2019\u201C\u201D]/.test(line)) findings.push({ file, line: lineNumber, rule: "curly-quotes", message: "Use straight quotes in repository prose" })
  if (/^\s*#{1,6}\s+/.test(line)) {
    const heading = line.replace(/^\s*#+\s+/, "").replace(/\s+#*\s*$/, "")
    const words = heading.match(/[A-Za-z][A-Za-z0-9']*/g) ?? []
    const contentWords = words.filter((word) => !/^(?:a|an|and|as|at|by|for|from|in|into|of|on|or|the|to|with)$/i.test(word))
    const titleCased = contentWords.length >= 2 && contentWords.every((word) => /^[A-Z]/.test(word))
    if (titleCased) findings.push({ file, line: lineNumber, rule: "title-case-heading", message: "Use sentence-case headings" })
  }
  if (/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(line)) findings.push({ file, line: lineNumber, rule: "decorative-emoji", message: "Remove decorative emoji from prose" })
  if (!/^\s*(?:#|[-*+]\s|\d+[.)]\s)/.test(line) && /(^|\s)[A-Za-z][^:]{2,}:\s+[a-z]/.test(line) && !/\bhttps?:\/\//i.test(line)) {
    findings.push({ file, line: lineNumber, rule: "mid-sentence-colon", message: "Avoid mid-sentence colon; split or rewrite sentence" })
  }
  return findings
}

export function lintFile(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/)
  const findings = []
  const fence = { marker: null }
  lines.forEach((line, index) => {
    if (inFence(line, fence)) return
    findings.push(...findingsForLine(file, index + 1, line, lines))
  })
  return findings
}

export function lint(inputs = ["docs", path.join("agent-os", "specs")], options = {}) {
  const root = options.root ?? process.cwd()
  return collectFiles(inputs, root).flatMap(lintFile)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2)
  const metric = args.includes("--metric")
  const json = args.includes("--json")
  const inputs = args.filter((arg) => !["--metric", "--json"].includes(arg))
  const findings = lint(inputs.length ? inputs : undefined)
  if (json) console.log(JSON.stringify({ count: findings.length, findings }, null, 2))
  else for (const finding of findings) console.log(`${finding.file}:${finding.line}: ${finding.rule}: ${finding.message}`)
  console.log(`count=${findings.length}`)
  process.exitCode = metric ? 0 : findings.length ? 1 : 0
}
