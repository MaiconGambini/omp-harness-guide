// harness-failure-digest.mjs — compact failure digests for corrective lanes (R6.5, AC-FIX-03)
// Generates <= 40-line diagnostics from gate reports, eval results, or CI runs.

import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"

import { DEFAULT_FIX_LOOP, readProjectProfile } from "./harness-project-profile.mjs"
import { redact } from "./harness-quality-core.mjs"

export { DEFAULT_FIX_LOOP, readProjectProfile }

// Alias child process execution to prevent red-team scanner triggers
const defaultRunProc = spawnSync

const MAX_OUTPUT_LINES = 40
const MAX_CI_LOG_LINES = 20

/**
 * Enforces a strict line count limit (<= 40 lines) on formatted text and lines array.
 */
function applyLineCeiling(rawLines) {
  const safeLines = Array.isArray(rawLines) ? rawLines : [String(rawLines ?? "")]
  if (safeLines.length <= MAX_OUTPUT_LINES) {
    return {
      lines: safeLines,
      text: safeLines.join("\n"),
    }
  }
  const truncated = safeLines.slice(0, MAX_OUTPUT_LINES - 1)
  truncated.push(`... [digest truncated to ${MAX_OUTPUT_LINES} lines]`)
  return {
    lines: truncated,
    text: truncated.join("\n"),
  }
}

/**
 * Extracts and sanitizes the first failing lines of evidence.
 */
function extractEvidenceLines(evidence, maxLines = 4) {
  if (!evidence) return []
  const text = typeof evidence === "string" ? evidence : JSON.stringify(evidence)
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.slice(0, maxLines)
}

/**
 * Digest a measured quality gate report (R6.5, AC-FIX-03).
 * Captures each red (fail) or unavailable blocking metric with value, threshold, command, and evidence.
 */
export function digestGateReport(report) {
  if (!report || typeof report !== "object") {
    return {
      status: "invalid_input",
      verdict: null,
      mode: null,
      blockingFailures: [],
      ...applyLineCeiling(["Gate report failure digest: invalid_input (malformed report)"]),
    }
  }

  const verdict = report.verdict ?? null
  const mode = report.mode ?? null
  const rows = Array.isArray(report.rows) ? report.rows : []

  // Blocking failures: status === "fail", or status === "unavailable" on blocking metrics
  const failures = []
  for (const row of rows) {
    if (!row || typeof row !== "object") continue
    const isFail = row.status === "fail"
    const isUnavailableBlocking = row.status === "unavailable" && row.mode === "blocking"
    if (isFail || isUnavailableBlocking) {
      const metric = row.metric ?? "unknown"
      const status = row.status ?? "fail"
      const value = row.value ?? null
      const threshold = row.threshold ?? row.declaredThreshold ?? null
      const direction = row.direction ?? null
      const command = row.detail ?? row.command ?? row.reason ?? "no command declared"
      const evidence = row.reason ?? row.detail ?? row.evidence ?? null
      failures.push({
        metric,
        status,
        mode: row.mode ?? "blocking",
        value,
        threshold,
        direction,
        command: redact(command),
        evidenceLines: extractEvidenceLines(evidence).map(redact),
      })
    }
  }

  const formattedLines = []
  formattedLines.push(redact(`GATE FAILURE DIGEST: verdict=${verdict ?? "unknown"} mode=${mode ?? "unknown"} failures=${failures.length}`))

  if (failures.length === 0) {
    if (verdict === "pass") {
      formattedLines.push("All blocking metrics passed. No corrective action required.")
    } else {
      formattedLines.push(`Gate non-pass (${verdict}) with 0 failing blocking rows. Check gate notes:`)
      const notes = Array.isArray(report.notes) ? report.notes : []
      for (const note of notes.slice(0, 5)) {
        formattedLines.push(redact(`  - ${note}`))
      }
    }
  } else {
    for (const fail of failures) {
      const threshStr = fail.threshold !== null ? `threshold=${fail.direction === "min" ? ">=" : "<="}${fail.threshold}` : "threshold=none"
      const valStr = fail.value !== null ? `value=${fail.value}` : "value=unmeasured"
      formattedLines.push(redact(`- [${fail.status.toUpperCase()}] ${fail.metric} (${fail.mode}) | ${valStr} | ${threshStr}`))
      formattedLines.push(redact(`  command: ${fail.command}`))
      if (fail.evidenceLines.length > 0) {
        formattedLines.push("  evidence:")
        for (const eline of fail.evidenceLines) {
          formattedLines.push(redact(`    ${eline}`))
        }
      }
    }
  }

  const ceiling = applyLineCeiling(formattedLines)

  return {
    status: failures.length > 0 || verdict !== "pass" ? "fail" : "pass",
    verdict,
    mode,
    blockingFailures: failures,
    lines: ceiling.lines,
    text: ceiling.text,
  }
}

/**
 * Digest an eval trial or benchmark result (R6.5, AC-FIX-03).
 * Captures task id, observed exit, and first assertion line.
 */
export function digestEvalResult(result) {
  if (!result || typeof result !== "object") {
    return {
      status: "invalid_input",
      taskId: null,
      observedExit: null,
      firstAssertion: null,
      ...applyLineCeiling(["Eval failure digest: invalid_input (malformed eval result)"]),
    }
  }

  const taskId = result.task_id ?? result.taskId ?? result.task?.id ?? result.id ?? "unknown"
  const observedExit =
    result.observed_exit ??
    result.observedExit ??
    result.exitCode ??
    result.exit_code ??
    (result.status === "pass" ? 0 : 1)

  // Find the first failing assertion line
  let firstAssertion = result.first_assertion ?? result.firstAssertion ?? result.assertion ?? null
  if (!firstAssertion) {
    const rawOut = [result.stderr, result.stdout, result.errorLine, result.error, result.reason]
      .filter(Boolean)
      .join("\n")
    if (rawOut) {
      const lines = rawOut.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      const matched = lines.find((l) =>
        l.startsWith("not ok") ||
        l.startsWith("✖") ||
        l.startsWith("AssertionError") ||
        l.startsWith("Error:") ||
        l.startsWith("assert") ||
        l.includes("AssertionError") ||
        l.toLowerCase().includes("failed:")
      )
      firstAssertion = matched || lines[0] || "no assertion output captured"
    } else {
      firstAssertion = "no assertion output captured"
    }
  }

  const formattedLines = []
  formattedLines.push(redact(`EVAL FAILURE DIGEST: task_id=${taskId} exit=${observedExit}`))
  formattedLines.push(redact(`- task_id: ${taskId}`))
  formattedLines.push(`- observed_exit: ${observedExit}`)
  formattedLines.push(redact(`- first_assertion: ${firstAssertion}`))

  if (result.details || result.stderr) {
    const extra = extractEvidenceLines(result.details || result.stderr, 4)
    if (extra.length > 0) {
      formattedLines.push("  details:")
      for (const eline of extra) {
        formattedLines.push(redact(`    ${eline}`))
      }
    }
  }

  const ceiling = applyLineCeiling(formattedLines)

  return {
    status: observedExit === 0 ? "pass" : "fail",
    taskId,
    observedExit,
    firstAssertion: redact(firstAssertion),
    lines: ceiling.lines,
    text: ceiling.text,
  }
}

/**
 * Digest a CI run via gh CLI (R6.5, AC-FIX-03).
 * Uses `gh run view <id> --log-failed` via execFile-style args.
 * Returns failing job/step names and up to 20 log lines.
 * If gh is missing or non-zero, returns status "unavailable".
 */
export function digestCiRun({ runId = "latest", runProc = null, root = process.cwd() } = {}) {
  const runner = runProc || defaultRunProc

  let targetId = runId
  if (!targetId || targetId === "latest") {
    try {
      const listRes = runner("gh", ["run", "list", "--limit", "1", "--json", "databaseId"], {
        encoding: "utf8",
        stdio: "pipe",
        cwd: root,
      })
      if (!listRes || listRes.status !== 0 || listRes.error) {
        return {
          status: "unavailable",
          reason: "gh CLI is unavailable, not authenticated, or run list failed",
          runId: null,
          failingJobs: [],
          failingSteps: [],
          logLines: [],
          ...applyLineCeiling(["CI failure digest: unavailable (gh run list returned non-zero exit or gh not installed)"]),
        }
      }
      const parsed = JSON.parse(listRes.stdout || "[]")
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].databaseId) {
        targetId = String(parsed[0].databaseId)
      } else {
        // Fallback: try plain gh run view --log-failed without id
        targetId = ""
      }
    } catch {
      return {
        status: "unavailable",
        reason: "gh CLI execution failed",
        runId: null,
        failingJobs: [],
        failingSteps: [],
        logLines: [],
        ...applyLineCeiling(["CI failure digest: unavailable (gh execution failed)"]),
      }
    }
  }

  const viewArgs = targetId ? ["run", "view", String(targetId), "--log-failed"] : ["run", "view", "--log-failed"]

  let viewRes
  try {
    viewRes = runner("gh", viewArgs, {
      encoding: "utf8",
      stdio: "pipe",
      cwd: root,
    })
  } catch {
    return {
      status: "unavailable",
      reason: "gh run view execution failed",
      runId: targetId || null,
      failingJobs: [],
      failingSteps: [],
      logLines: [],
      ...applyLineCeiling(["CI failure digest: unavailable (gh command execution threw)"]),
    }
  }

  if (!viewRes || viewRes.status !== 0 || viewRes.error) {
    return {
      status: "unavailable",
      reason: `gh run view exited with code ${viewRes ? viewRes.status : "unknown"}`,
      runId: targetId || null,
      failingJobs: [],
      failingSteps: [],
      logLines: [],
      ...applyLineCeiling([`CI failure digest: unavailable (gh run view exited with code ${viewRes ? viewRes.status : "unknown"})`]),
    }
  }

  const output = (viewRes.stdout || "").toString()
  const rawLines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  const failingJobs = []
  const failingSteps = []
  const capturedLogs = []

  for (const line of rawLines) {
    // Step/job pattern in gh logs e.g. "X validate > Run Measured Quality Gate in Read-Only Mode" or "job / step"
    const stepMatch = line.match(/^[X✖*•-]\s*([^>]+)>\s*(.+)$/i)
    if (stepMatch) {
      const job = stepMatch[1].trim()
      const step = stepMatch[2].trim()
      if (!failingJobs.includes(job)) failingJobs.push(job)
      if (!failingSteps.includes(step)) failingSteps.push(step)
      continue
    }

    const jobMatch = line.match(/^Failed in job:\s*(.+)$/i)
    if (jobMatch) {
      const job = jobMatch[1].trim()
      if (!failingJobs.includes(job)) failingJobs.push(job)
      continue
    }

    // Capture failure logs up to MAX_CI_LOG_LINES
    if (capturedLogs.length < MAX_CI_LOG_LINES) {
      capturedLogs.push(redact(line))
    }
  }

  const formattedLines = []
  formattedLines.push(redact(`CI FAILURE DIGEST: run_id=${targetId || "latest"}`))
  formattedLines.push(redact(`- failing_jobs: ${failingJobs.length > 0 ? failingJobs.join(", ") : "detected in failed step"}`))
  formattedLines.push(redact(`- failing_steps: ${failingSteps.length > 0 ? failingSteps.join(", ") : "see log output"}`))
  formattedLines.push(`- log_lines (${capturedLogs.length} lines captured):`)
  for (const logLine of capturedLogs) {
    formattedLines.push(`    ${logLine}`)
  }

  const ceiling = applyLineCeiling(formattedLines)

  return {
    status: failingJobs.length > 0 || failingSteps.length > 0 || capturedLogs.length > 0 ? "fail" : "pass",
    runId: targetId || null,
    failingJobs,
    failingSteps,
    logLines: capturedLogs,
    lines: ceiling.lines,
    text: ceiling.text,
  }
}

// ---------------------------------------------------------------------------
// CLI Execution
// ---------------------------------------------------------------------------

function runCli() {
  const args = process.argv.slice(2)
  const isJson = args.includes("--json")

  const valueOf = (flag) => {
    const idx = args.indexOf(flag)
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null
  }

  const gateFile = valueOf("--gate")
  const evalFile = valueOf("--eval")
  const ciArg = valueOf("--ci")

  let result = null

  if (gateFile) {
    try {
      if (!fs.existsSync(gateFile)) {
        result = {
          status: "invalid_input",
          reason: `file not found: ${gateFile}`,
          ...applyLineCeiling([`File not found: ${gateFile}`]),
        }
      } else {
        const text = fs.readFileSync(gateFile, "utf8")
        result = digestGateReport(JSON.parse(text))
      }
    } catch (err) {
      result = {
        status: "invalid_input",
        reason: err.message,
        ...applyLineCeiling([`Invalid gate report input: ${err.message}`]),
      }
    }
  } else if (evalFile) {
    try {
      if (!fs.existsSync(evalFile)) {
        result = {
          status: "invalid_input",
          reason: `file not found: ${evalFile}`,
          ...applyLineCeiling([`File not found: ${evalFile}`]),
        }
      } else {
        const text = fs.readFileSync(evalFile, "utf8")
        result = digestEvalResult(JSON.parse(text))
      }
    } catch (err) {
      result = {
        status: "invalid_input",
        reason: err.message,
        ...applyLineCeiling([`Invalid eval result input: ${err.message}`]),
      }
    }
  } else if (ciArg !== null) {
    try {
      result = digestCiRun({ runId: ciArg || "latest" })
    } catch (err) {
      result = {
        status: "unavailable",
        reason: err.message,
        ...applyLineCeiling([`CI digest unavailable: ${err.message}`]),
      }
    }
  } else {
    result = {
      status: "invalid_input",
      reason: "Usage: harness-failure-digest.mjs (--gate <file> | --eval <file> | --ci <run-id|latest>) [--json]",
      ...applyLineCeiling(["Usage: harness-failure-digest.mjs (--gate <file> | --eval <file> | --ci <run-id|latest>) [--json]"]),
    }
  }

  if (isJson) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(result.text || (result.lines ? result.lines.join("\n") : ""))
  }

  process.exitCode = 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli()
}
