import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  cursorRoot,
  globalOpenCodeRoot,
  HARD_SECRET_PATTERN,
  listFiles,
  redactedFinding,
  redactSensitiveText,
  SECRET_PATTERN,
  uniqueExistingPaths,
} from "./harness-common.mjs"

const scanRoots = uniqueExistingPaths([
  ".opencode",
  ".cursor",
  globalOpenCodeRoot(),
  path.join(cursorRoot(), "skills"),
  path.join(cursorRoot(), "skills-cursor"),
  path.join(cursorRoot(), "plugins", "local"),
  path.join(cursorRoot(), "plans"),
  path.join(cursorRoot(), "mcp.json"),
])
const includePattern = /\.(md|json|jsonc|ts|js|mjs|yml|yaml)$/i
// Finding-5: reuse the shared SECRET_PATTERN (was a divergent {4,}-threshold copy).
const secretPattern = SECRET_PATTERN
// Finding-3: private-key blocks are always a hard FAIL.
const privateKeyPattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----/
const commandPattern = /(curl\s+[^|]+\|\s*(bash|sh|powershell|pwsh)|iwr\s+[^|]+\|\s*iex|irm\s+[^|]+\|\s*iex|invoke-expression|\b(nc|ncat|scp|ssh)\b)/i
const unicodePattern = /[\u202A-\u202E\u2066-\u2069\u200B\u200C\u200D]/u

// A finding's file path is committed to reports, so a secret-bearing filename or a path
// segment that carries a token must never leak. Sanitized at creation — every output
// (JSON, --text, --metric) inherits the redaction. The rest of the path stays intact so
// the location remains useful for triage.
const safePath = (filePath) => redactSensitiveText(String(filePath ?? ""))

// An individual file that was listed but cannot be read or stat'ed (vanished mid-scan
// under a concurrent exporter, locked, unreadable, not a regular file) is NEVER scanned
// as clean: it becomes a FAIL finding carrying only the (sanitized) path and a static
// reason. A partial scan must not read as green.
function unreadable(filePath, detail) {
  return [redactedFinding(safePath(filePath), `file unreadable during scan (${detail}) — an unreadable file is never scanned as clean`, "FAIL")]
}

export function scanFile(filePath) {
  let text
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return unreadable(filePath, "not a regular file")
    text = fs.readFileSync(filePath, "utf8")
  } catch (error) {
    return unreadable(filePath, error?.code ?? "error")
  }
  const findings = []
  // Finding-3: hard secrets / private keys are FAIL; softer heuristic hits stay WARN.
  if (privateKeyPattern.test(text)) findings.push(redactedFinding(safePath(filePath), "Private key block found.", "FAIL"))
  else if (HARD_SECRET_PATTERN.test(text)) findings.push(redactedFinding(safePath(filePath), "Hard secret (sk-/bearer token) found.", "FAIL"))
  else if (secretPattern.test(text)) findings.push(redactedFinding(safePath(filePath), "Potential secret-bearing key or token pattern found.", "WARN"))
  // Finding-3 (revised): FAIL is reserved for actual credential material
  // (private keys / hard secrets). Dangerous-command matches are WARN — command
  // strings legitimately appear in docs, skills, and pattern-definition files, so
  // a hard FAIL there is noise, not signal. NO file may bypass these checks by
  // basename: policy/docs files that trip a heuristic yield a WARN like any other
  // file — only the generated mirrors are excluded from the scan at all.
  if (commandPattern.test(text)) findings.push(redactedFinding(safePath(filePath), "Potential dangerous shell/network command found.", "WARN"))
  if (unicodePattern.test(text)) findings.push(redactedFinding(safePath(filePath), "Invisible or bidi Unicode control character found.", "WARN"))
  if (/<!--[\s\S]*?(ignore|system|developer|instruction)[\s\S]*?-->/i.test(text)) findings.push(redactedFinding(safePath(filePath), "Potential prompt-injection HTML comment found.", "WARN"))
  return findings
}

export function resolveStatus(allFindings) {
  if (allFindings.some((finding) => finding.severity === "FAIL")) return "FAIL"
  if (allFindings.length > 0) return "WARN"
  return "PASS"
}

// Finding-3: default output is JSON; --text prints a scrubbed human summary.
function printReport(report, useText) {
  if (!useText) {
    console.log(JSON.stringify(report, null, 2))
    return
  }
  const counts = report.findings.reduce((acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] ?? 0) + 1 }), {})
  const uniqueFiles = [...new Set(report.findings.map((f) => f.file))]
  const lines = [
    `status: ${report.status}`,
    `scanned files: ${report.scannedFiles}`,
    `findings: FAIL=${counts.FAIL ?? 0} WARN=${counts.WARN ?? 0}`,
    "flagged files:",
    ...uniqueFiles.map((file) => `  - ${file}`),
  ]
  // Finding-5: scrub the summary through redactSensitiveText so no secret value
  // can leak even if a file path or message ever carried one. Finding paths are
  // already sanitized at creation; this is defense in depth for every other line.
  console.log(redactSensitiveText(lines.join("\n")))
}

function runCli() {
  const args = process.argv.slice(2)
  const useText = args.includes("--text")
  const useMetric = args.includes("--metric")
  // Generated mirrors ONLY: .dsh-target/ (an external tool's copied working tree of this
  // repo) and codex/plugins/opencode-harness/assets/ (the Codex exporter's raw unadapted
  // copies). Their source equivalents — skills/, templates/, plugins/, scripts/ — are all
  // inside the scan, so the mirrors add nothing but re-flags of material already reviewed
  // at its live home. tests/, skills/ and every other source family stay scanned, and no
  // file may suppress a check by its basename.
  const isGeneratedMirror = (file) =>
    /[\\/]\.dsh-target[\\/]/.test(file) || /[\\/]codex[\\/]plugins[\\/]opencode-harness[\\/]assets[\\/]/.test(file)
  // A scan root can vanish mid-listing while a concurrent exporter regenerates it. An
  // incomplete scan must never read as green: each failed root becomes a FAIL finding.
  const scanErrors = []
  const files = scanRoots.flatMap((root) => {
    try {
      return listFiles(path.resolve(root), (file) => includePattern.test(file) && !isGeneratedMirror(file))
    } catch (error) {
      scanErrors.push(
        redactedFinding(safePath(path.resolve(root)), `scan root unreadable during listing (${error?.code ?? "error"}) — possible concurrent regeneration; a partial scan never passes`, "FAIL"),
      )
      return []
    }
  })
  const findings = [...files.flatMap(scanFile), ...scanErrors]
  const status = resolveStatus(findings)
  const report = { status, scanRoots: scanRoots.map(safePath), scannedFiles: files.length, findings }
  if (useMetric) {
    // --metric feeds commands.security in agent-os/quality-thresholds.json: the gate's
    // output contract reads the LAST number on the LAST non-empty line as the value, so
    // the FAIL count is the final line and nothing follows it. WARNs are reported in the
    // summary (they stay in the preflight exit code) but never counted into the metric.
    const counts = report.findings.reduce((acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] ?? 0) + 1 }), {})
    const uniqueFiles = [...new Set(report.findings.map((f) => f.file))]
    const lines = [
      `status: ${status}`,
      `scanned files: ${report.scannedFiles}`,
      `findings: FAIL=${counts.FAIL ?? 0} WARN=${counts.WARN ?? 0}`,
      ...(uniqueFiles.length ? ["flagged files:", ...uniqueFiles.map((file) => `  - ${file}`)] : []),
      String(counts.FAIL ?? 0),
    ]
    console.log(redactSensitiveText(lines.join("\n")))
  } else if (!useText) {
    printReport(report, false)
  } else {
    printReport(report, true)
  }
  // Finding-3: exit 2 on FAIL, 1 on WARN, 0 on PASS so CI can gate on it.
  if (status === "FAIL") process.exitCode = 2
  else if (status === "WARN") process.exitCode = 1
}

// Auto-run only when invoked directly (keeps the CLI entrypoint working) but not
// when imported by tests. `pathToFileURL(argv[1])` matches import.meta.url on Windows too.
if (import.meta.url === pathToFileURL(process.argv[1]).href) runCli()
