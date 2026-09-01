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
// once on its reconciled diff; findings (FAIL count > 0) escalate to an operator-approved
// security review. Tier auto with zero findings needs no reviewer.
//
// Output contract (gate metric `redteam_quickcheck` via commands.redteam):
//   --metric prints a summary whose LAST non-empty line is the exact FAIL count
//   (mirrors harness-security-scan.mjs --metric). An unavailable scan (no target and
//   not a git repo) prints lines with NO digits so the gate's lastNumber adapter
//   reports the named gap, never a forged number.
//
// Exit codes: 0 clean · 1 findings · 2 unusable target or internal error.

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
]
const hardSecretRe = HARD_SECRET_PATTERN

// Path traversal: only parent-directory arguments in path/file joins/resolution.
// Documentation, relative imports, normalization checks, and trusted static module-root
// paths are not findings; dynamic or user-controlled path composition remains a finding.
const traversalRe = /\b(?:path|fs)\.(?:join|resolve)\([^\n]*?["']\.\.["']\s*(?:,|\))/u
const combinedTraversalRe = /\b(?:path|fs)\.(?:join|resolve)\([^\n]*?["'](?:\.\.[\\/])+[^"'`\n]*["']/u
const benignTraversalRe = /\b(?:path|fs)\.(?:join|resolve)\((?:__dirname|import\.meta\.dirname|path\.dirname\(fileURLToPath\(import\.meta\.url\)\)|(?:HERE|ROOT|REPO|PROJECT_ROOT|repoRoot|root))\s*,\s*(?:["'][^"'`\n]*["']\s*,\s*)*["']\.\.["'](?:\s*,\s*["'][^"'`\n]*["'])*\s*\)/u
// Injection sinks: shell/process execution, eval, and SQL string concatenation.
// Synchronous harness calls are intentionally excluded; only unsuffixed execution
// calls or explicitly shell-enabled calls are considered sinks.
const injectionPatterns = [
  { label: "shell exec sink", re: /\bchild_process\.(?:exec|execFile|spawn|fork)\s*\(/ },
  { label: "exec/spawn call sink", re: /(?<![.\w])(?:exec|spawn)\s*\(/ },
  { label: "eval sink", re: /\beval\s*\(|\bnew\s+Function\s*\(/ },
  { label: "shell:true execution", re: /(?:exec|spawn)\s*\([^)]*shell\s*:\s*true/i },
  { label: "SQL string concatenation", re: /\b(?:SELECT|INSERT|UPDATE|DELETE|DROP|WHERE)\b[^;\n]{0,200}?(\+\s*[a-z_$]|["'`][^"'`\n]{0,80}\$\{)/i },
]

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

// A finding's target label is committed to reports; scrub anything that could carry a
// token through redactSensitiveText at creation time.
const safeLabel = (value) => redactSensitiveText(String(value ?? ""))

export function scanText(text, source = "<diff>") {
  const findings = []
  const lines = String(text ?? "").split(/\r?\n/)
  lines.forEach((line, index) => {
    const lineNo = index + 1
    for (const { label, re } of ALL_PATTERNS) {
      if (re.test(line)) {
        findings.push(redactedFinding(safeLabel(`${source}:${lineNo}`), label, "FAIL"))
      }
    }
    if ((traversalRe.test(line) || combinedTraversalRe.test(line)) && !benignTraversalRe.test(line)) {
      findings.push(redactedFinding(safeLabel(`${source}:${lineNo}`), "path traversal (parent-directory segment or quoted dot-dot in a path join)", "FAIL"))
    }
    if (hardSecretRe.test(line)) {
      // HARD_SECRET_PATTERN is not in ALL_PATTERNS (it is a RegExp with alternation);
      // a bare token with no other pattern must still be a finding.
      findings.push(redactedFinding(safeLabel(`${source}:${lineNo}`), "hard secret token (sk-/bearer)", "FAIL"))
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

//  - test files (tests/, test/, __tests__/, *.test.*, *_test.*) — the same planted
//    marker class: hostile fixtures inside test files are deliberate, not leaks.
//  - `agent-os/specs/**` and `agent-os/standards/**` — planning/governance prose whose
//    pattern examples are documentation, reviewed as prose in the plan itself.
//  - this scanner's own module — its pattern definitions are exercised by the test
//    suite, not by diff content; the definitions are the instrument, not the sample.
const isTestFile = (relative) =>
  /(^|[\\/])(tests?|__tests__)[\\/]/.test(relative) ||
  /\.(test|spec)\.[a-z]+$/i.test(relative) ||
  /_test\.[a-z]+$/i.test(relative)

const isDefaultExcluded = (relative) =>
  /[\\/]fixtures[\\/]/.test(relative) ||
  isTestFile(relative) ||
  /(?:^|[\\/])agent-os[\\/](?:specs|standards)[\\/]/.test(relative) ||
  path.basename(relative) === "harness-redteam-scan.mjs"

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
    }
    return [resolved]
  }
  const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8", shell: false, maxBuffer: 32 * 1024 * 1024 })
  const probe = git(["rev-parse", "--is-inside-work-tree"])
  if (probe.status !== 0) return null
  const diff = git(["diff", "HEAD"])?.stdout ?? ""
  const untracked = (git(["ls-files", "--others", "--exclude-standard", "-z"])?.stdout ?? "").split("\0").filter(Boolean)
  return { diffText: diff, untracked }
}

function runScan({ target, root }) {
  const resolved = resolveTargets(target, root)
  if (resolved === null) {
    return { status: "unavailable", reason: "not a git repo and no --target given — pass --target <diff-file|dir> explicitly", scanned: 0, findings: [] }
  }
  const findings = []
  let scanned = 0
  if (Array.isArray(resolved)) {
    for (const file of resolved) {
      scanned += 1
      findings.push(...scanFile(file))
    }
  } else {
    const { diffText, untracked } = resolved
    const filteredDiff = filterDefaultDiff(diffText)
    scanned = filteredDiff.split("\n").length
    findings.push(...scanText(filteredDiff, "diff"))
    for (const file of untracked.filter((filePath) => !isDefaultExcluded(filePath))) {
      const full = path.resolve(root, file)
      let stat
      try {
        stat = fs.statSync(full)
      } catch {
        continue
      }
      if (!stat.isFile()) continue
      scanned += 1
      findings.push(...scanFile(full))
    }
  }
  return { status: findings.length ? "FAIL" : "PASS", scanned, findings }
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
  const useMetric = args.includes("--metric")
  const useText = args.includes("--text")

  let report
  try {
    report = runScan({ target, root })
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
