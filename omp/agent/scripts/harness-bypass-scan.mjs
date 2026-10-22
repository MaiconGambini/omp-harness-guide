#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { globToRegex as coreGlobToRegex } from "./harness-quality-core.mjs"

export const PATTERN_DEFS = [
  { name: "@ts-ignore", re: /@ts-ignore\b/ },
  { name: "@ts-nocheck", re: /@ts-nocheck\b/ },
  { name: "eslint-disable", re: /eslint-disable(?:-next-line|-line)?\b/ },
  { name: "# noqa", re: /#\s*noqa\b/ },
  { name: "# type: ignore", re: /#\s*type\s*:\s*ignore\b/ },
  { name: "describe.skip", re: /\bdescribe\.skip\b/ },
  { name: ".skip(", re: /\.skip\s*\(/ },
  { name: ".only(", re: /\.only\s*\(/ },
  { name: "xit(", re: /\bxit\s*\(/ },
  { name: "fit(", re: /\bfit\s*\(/ },
  { name: "empty catch", re: /\bcatch\s*(?:\([^)]*\))?\s*\{\s*\}/ },
]

export const CODE_EXT_RE = /\.(?:js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|kt|cs|rb|php|swift)$/i

export function globToRegex(globPattern, flags = "i") {
  if (typeof coreGlobToRegex === "function") {
    return coreGlobToRegex(globPattern, flags)
  }
  const pattern = String(globPattern ?? "").replace(/\\/g, "/")
  let reStr = "^"
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        i++
        if (pattern[i + 1] === "/") {
          i++
          reStr += "(?:.*/)?"
        } else {
          reStr += ".*"
        }
      } else {
        reStr += "[^/]*"
      }
    } else if (c === "?") {
      reStr += "[^/]"
    } else if (".+^${}()|[]\\".includes(c)) {
      reStr += "\\" + c
    } else {
      reStr += c
    }
  }
  reStr += "$"
  return new RegExp(reStr, flags)
}

export function loadThresholdExcludes(root = process.cwd()) {
  const thresholdsPath = path.join(root, "agent-os", "quality-thresholds.json")
  if (!fs.existsSync(thresholdsPath)) return []
  try {
    const data = JSON.parse(fs.readFileSync(thresholdsPath, "utf8"))
    if (Array.isArray(data.source_hash_exclude)) {
      return data.source_hash_exclude
        .filter((p) => typeof p === "string" && p.trim())
        .map((p) => p.trim())
    }
  } catch {
    // ignore
  }
  return []
}

export function isExcludedFile(filePath, excludeRegexes = []) {
  const norm = String(filePath ?? "").replace(/\\/g, "/")
  if (norm.includes("/node_modules/") || norm.startsWith("node_modules/")) return true
  if (norm.includes("/fixtures/") || norm.startsWith("fixtures/")) return true
  if (norm.includes("/fixture/") || norm.startsWith("fixture/")) return true
  if (/harness-bypass-scan\.test\.[tj]s$/i.test(norm)) return true
  for (const re of excludeRegexes) {
    if (re.test(norm)) return true
  }
  return false
}

export function isJustified(lineText, matchIndex, matchLength) {
  const rest = lineText.slice(matchIndex + matchLength)
  const dashMatch = rest.match(/--\s*([^\r\n]+)/)
  if (dashMatch) {
    let reason = dashMatch[1].trim()
    reason = reason.replace(/\s*\*\/$/, "").replace(/\s*\}\s*$/, "").trim()
    if (reason.length >= 8) return true
  }
  const colonMatch = rest.match(/:\s*([^\r\n]+)/)
  if (colonMatch) {
    let reason = colonMatch[1].trim()
    reason = reason.replace(/\s*\*\/$/, "").replace(/\s*\}\s*$/, "").trim()
    if (reason.length >= 8) return true
  }
  return false
}

export function checkLine(text) {
  for (const def of PATTERN_DEFS) {
    const match = def.re.exec(text)
    if (!match) continue
    if (isJustified(text, match.index, match[0].length)) continue
    return { pattern: def.name, text: text.trim() }
  }
  return null
}

export function parseDiffAddedLines(diffText, excludeRegexes = []) {
  const lines = String(diffText ?? "").split(/\r?\n/)
  let currentFile = null
  let currentLineNo = 0
  const added = []

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      const match = /^diff --git a\/\S+ b\/(.+)$/.exec(line)
      currentFile = match ? match[1].replace(/\\/g, "/") : null
    } else if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6).replace(/\\/g, "/")
    } else if (line.startsWith("@@ ")) {
      const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line)
      if (match) {
        currentLineNo = parseInt(match[1], 10) - 1
      }
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      currentLineNo++
      if (currentFile && CODE_EXT_RE.test(currentFile) && !isExcludedFile(currentFile, excludeRegexes)) {
        added.push({ file: currentFile, line: currentLineNo, text: line.slice(1) })
      }
    } else if (line.startsWith(" ") || line.startsWith("-")) {
      if (!line.startsWith("-")) {
        currentLineNo++
      }
    }
  }
  return added
}

export function scanBypasses({ root = process.cwd(), base = "HEAD" } = {}) {
  const findings = []
  const thresholdExcludes = loadThresholdExcludes(root)
  const excludeRegexes = thresholdExcludes.map((p) => globToRegex(p, "i"))

  // 1. git diff <base>
  const diffResult = spawnSync("git", ["diff", base], { cwd: root, encoding: "utf8", windowsHide: true })
  if (diffResult.status === 0 && diffResult.stdout) {
    const addedLines = parseDiffAddedLines(diffResult.stdout, excludeRegexes)
    for (const item of addedLines) {
      const match = checkLine(item.text)
      if (match) {
        findings.push({
          file: item.file,
          line: item.line,
          pattern: match.pattern,
          text: match.text,
        })
      }
    }
  }

  // 2. Untracked text files (respecting .gitignore)
  const untrackedResult = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", windowsHide: true })
  if (untrackedResult.status === 0 && untrackedResult.stdout) {
    const untrackedFiles = untrackedResult.stdout.split(/\r?\n/).map(f => f.trim()).filter(Boolean)
    for (const relFile of untrackedFiles) {
      const normFile = relFile.replace(/\\/g, "/")
      if (!CODE_EXT_RE.test(normFile)) continue
      if (isExcludedFile(normFile, excludeRegexes)) continue

      const fullPath = path.join(root, relFile)
      let stat
      try {
        stat = fs.statSync(fullPath)
      } catch {
        continue
      }
      if (!stat.isFile()) continue

      let content
      try {
        content = fs.readFileSync(fullPath, "utf8")
      } catch {
        continue
      }

      if (content.includes("\0")) continue

      const lines = content.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const lineText = lines[i]
        const match = checkLine(lineText)
        if (match) {
          findings.push({
            file: normFile,
            line: i + 1,
            pattern: match.pattern,
            text: match.text,
          })
        }
      }
    }
  }

  return { findings, count: findings.length }
}

export function runCli(argv = process.argv.slice(2)) {
  let base = "HEAD"
  let json = false
  let metric = false
  let root = process.cwd()

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--base") {
      base = argv[++i] ?? "HEAD"
    } else if (arg === "--json") {
      json = true
    } else if (arg === "--metric") {
      metric = true
    } else if (arg === "--root") {
      root = path.resolve(argv[++i] ?? process.cwd())
    } else if (arg === "-h" || arg === "--help") {
      console.log("Usage: node harness-bypass-scan.mjs [--base <ref>] [--json] [--metric] [--root <dir>]")
      return 0
    }
  }

  const result = scanBypasses({ root, base })

  if (json) {
    console.log(JSON.stringify(result, null, 2))
  } else if (metric) {
    console.log(result.count)
  } else {
    for (const f of result.findings) {
      console.log(`${f.file}:${f.line}: [${f.pattern}] ${f.text}`)
    }
    console.log(`bypass_findings: ${result.count}`)
  }

  return 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runCli()
}
