import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"

import { redactSensitiveText } from "./harness-common.mjs"

export const DEFAULT_DEADLINE_MS = 120000
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024
const DEFAULT_SCANNER_PATH = fileURLToPath(new URL("./harness-redteam-scan.mjs", import.meta.url))

const elapsed = (startedAt) => Date.now() - startedAt
const unavailable = (startedAt, scannedScope, reason) => ({
  result: "unavailable",
  elapsedMs: elapsed(startedAt),
  scannedScope,
  reason: redactSensitiveText(String(reason)),
  findings: [],
})

const validDeadline = (deadlineMs) => Number.isInteger(deadlineMs) && deadlineMs > 0 ? deadlineMs : null

export function runRedteam({ laneTarget, deadlineMs = DEFAULT_DEADLINE_MS, scannerPath = DEFAULT_SCANNER_PATH, spawnSyncImpl = spawnSync } = {}) {
  const startedAt = Date.now()
  const scannedScope = typeof laneTarget === "string" && laneTarget.trim() ? path.resolve(laneTarget) : null
  if (!scannedScope) return unavailable(startedAt, null, "lane target is required")

  const timeoutMs = validDeadline(deadlineMs)
  if (timeoutMs === null) return unavailable(startedAt, scannedScope, "deadline must be a positive integer in milliseconds")

  let targetStat
  try {
    targetStat = fs.statSync(scannedScope)
  } catch (error) {
    return unavailable(startedAt, scannedScope, `lane target is unavailable (${error?.code ?? "not found"})`)
  }
  if (!targetStat.isFile() && !targetStat.isDirectory()) {
    return unavailable(startedAt, scannedScope, "lane target is not a file or directory")
  }

  let child
  try {
    child = spawnSyncImpl(process.execPath, [scannerPath, "--target", laneTarget, "--json"], {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: MAX_OUTPUT_BYTES,
      timeout: timeoutMs,
      windowsHide: true,
      shell: false,
    })
  } catch (error) {
    return unavailable(startedAt, scannedScope, `red-team scanner crashed (${error?.message ?? "unknown error"})`)
  }

  if (child.error) {
    const timedOut = child.error.code === "ETIMEDOUT" || child.signal === "SIGTERM"
    return unavailable(
      startedAt,
      scannedScope,
      timedOut ? `red-team scanner timed out after ${timeoutMs}ms` : `red-team scanner failed (${child.error.message})`,
    )
  }
  if (child.signal || child.status === null || child.status === undefined) {
    return unavailable(startedAt, scannedScope, `red-team scanner crashed${child.signal ? ` (${child.signal})` : ""}`)
  }

  let report
  try {
    report = JSON.parse(String(child.stdout ?? "").trim())
  } catch {
    return unavailable(startedAt, scannedScope, `red-team scanner returned invalid JSON (exit ${child.status})`)
  }

  if (!report || !["PASS", "FAIL", "unavailable"].includes(report.status)) {
    return unavailable(startedAt, scannedScope, "red-team scanner returned an unknown status")
  }
  if (report.status === "unavailable") {
    return unavailable(startedAt, scannedScope, report.reason ?? "red-team scanner reported unavailable")
  }

  const findings = Array.isArray(report.findings) ? report.findings : []
  if (report.status === "FAIL") {
    if (child.status !== 1) return unavailable(startedAt, scannedScope, `red-team scanner failed unexpectedly (exit ${child.status})`)
    return { result: "fail", elapsedMs: elapsed(startedAt), scannedScope, findings }
  }
  if (child.status !== 0) return unavailable(startedAt, scannedScope, `red-team scanner failed unexpectedly (exit ${child.status})`)
  return { result: "pass", elapsedMs: elapsed(startedAt), scannedScope, findings: [] }
}

const valueOf = (args, flag) => {
  const index = args.indexOf(flag)
  return index !== -1 && args[index + 1] ? args[index + 1] : null
}

function runCli() {
  const args = process.argv.slice(2)
  const laneTarget = valueOf(args, "--lane-target")
  const rawDeadline = valueOf(args, "--deadline-ms")
  const deadlineMs = rawDeadline === null ? DEFAULT_DEADLINE_MS : Number(rawDeadline)
  const result = runRedteam({ laneTarget, deadlineMs })

  if (args.includes("--json")) {
    console.log(JSON.stringify(result))
  } else {
    console.log(`result: ${result.result}`)
    console.log(`elapsedMs: ${result.elapsedMs}`)
    console.log(`scannedScope: ${result.scannedScope ?? "<none>"}`)
    if (result.result === "unavailable") console.log(`reason: ${result.reason}`)
    else console.log(`findings: ${result.findings.length}`)
  }

  if (result.result === "fail") process.exitCode = 1
  else if (result.result === "unavailable") process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli()
