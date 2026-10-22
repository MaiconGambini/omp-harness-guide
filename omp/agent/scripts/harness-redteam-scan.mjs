// harness-redteam-scan — deterministic adversarial diff scan (R1 quickcheck).
//
// Bounded, read-only, defensive, scoped to the target argument. This is the mandatory
// per-lane red-team quickcheck: it scans the reconciled diff (or an explicit target) for
// the deterministic issue classes the quickcheck owns — hardcoded secrets, path
// traversal, injection sinks, dangerous commands — and reports them. It NEVER executes
// network calls, NEVER mutates anything outside the target tree, and NEVER performs
// active exploitation. Deep adversarial work stays a separate, explicitly authorized
// activity (spec R1, decisions D9).
//
// Escalation contract (skills/harness-redteam-check/SKILL.md): a lane runs this scan
// once on its reconciled diff; findings (FAIL count > 0) escalate to `security-analyst`
// adversarial review. Tier auto with zero findings needs no reviewer.
//
// Output contract (gate metric `redteam_quickcheck` via commands.redteam):
//   --metric prints a summary whose LAST non-empty line is the exact FAIL count
//   (mirrors harness-security-scan.mjs --metric). An unavailable scan (no target and
//   not a git repo) prints lines with NO digits so the gate's lastNumber adapter
//   reports the named gap, never a forged number.
//
// Exit codes: 0 clean · 1 findings · 2 unusable target or internal error.

import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import { HARD_SECRET_PATTERN, listFiles, redactedFinding, redactSensitiveText } from "./harness-common.mjs"

// ---------------------------------------------------------------------------
// deterministic issue classes

// Hardcoded credential material (FAIL class). HARD_SECRET_PATTERN covers sk-/bearer
// tokens and private-key blocks; the platform-specific literals are added here.
const credentialPatterns = [
  { label: "AWS access key literal", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { label: "Google API key literal", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { label: "GitHub token literal", re: /\bgh[pousr]_[0-9A-Za-z]{36,}\b/ },
  { label: "private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "API key literal", re: /\bAPI_KEY\s*=\s*["']?[^"'`\s]+/ },
]
const hardSecretRe = HARD_SECRET_PATTERN

// Path traversal: only parent-directory arguments in path/file joins/resolution.
// Documentation, relative imports, normalization checks, and trusted static module-root
// paths are not findings; dynamic or user-controlled path composition remains a finding.
const traversalRe = /\b(?:path|fs)\.(?:join|resolve)\([^\n]*?["']\.\.["']\s*(?:,|\))/u
const combinedTraversalRe = /\b(?:path|fs)\.(?:join|resolve)\([^\n]*?["'](?:\.\.[\\/])+[^"'`\n]*["']/u
const benignTraversalRe = /\b(?:path|fs)\.(?:join|resolve)\((?:__dirname|import\.meta\.dirname|path\.dirname\(fileURLToPath\(import\.meta\.url\)\)|(?:HERE|ROOT|REPO|PROJECT_ROOT|repoRoot|root))\s*,\s*(?:["'][^"'`\n]*["']\s*,\s*)*["']\.\.["'](?:\s*,\s*["'][^"'`\n]*["'])*\s*\)/u
// Injection sinks: shell/process execution, eval, and SQL string concatenation.
// An argv-array spawn with no shell is safe because each element is passed as one
// argv entry; variables inside the array cannot become executable syntax.
const PROCESS_CALL_RE = /(?<![.\w])(?:(?:child_process\.)?(?:exec|execSync|execFile|spawn|spawnSync|fork))\s*\(/g
const injectionPatterns = [
  { label: "eval sink", re: /\beval\s*\(|\bnew\s+Function\s*\(/ },
  {
    label: "SQL string concatenation",
    re: /\b(?:SELECT\s+(?:\*|[A-Za-z_][\w$]*(?:\s*,\s*[A-Za-z_][\w$]*)*)\s+FROM|INSERT\s+INTO\s+[A-Za-z_][\w$]*|UPDATE\s+[A-Za-z_][\w$]*\s+SET|DELETE\s+FROM\s+[A-Za-z_][\w$]*|DROP\s+(?:TABLE|DATABASE)\s+[A-Za-z_][\w$]*|WHERE\s+[A-Za-z_][\w$]*\s*(?:=|IN|LIKE))\b[^;\n]{0,200}(?:\+\s*[a-z_$]|["'`][^"'`\n]{0,80}\$\{)/i,
  },
]

const splitTopLevel = (text) => {
  const parts = []
  let start = 0
  let depth = 0
  let quote = null
  let escaped = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char
      continue
    }
    if ("([{".includes(char)) depth += 1
    else if (")]}".includes(char)) depth -= 1
    else if (char === "," && depth === 0) {
      parts.push(text.slice(start, index).trim())
      start = index + 1
    }
  }
  parts.push(text.slice(start).trim())
  return parts.length === 1 && parts[0] === "" ? [] : parts
}

const matchingParen = (line, open) => {
  let depth = 0
  let quote = null
  let escaped = false
  for (let index = open; index < line.length; index += 1) {
    const char = line[index]
    if (quote) {
      if (escaped) escaped = false
      else if (char === "\\") escaped = true
      else if (char === quote) quote = null
      continue
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char
      continue
    }
    if (char === "(") depth += 1
    else if (char === ")" && --depth === 0) return index
  }
  return -1
}

const isQuotedLiteral = (value) => /^'(?:\\.|[^'\\\r\n])*'$|^"(?:\\.|[^"\\\r\n])*"$/.test(value)
const isIdentifier = (value) => /^[A-Za-z_$][\w$]*$/.test(value)
const isVariableReference = (value) => /^[A-Za-z_$][\w$]*(?:(?:\.[A-Za-z_$][\w$]*)|(?:\[[^\]\r\n]+\]))*$/.test(value)
const unquoteLiteral = (value) => {
  const trimmed = value.trim()
  if (!isQuotedLiteral(trimmed)) return null
  return trimmed.slice(1, -1).replace(/\\(['"\\])/g, "$1")
}
const shellExecutables = new Set(["sh", "bash", "zsh", "ksh", "fish", "dash", "cmd", "cmd.exe", "powershell", "powershell.exe", "pwsh", "pwsh.exe"])

const isArrayLiteral = (value) => {
  const trimmed = value.trim()
  return trimmed.startsWith("[") && trimmed.endsWith("]")
}
const isSafeArgvEntry = (value) => {
  const trimmed = value.trim()
  return isQuotedLiteral(trimmed)
    || /^(?:true|false|null|-?\d+(?:\.\d+)?)$/.test(trimmed)
    || isVariableReference(trimmed)
}

const isSafeSpawnCall = (callee, args) => {
  const name = callee.replace(/^child_process\./, "")
  if (!["spawn", "spawnSync"].includes(name) || args.length < 2) return false
  const executable = args[0].trim()
  if (!(isQuotedLiteral(executable) || isIdentifier(executable) || executable === "process.execPath")) return false
  const argv = args[1].trim()
  if (!isArrayLiteral(argv)) return false
  const entries = splitTopLevel(argv.slice(1, -1))
  if (entries.at(-1) === "") entries.pop()
  if (!entries.every(isSafeArgvEntry)) return false
  const executableName = unquoteLiteral(executable)?.toLowerCase().split(/[\\/]/).pop()
  const firstArg = unquoteLiteral(entries[0] ?? "")?.toLowerCase()
  if (shellExecutables.has(executableName) && firstArg === "-c") return false
  return !args.slice(2).some((arg) => /\bshell\s*:\s*true\b/i.test(arg))
}

const safeLabel = (value) => redactSensitiveText(String(value ?? ""))

const makeFinding = (source, lineNo, lineText, message, severity = "FAIL") => {
  const f = redactedFinding(safeLabel(`${source}:${lineNo}`), message, severity)
  f.lineText = lineText
  f.filePath = source
  return f
}

const processFindings = (text, source, addedLineNumbers = null, lines = []) => {
  const findings = []
  const lineNumberAt = (offset) => text.slice(0, offset).split(/\r?\n/).length
  const addedLineInRange = (startLine, endLine) => {
    if (!addedLineNumbers) return startLine
    for (let lineNo = startLine; lineNo <= endLine; lineNo += 1) {
      if (addedLineNumbers.has(lineNo)) return lineNo
    }
    return null
  }

  for (const match of text.matchAll(PROCESS_CALL_RE)) {
    const callee = match[0].slice(0, -1).trim()
    const open = match.index + match[0].length - 1
    const startLine = lineNumberAt(match.index)
    const close = matchingParen(text, open)
    if (close === -1) {
      const findingLine = addedLineInRange(startLine, startLine)
      if (findingLine === null) continue
      const lineText = lines[findingLine - 1]?.text ?? ""
      const lineSource = lines[findingLine - 1]?.file ?? source
      findings.push(makeFinding(lineSource, findingLine, lineText, "exec/spawn call sink", "FAIL"))
      continue
    }
    const argsText = text.slice(open + 1, close)
    const args = splitTopLevel(argsText)
    const endLine = lineNumberAt(close)
    const findingLine = addedLineInRange(startLine, endLine)
    if (findingLine === null) continue
    if (isSafeSpawnCall(callee, args)) continue
    const name = callee.replace(/^child_process\./, "")
    const label = callee.startsWith("child_process.") && ["exec", "execSync", "execFile", "fork"].includes(name)
      ? "shell exec sink"
      : "exec/spawn call sink"
    const lineText = lines[findingLine - 1]?.text ?? ""
    const lineSource = lines[findingLine - 1]?.file ?? source
    findings.push(makeFinding(lineSource, findingLine, lineText, label, "FAIL"))
    const shellMatch = /\bshell\s*:\s*true\b/i.exec(argsText)
    if (shellMatch) {
      const shellLine = lineNumberAt(open + 1 + shellMatch.index)
      if (!addedLineNumbers || addedLineNumbers.has(shellLine)) {
        const shellLineText = lines[shellLine - 1]?.text ?? ""
        const shellSource = lines[shellLine - 1]?.file ?? source
        findings.push(makeFinding(shellSource, shellLine, shellLineText, "shell:true execution", "FAIL"))
      }
    }
  }
  return findings
}

// Dangerous commands (operator-authored binaries with known destructive/remote-exec
// shapes). Deterministic literals only — no heuristics on free text.
const dangerousPatterns = [
  { label: "recursive force delete", re: /\brm\s+-rf\b|\brm\s+--recursive\s+--force\b/ },
  { label: "force push", re: /\bgit\s+push\b[^\n]*(?:-f|--force)(?:\s|$)/ },
  { label: "pipe-to-shell download", re: /\b(?:curl|wget)\s+[^|\n]+\|\s*(?:sudo\s+)?(?:ba)?sh\b/i },
  { label: "PowerShell pipe-to-iex", re: /\b(?:iwr|irm|iex)\s+[^|\n]+\|\s*iex\b/i },
  { label: "world-writable chmod", re: /\bchmod\s+777\b/ },
]

const ALL_PATTERNS = [...credentialPatterns, ...injectionPatterns, ...dangerousPatterns]

export function scanText(text, source = "<diff>") {
  const normalized = String(text ?? "")
  const physicalLines = normalized.split(/\r?\n/)
  let currentDiffFile = source === "diff" ? "diff" : source
  const lines = source === "diff"
    ? physicalLines.map((line, index) => {
      if (line.startsWith("diff --git ")) {
        const match = /^diff --git a\/\S+ b\/(.+)$/.exec(line)
        if (match) currentDiffFile = match[1]
      } else if (line.startsWith("+++ b/")) {
        currentDiffFile = line.slice(6)
      }
      const added = line.startsWith("+") && !line.startsWith("+++")
      const context = line.startsWith(" ")
      return {
        text: added || context ? line.slice(1) : "",
        lineNo: index + 1,
        added,
        file: currentDiffFile,
      }
    })
    : physicalLines.map((line, index) => ({ text: line, lineNo: index + 1, added: true, file: source }))
  const processText = lines.map(({ text: line }) => line).join("\n")
  const addedLineNumbers = source === "diff"
    ? new Set(lines.filter(({ added }) => added).map(({ lineNo }) => lineNo))
    : null
  const findings = processFindings(processText, source, addedLineNumbers, lines)
  lines.forEach(({ text: line, lineNo, added, file }) => {
    if (source === "diff" && !added) return
    const lineSource = file ?? source
    for (const { label, re } of ALL_PATTERNS) {
      if (re.test(line)) {
        findings.push(makeFinding(lineSource, lineNo, line, label, "FAIL"))
      }
    }
    if ((traversalRe.test(line) || combinedTraversalRe.test(line)) && !benignTraversalRe.test(line)) {
      findings.push(makeFinding(lineSource, lineNo, line, "path traversal (parent-directory segment or quoted dot-dot in a path join)", "FAIL"))
    }
    if (hardSecretRe.test(line)) {
      // HARD_SECRET_PATTERN is not in ALL_PATTERNS (it is a RegExp with alternation);
      // a bare token with no other pattern must still be a finding.
      findings.push(makeFinding(lineSource, lineNo, line, "hard secret token (sk-/bearer)", "FAIL"))
    }
  })
  return findings
}

export function scanFile(filePath) {
  let text
  try {
    text = fs.readFileSync(filePath, "utf8")
  } catch (error) {
    return [
      redactedFinding(
        safeLabel(filePath),
        `file unreadable during scan (${error?.code ?? "error"}) — an unreadable file is never scanned as clean`,
        "FAIL",
      ),
    ]
  }
  return scanText(text, filePath)
}

const SCAN_FILE_PATTERN = /\.(md|json|jsonc|ts|js|jsx|tsx|mjs|cjs|py|rb|go|kt|java|yml|yaml|sh|ps1|sql|toml|txt)$/i

// Default diffs omit documented fixtures and governance prose. Regression samples are
// excluded only by exact path so a secret in any other test or source file remains visible.
const SELF_FIXTURE_ALLOWLIST = new Set([
  "tests/harness-redteam-scan.test.mjs",
  "tests/harness-redteam-runner.test.mjs",
])
const isDefaultExcluded = (relative) => {
  const normalized = relative.replaceAll("\\", "/")
  const under = (directory) => normalized === directory || normalized.startsWith(`${directory}/`) || normalized.includes(`/${directory}/`) || normalized.endsWith(`/${directory}`)
  const namedFixture = [...SELF_FIXTURE_ALLOWLIST].some((file) => normalized === file || normalized.endsWith(`/${file}`))
  return (
    /\/fixtures\//.test(`/${normalized}`) ||
    under("agent-os/specs") ||
    under("agent-os/standards") ||
    under("docs/harness/lane-evidence") ||
    under("docs/harness/quality") ||
    under("docs/harness/judge") ||
    under(".specs") ||
    under("agent/sessions") ||
    under("codex/plugins/opencode-harness/scripts/source") ||
    normalized === "scripts/harness-redteam-scan.mjs" ||
    namedFixture
  )
}

export function filterDefaultDiff(diffText) {
  const kept = []
  let include = true
  for (const line of String(diffText ?? "").split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      const match = /^diff --git a\/\S+ b\/(.+)$/.exec(line)
      include = !match || !isDefaultExcluded(match[1])
    }
    if (include) kept.push(line)
  }
  return kept.join("\n")
}

// Resolve scan targets. Explicit --target wins: a file is scanned as diff text, a
// directory is walked with the quickcheck's include set. Without --target the scan runs
// on the repo's reconciled working-tree diff (tracked changes + untracked files, minus
// the default-mode exclusions). Returns null when neither a target nor a git repo is
// available.
export function resolveTargets(target, root) {
  if (target) {
    const resolved = path.resolve(root, target)
    const stat = fs.statSync(resolved)
    if (stat.isDirectory()) {
      return listFiles(resolved, (file) => SCAN_FILE_PATTERN.test(file))
        .filter((file) => !isDefaultExcluded(path.relative(root, file)))
    }
    return [resolved]
  }
  const probe = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, encoding: "utf8", shell: false, maxBuffer: 32 * 1024 * 1024 })
  if (probe.status !== 0) return null
  const diff = spawnSync("git", ["diff", "HEAD"], { cwd: root, encoding: "utf8", shell: false, maxBuffer: 32 * 1024 * 1024 })?.stdout ?? ""
  const untracked = (spawnSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8", shell: false, maxBuffer: 32 * 1024 * 1024 })?.stdout ?? "").split("\0").filter(Boolean)
  return { diffText: diff, untracked }
}

export function globToRegex(globPattern, flags = "") {
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

export function matchesFilePath(pattern, filePath) {
  const normPattern = String(pattern ?? "").replace(/\\/g, "/").trim()
  const normPath = String(filePath ?? "").replace(/\\/g, "/").trim()
  const isWin = process.platform === "win32"

  if (isWin) {
    if (normPattern.toLowerCase() === normPath.toLowerCase()) return true
  } else {
    if (normPattern === normPath) return true
  }

  if (normPattern.includes("*") || normPattern.includes("?")) {
    const regex = globToRegex(normPattern, isWin ? "i" : "")
    if (regex.test(normPath)) return true
  }

  return false
}

export function getFindingRelPath(f, root = null) {
  const source = f.filePath ?? f.file ?? ""
  const pathPart = source.replace(/:\d+$/, "")
  const effectiveRoot = root ?? process.cwd()
  if (path.isAbsolute(pathPart)) {
    return path.relative(effectiveRoot, pathPart).replace(/\\/g, "/")
  }
  return pathPart.replace(/\\/g, "/")
}

export function loadAllowlist(allowlistPath) {
  if (!allowlistPath || !fs.existsSync(allowlistPath)) {
    return { ok: true, entries: [], missing: true }
  }
  let raw
  try {
    raw = fs.readFileSync(allowlistPath, "utf8")
  } catch (err) {
    return { ok: false, reason: `failed to read allowlist at ${allowlistPath}: ${err.message}` }
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return { ok: false, reason: `malformed allowlist JSON at ${allowlistPath}: ${err.message}` }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: `malformed allowlist at ${allowlistPath}: expected root object` }
  }
  if (parsed.version !== 1) {
    return { ok: false, reason: `malformed allowlist at ${allowlistPath}: unsupported version ${parsed.version}` }
  }
  if (!Array.isArray(parsed.entries)) {
    return { ok: false, reason: `malformed allowlist at ${allowlistPath}: expected entries array` }
  }
  for (let i = 0; i < parsed.entries.length; i++) {
    const entry = parsed.entries[i]
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, reason: `malformed allowlist entry at index ${i}: expected object` }
    }
    if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(entry.sha256.trim())) {
      return { ok: false, reason: `malformed allowlist entry at index ${i}: invalid sha256` }
    }
    if (typeof entry.file !== "string" || !entry.file.trim()) {
      return { ok: false, reason: `malformed allowlist entry at index ${i}: missing or invalid file` }
    }
    if (typeof entry.expires !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.expires.trim())) {
      return { ok: false, reason: `malformed allowlist entry at index ${i}: invalid expires date (expected YYYY-MM-DD)` }
    }
    const trimmedExpires = entry.expires.trim()
    const parsedDate = new Date(`${trimmedExpires}T00:00:00.000Z`)
    if (isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== trimmedExpires) {
      return { ok: false, reason: `malformed allowlist entry at index ${i}: invalid calendar date for expires (${trimmedExpires})` }
    }
  }
  return { ok: true, entries: parsed.entries, missing: false }
}

export function applyAllowlist(findings, allowlistEntries, { currentDate = null, root = null } = {}) {
  const today = currentDate ?? new Date().toISOString().slice(0, 10)
  const isExpired = (entry) => typeof entry.expires === "string" && entry.expires.trim() < today

  const matchedEntries = new Set()
  const activeFindings = []
  let suppressed = 0

  for (const f of findings) {
    const trimmed = typeof f.lineText === "string" ? f.lineText.trim() : ""
    const hash = trimmed ? crypto.createHash("sha256").update(trimmed, "utf8").digest("hex").toLowerCase() : null
    const findingRel = getFindingRelPath(f, root)

    const matchedEntry = hash
      ? allowlistEntries.find((e) => {
        if (typeof e.sha256 !== "string" || e.sha256.trim().toLowerCase() !== hash) return false
        return matchesFilePath(e.file, findingRel)
      })
      : null

    if (matchedEntry) {
      matchedEntries.add(matchedEntry)
      if (!isExpired(matchedEntry)) {
        suppressed += 1
        continue
      }
    }
    const { lineText, filePath, ...publicFinding } = f
    activeFindings.push(publicFinding)
  }

  const expiredEntries = allowlistEntries.filter((e) => isExpired(e))
  const orphanEntries = allowlistEntries.filter((e) => !matchedEntries.has(e))

  return {
    findings: activeFindings,
    suppressed,
    expiredEntries,
    orphanEntries,
  }
}

export function runScan({ target, root, allowlistPath = null, currentDate = null } = {}) {
  const effectiveRoot = root ? path.resolve(root) : process.cwd()
  const allowlistFile = allowlistPath ?? path.join(effectiveRoot, "agent-os", "redteam-allowlist.json")
  const allowlistResult = loadAllowlist(allowlistFile)
  if (!allowlistResult.ok) {
    return {
      status: "unavailable",
      reason: allowlistResult.reason,
      scanned: 0,
      findings: [],
      suppressed: 0,
      expiredEntries: [],
      orphanEntries: [],
    }
  }

  const resolved = resolveTargets(target, effectiveRoot)
  if (resolved === null) {
    return {
      status: "unavailable",
      reason: "not a git repo and no --target given — pass --target <diff-file|dir> explicitly",
      scanned: 0,
      findings: [],
      suppressed: 0,
      expiredEntries: [],
      orphanEntries: [],
    }
  }

  const rawFindings = []
  let scanned = 0
  if (Array.isArray(resolved)) {
    for (const file of resolved) {
      scanned += 1
      rawFindings.push(...scanFile(file))
    }
  } else {
    const { diffText, untracked } = resolved
    const filteredDiff = filterDefaultDiff(diffText)
    scanned = filteredDiff.split("\n").length
    rawFindings.push(...scanText(filteredDiff, "diff"))
    for (const file of untracked.filter((filePath) => !isDefaultExcluded(filePath))) {
      const full = path.resolve(effectiveRoot, file)
      let stat
      try {
        stat = fs.statSync(full)
      } catch {
        continue
      }
      if (!stat.isFile()) continue
      scanned += 1
      rawFindings.push(...scanFile(full))
    }
  }

  const filtered = applyAllowlist(rawFindings, allowlistResult.entries, { currentDate, root: effectiveRoot })
  return {
    status: filtered.findings.length ? "FAIL" : "PASS",
    scanned,
    findings: filtered.findings,
    suppressed: filtered.suppressed,
    expiredEntries: filtered.expiredEntries,
    orphanEntries: filtered.orphanEntries,
  }
}

function printMetric(report) {
  if (report.status === "unavailable") {
    // No digits anywhere: the gate's lastNumber adapter reports the named gap.
    console.log(redactSensitiveText(`status: unavailable\nreason: ${report.reason}`))
    return
  }
  const counts = report.findings.reduce((acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] ?? 0) + 1 }), {})
  const unique = [...new Set(report.findings.map((f) => f.file))]
  const lines = [
    `status: ${report.status}`,
    `scanned: ${report.scanned}`,
    `findings: FAIL=${counts.FAIL ?? 0}`,
    `suppressed: ${report.suppressed ?? 0}`,
    ...(report.expiredEntries?.length ? [`expired entries: ${report.expiredEntries.length}`, ...report.expiredEntries.map((e) => `  - ${e.sha256} (${e.reason ?? "expired"})`)] : []),
    ...(report.orphanEntries?.length ? [`orphan entries: ${report.orphanEntries.length}`, ...report.orphanEntries.map((e) => `  - ${e.sha256}`)] : []),
    ...(unique.length ? ["flagged:", ...unique.map((file) => `  - ${file}`)] : []),
    String(counts.FAIL ?? 0),
  ]
  console.log(redactSensitiveText(lines.join("\n")))
}

function printReport(report, useText) {
  if (useText) {
    const lines = [
      `status: ${report.status}`,
      `scanned: ${report.scanned}`,
      `suppressed: ${report.suppressed ?? 0}`,
      ...(report.expiredEntries?.length ? [`expired entries: ${report.expiredEntries.length}`, ...report.expiredEntries.map((e) => `  - ${e.sha256} (${e.reason ?? "expired"})`)] : []),
      ...(report.orphanEntries?.length ? [`orphan entries: ${report.orphanEntries.length}`, ...report.orphanEntries.map((e) => `  - ${e.sha256}`)] : []),
      ...report.findings.map((f) => `- ${f.file}: ${f.message}`),
    ]
    console.log(redactSensitiveText(lines.join("\n")))
    return
  }
  console.log(JSON.stringify({ ...report, findings: report.findings.map((f) => ({ ...f, file: redactSensitiveText(f.file) })) }, null, 2))
}

function runCli() {
  const args = process.argv.slice(2)
  const valueOf = (flag) => {
    const index = args.indexOf(flag)
    return index !== -1 && args[index + 1] ? args[index + 1] : null
  }
  const target = valueOf("--target")
  const root = path.resolve(valueOf("--root") ?? process.cwd())
  const allowlistPath = valueOf("--allowlist") ? path.resolve(valueOf("--allowlist")) : null
  const currentDate = valueOf("--current-date")
  const useMetric = args.includes("--metric")
  const useText = args.includes("--text")

  let report
  try {
    report = runScan({ target, root, allowlistPath, currentDate })
  } catch (error) {
    console.error(`harness-redteam-scan could not run: ${redactSensitiveText(error.message)}`)
    process.exitCode = 2
    return
  }

  if (useMetric) {
    printMetric(report)
  } else {
    printReport(report, useText)
  }
  if (report.status === "FAIL") process.exitCode = 1
  else if (report.status === "unavailable") process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli()
