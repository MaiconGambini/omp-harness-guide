#!/usr/bin/env node
import fs from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const SOURCE_EXTENSIONS = new Set([".c", ".cc", ".cpp", ".cjs", ".cs", ".go", ".java", ".js", ".jsx", ".kt", ".mjs", ".php", ".py", ".rb", ".rs", ".swift", ".ts", ".tsx", ".vue"])
const DEFAULT_INPUTS = ["agent", "plugins", "scripts", "tests"]
const PHASE_RE = /\b(?:now|next|then|first|finally)\s+(?:we|i|the code|this)|\b(?:i(?:'m| am)?\s+going\s+to|we\s+need\s+to|let(?:'s| us)\s+|this\s+will\s+|step\s+\d+\s*[:.-])/i
const SUPPRESSION_RE = /(?:eslint-disable(?:-next-line|-line)?|@ts-(?:ignore|expect-error))/i
const WAIVER_RE = /(?:comment[-_ ]?waiver|structural[-_ ]?waiver|proof\s*:\s*\S+|because\s*:\s*\S+|issue\s*:\s*https?:\/\/\S+)/i
const REDUNDANT_VERBS = [
  "set", "assign", "increment", "decrement", "return", "call", "loop", "iterate", "check",
  "validate", "create", "delete", "update", "import", "export", "declare", "define", "throw",
  "parse", "sort", "filter", "map", "add", "remove",
]
const REDUNDANT_RE = new RegExp(`^(?:${REDUNDANT_VERBS.join("|")})\\s+(?:the\\s+)?[a-z_$][\\w$]*(?:\\s*[.=(:]|\\s+to\\b|\\s+by\\b|\\s+from\\b)`, "i")

function collectFiles(inputs) {
  const files = []
  const visit = (entry) => {
    const stat = fs.statSync(entry)
    if (stat.isDirectory()) for (const child of fs.readdirSync(entry)) visit(path.join(entry, child))
    else if (SOURCE_EXTENSIONS.has(path.extname(entry).toLowerCase())) files.push(entry)
  }
  for (const input of inputs) visit(input)
  return files.sort()
}

function keepReason(text, line, lines) {
  const lower = text.toLowerCase()
  if (/\b(?:copyright|license|licence|spdx[- ]license[- ]identifier)\b/.test(lower)) return "legal/license header"
  if (/\b(?:external dependency|third[- ]party|library|package|sdk)\b.*\b(?:behavior|behaviour|quirk|compatib|semantics|version)\b/i.test(text)) return "non-obvious external-dependency behavior"
  if (/\b(?:eslint|prettier|format(?:ter)?)[- ]?(?:disable|enable|ignore|off|on)\b/i.test(text)) return "formatter pragma"
  const next = lines.slice(line).find((candidate) => candidate.trim() && !/^\s*(?:\/\/|#|\/\*|\*)/.test(candidate)) ?? ""
  if (/^\s*(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|const)\b/.test(next) && /(?:^|\s)@public\b|^\s*\/\*\*/.test(text)) return "public API doc comment"
  if (/(?:https?:\/\/\S+)?\b(?:issue|rfc)\s*[#: -]?\d+\b/i.test(text) || /https?:\/\/\S+\/(?:issues?|pull|rfcs?)\/\d+/i.test(text)) return "issue/RFC link"
  return null
}

function extractComments(source) {
  const comments = []
  const lines = source.split(/\r?\n/)
  let blockStart = null
  let block = []
  lines.forEach((raw, index) => {
    const line = index + 1
    if (blockStart !== null) {
      block.push(raw)
      if (raw.includes("*/")) {
        comments.push({ line: blockStart, endLine: line, text: block.join(" ") })
        blockStart = null; block = []
      }
      return
    }
    const blockAt = raw.indexOf("/*")
    const lineMatch = raw.match(/^\s*(\/\/|#|--)(.*)$/)
    if (lineMatch) comments.push({ line, endLine: line, text: lineMatch[2].trim() })
    if (blockAt >= 0) {
      const tail = raw.slice(blockAt)
      if (tail.includes("*/")) comments.push({ line, endLine: line, text: tail })
      else { blockStart = line; block = [tail] }
    }
  })
  return { comments, lines }
}

export function lintFile(file) {
  const source = fs.readFileSync(file, "utf8")
  const { comments, lines } = extractComments(source)
  const findings = []
  const displayFile = String(file).replaceAll("\\", "/")
  for (const comment of comments) {
    const text = comment.text.replace(/^\/\*+|\*\/$/g, "").replace(/^\s*[*#/]\s?/gm, "").trim()
    const reason = keepReason(text, comment.line, lines)
    if (PHASE_RE.test(text)) findings.push({ file: displayFile, line: comment.line, rule: "phase-narration", message: "Comment narrates process rather than documenting behavior", keep: reason })
    if (REDUNDANT_RE.test(text)) findings.push({ file: displayFile, line: comment.line, rule: "redundant-restatement", message: "Comment restates nearby code", keep: reason })
    if (SUPPRESSION_RE.test(text) && !WAIVER_RE.test(text)) findings.push({ file: displayFile, line: comment.line, rule: "unjustified-suppression", message: "Suppression requires proof or explicit structural waiver", keep: reason })
  }
  return findings
}

export function lint(inputs) {
  const files = collectFiles(inputs)
  return files.flatMap(lintFile)
}

if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? "")) {
  const args = process.argv.slice(2)
  const metric = args.includes("--metric")
  const json = args.includes("--json")
  const inputs = args.filter((arg) => !["--metric", "--json"].includes(arg))
  const scope = inputs.length ? inputs : DEFAULT_INPUTS
  const findings = lint(scope)
  if (json) console.log(JSON.stringify({ count: findings.length, findings }, null, 2))
  else { for (const finding of findings) console.log(`${finding.file}:${finding.line}: ${finding.rule}: ${finding.message}`); console.log(`count=${findings.length}`) }
  process.exitCode = metric ? 0 : findings.length ? 1 : 0
}
