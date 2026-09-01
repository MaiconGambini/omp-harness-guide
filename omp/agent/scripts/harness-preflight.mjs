import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { redactSensitiveText } from "./harness-common.mjs"

// harness-preflight: turns the security scanner's exit-code contract into a real
// commit gate. It shells out to harness-security-scan.mjs and reads that process's
// exit code + JSON stdout, then applies a commit-friendly exit policy:
//   FAIL (real credential material)  -> exit 2, always blocks.
//   WARN (heuristic / doc-command hit) -> print but exit 0 by default so example
//                                         commands in docs don't block every
//                                         commit; --strict promotes WARN to exit 1.
//   PASS                             -> exit 0.
//
// Why shell out instead of importing scanFile/resolveStatus directly: the scanner
// module runs its scan-and-print at top level (no main() guard), so importing it
// would execute a full scan and write JSON to our stdout as a side effect. Running
// it as a child process keeps its output isolated and lets us honor its documented
// contract (exit 2=FAIL, 1=WARN, 0=PASS) as the source of truth.

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const scannerPath = path.join(scriptDir, "harness-security-scan.mjs")

function printHelp() {
  const lines = [
    "harness-preflight — commit gate over the harness security scanner.",
    "",
    "Usage: node .opencode/scripts/harness-preflight.mjs [--strict] [--help]",
    "",
    "Exit codes:",
    "  0  PASS, or WARN without --strict.",
    "  1  WARN with --strict.",
    "  2  FAIL (real credential material) — always blocks.",
    "",
    "Flags:",
    "  --strict  Treat WARN findings as blocking (exit 1).",
    "  --help    Show this help and exit 0.",
  ]
  console.log(lines.join("\n"))
}

// Runs the scanner as a child process and returns its parsed JSON report plus the
// raw exit code. Falls back to a synthetic FAIL report if the scanner can't run or
// emits unparseable output — a broken scanner must not silently open the gate.
function runScanner() {
  const result = spawnSync(process.execPath, [scannerPath], { encoding: "utf8" })
  if (result.error) {
    return { report: null, error: `scanner failed to start: ${result.error.message}`, code: 2 }
  }
  try {
    return { report: JSON.parse(result.stdout), error: null, code: result.status ?? 2 }
  } catch (parseError) {
    return { report: null, error: `unparseable scanner output: ${parseError.message}`, code: 2 }
  }
}

function severityCounts(findings) {
  return findings.reduce(
    (acc, finding) => ({ ...acc, [finding.severity]: (acc[finding.severity] ?? 0) + 1 }),
    {},
  )
}

// Prints a scrubbed summary. Never emits secret values: the whole block is run
// through redactSensitiveText, matching the scanner's own --text guarantee.
function printSummary(report, strict) {
  const findings = report.findings ?? []
  const counts = severityCounts(findings)
  const flaggedFiles = [...new Set(findings.map((finding) => finding.file))]
  const lines = [
    "harness-preflight gate",
    `mode: ${strict ? "strict (WARN blocks)" : "default (WARN allowed)"}`,
    `status: ${report.status}`,
    `scanned files: ${report.scannedFiles ?? 0}`,
    `findings: FAIL=${counts.FAIL ?? 0} WARN=${counts.WARN ?? 0}`,
    "flagged files:",
    ...(flaggedFiles.length ? flaggedFiles.map((file) => `  - ${file}`) : ["  (none)"]),
  ]
  console.log(redactSensitiveText(lines.join("\n")))
}

// Maps scan status + strict mode to the wrapper's exit policy. Returns 0/1/2.
function resolveExitCode(status, strict) {
  if (status === "FAIL") return 2
  if (status === "WARN" && strict) return 1
  return 0
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes("--help")) {
    printHelp()
    return
  }
  const strict = args.includes("--strict")
  const { report, error } = runScanner()
  if (!report) {
    console.error(`harness-preflight: ${error} — blocking commit (exit 2).`)
    process.exitCode = 2
    return
  }
  printSummary(report, strict)
  const exitCode = resolveExitCode(report.status, strict)
  if (exitCode !== 0) console.error(`harness-preflight: blocking commit (exit ${exitCode}).`)
  process.exitCode = exitCode
}

main()
