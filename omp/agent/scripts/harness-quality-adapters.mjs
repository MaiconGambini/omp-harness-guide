// harness-quality-adapters — the only place that knows about external tools.
//
// Split out of the gate module because this is the part that varies per project and per
// stack, while thresholds and verdicts are policy. Splitting it also gives the output-parsing
// contract a testable seam: `lastNumber` once turned "Scanned 120 files, found 3 issues" into
// a security_findings of 120, and it was unreachable except by shelling out a command.
//
// TRUST BOUNDARY: `commands.*` and `suites.*.command` come from a project-local, git-tracked
// file and are executed through a shell. Running the gate in a repo you have not read is
// equivalent to running its Makefile. Pass `projectCommands: false` (CLI:
// `--no-project-commands`) to measure with built-in adapters only. See
// docs/harness/measured-gates.md.
//
// Every adapter returns `{ value, detail }` or `{ unavailable: "<reason>", kind }`, where
// `kind` classifies WHY there is no measurement:
//
//   "not_configured"  — nothing was ever wired up for this metric in this project (no
//                       command declared, no tool for the stack, no config file). A gap
//                       to name, but a KNOWN one: it does not escalate the review tier,
//                       because escalating on it means escalating forever.
//   "not_applicable"  — the control does not apply to this project or this diff.
//   "unavailable"     — it SHOULD have measured and did not: timeout, crash, unparseable
//                       output, a command that broke. Fail-closed, escalates. This is the
//                       DEFAULT when `kind` is absent, so a new adapter is conservative.
//
// The distinction exists because 15 of 21 metrics in this repo have no instrument, so
// treating "never configured" and "broke just now" as the same state made `auto` tier
// unreachable and turned the gap accounting into permanent noise.
// Unavailable is
// a named gap: not a pass, not a failure.

import fs from "node:fs"
import { exec, spawnSync } from "node:child_process"
import { promisify } from "node:util"

const execPromise = promisify(exec)
import path from "node:path"
import {
  COMMAND_TIMEOUT_MS,
  FINDINGS_DIR,
  makeGit,
  readJsonIfExists,
  readTextIfExists,
  redact,
  resolveInsideRoot,
  sourceHash,
  SOURCE_FILE_PATTERN,
} from "./harness-quality-core.mjs"
import { fileURLToPath } from "node:url"
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const commonModule = fs.existsSync(path.join(__dirname, "harness-common.mjs"))
  ? await import("./harness-common.mjs")
  : await import("../../../scripts/harness-common.mjs")
const { listFiles, pathExists } = commonModule
// The GLOBAL findings module, imported by module path — never shelled out, never a
// project-local copy. See the TRUST BOUNDARY note at the top and the "adherence"
// section in docs/harness/measured-gates.md: this import does not widen the
// project-local-command trust boundary.
const findingsModule = fs.existsSync(path.join(__dirname, "harness-risk-router.mjs"))
  ? await import("./harness-findings.mjs")
  : await import("../../../scripts/harness-findings.mjs")
const {
  assessWindow,
  citationCompetence,
  readWindow,
  recallEstimate,
  resolveRulePointer,
  unciteableRatio,
} = findingsModule
const completionGateModule = fs.existsSync(path.join(__dirname, "harness-completion-gate.mjs"))
  ? await import("./harness-completion-gate.mjs")
  : await import("../../../scripts/harness-completion-gate.mjs")
const { validateCompletionFile } = completionGateModule


// A shell IS used here — these are project-authored command lines, not paths. The timeout is
// the important part: a hung test runner would otherwise hang the agent's lane forever.
export function runProjectCommand(commandLine, cwd) {
  const result = spawnSync(commandLine, {
    encoding: "utf8",
    shell: true,
    cwd,
    maxBuffer: 32 * 1024 * 1024,
    timeout: COMMAND_TIMEOUT_MS,
  })
  return {
    ok: result.status === 0,
    code: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    timedOut: result.signal === "SIGTERM" && result.status === null,
  }
}

export async function runProjectCommandAsync(commandLine, cwd) {
  try {
    const { stdout, stderr } = await execPromise(commandLine, {
      encoding: "utf8",
      cwd,
      maxBuffer: 32 * 1024 * 1024,
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
    })
    return {
      ok: true,
      code: 0,
      stdout: stdout ?? "",
      stderr: stderr ?? "",
      timedOut: false,
    }
  } catch (error) {
    return {
      ok: false,
      code: typeof error.code === "number" ? error.code : 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? (error.message || ""),
      timedOut: Boolean(error.killed && (error.signal === "SIGTERM" || error.code === "ETIMEDOUT")),
    }
  }
}

export const SCANNER_EXIT_CONTRACTS = Object.freeze({
  default: Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
  eslint: Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
  bandit: Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
  brakeman: Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1, 3]),
    allowedExitCodes: Object.freeze([0, 1, 3]),
  }),
  radon: Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
  "dependency-cruiser": Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
  "import-linter": Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
  "npm-audit": Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
  redteam: Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
  authz: Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
  cooldown: Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
  skill_lint: Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
  mutation: Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
  security: Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
  complexity: Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
  boundaries: Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
  prose: Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
  comments: Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
  file_growth: Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
  function_size: Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
  eval: Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
  delivery: Object.freeze({
    clean: Object.freeze([0]),
    findings: Object.freeze([1]),
    allowedExitCodes: Object.freeze([0, 1]),
  }),
})

export function evaluateScannerExitContract(scanner, result, options = {}) {
  const label = typeof scanner === "string" ? scanner : (scanner?.name ?? "scanner")

  if (
    options.strict_exit_codes === false ||
    options.strictExitCodes === false ||
    options.config?.strict_exit_codes === false ||
    options.thresholds?.strict_exit_codes === false
  ) {
    return {
      ok: false,
      unavailable: `${label}: strict_exit_codes: false bypass is forbidden`,
      kind: "unavailable",
    }
  }

  if (!result) {
    return {
      ok: false,
      unavailable: `${label} produced no execution result`,
      kind: "unavailable",
    }
  }

  if (result.timedOut) {
    return {
      ok: false,
      unavailable: `${label} timed out after ${COMMAND_TIMEOUT_MS / 1000}s`,
      kind: "unavailable",
    }
  }

  if (result.code === null || result.code === undefined) {
    return {
      ok: false,
      unavailable: `${label} failed with unexpected exit null`,
      kind: "unavailable",
    }
  }

  const contractKey = typeof scanner === "string" ? scanner.replace(/^commands\./, "") : "default"
  const contract = SCANNER_EXIT_CONTRACTS[contractKey] ?? SCANNER_EXIT_CONTRACTS.default
  const allowed = options.allowedExitCodes ?? contract.allowedExitCodes ?? [0, 1]

  if (typeof result.code !== "number" || result.code < 0 || !allowed.includes(result.code)) {
    return {
      ok: false,
      unavailable: `${label} failed with unexpected exit ${result.code}`,
      kind: "unavailable",
    }
  }

  const clean = (contract.clean ?? [0]).includes(result.code)
  const findings = (contract.findings ?? [1]).includes(result.code)

  return {
    ok: true,
    code: result.code,
    clean,
    findings,
  }
}

export async function fromConfiguredCommandAsync(ctx, commandLine, label, options = {}) {
  if (!ctx.projectCommands) {
    return { unavailable: `${label} is configured but project commands are disabled (--no-project-commands)`, kind: "unavailable" }
  }
  const { countingFailures = false, run = runProjectCommandAsync, allowedExitCodes, strict_exit_codes, ...rest } = options

  if (
    strict_exit_codes === false ||
    rest.strictExitCodes === false ||
    ctx?.strict_exit_codes === false ||
    ctx?.commands?.strict_exit_codes === false ||
    ctx?.thresholds?.strict_exit_codes === false
  ) {
    return { unavailable: `${label}: strict_exit_codes: false bypass is forbidden`, kind: "unavailable" }
  }

  const runner = run
  const result = await runner(commandLine, ctx.root)
  if (result.timedOut) return { unavailable: `${label} timed out after ${COMMAND_TIMEOUT_MS / 1000}s`, kind: "unavailable" }
  const stdoutLines = String(result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const lastLine = stdoutLines.length > 0 ? stdoutLines[stdoutLines.length - 1] : ""
  if (lastLine.startsWith("not_applicable:")) {
    const reason = lastLine.slice("not_applicable:".length).trim() || "not applicable"
    return { not_applicable: reason, unavailable: reason, kind: "not_applicable" }
  }
  if (lastLine.startsWith("unavailable:")) {
    const reason = lastLine.slice("unavailable:".length).trim() || "unavailable"
    return { unavailable: reason, kind: "unavailable" }
  }

  if (countingFailures) {
    if (result.code === null || result.code === undefined) {
      return { unavailable: `${label} failed with unexpected exit null`, kind: "unavailable" }
    }
    const parsed = countFailures(result.stdout + result.stderr)
    const detail = redact(`${label} (exit ${result.code})`)
    if (parsed === null) {
      if (!result.ok) return { value: 1, detail: `${detail} — no count parsed, nonzero exit` }
      return { unavailable: `${label} produced no failure count (exit 0) — the output contract is a failed/skipped count; a missing count is a gap, never a pass`, kind: "unavailable" }
    }
    return { value: parsed, detail }
  }

  const exitCheck = evaluateScannerExitContract(label, result, { allowedExitCodes, strict_exit_codes, ...rest })
  if (!exitCheck.ok) {
    return { unavailable: exitCheck.unavailable, kind: "unavailable" }
  }

  const parsed = lastNumber(result.stdout)
  const detail = redact(`${label} (exit ${result.code})`)
  if (parsed === null || !Number.isFinite(parsed)) {
    return { unavailable: `${label} produced no number (contract: last number on the last non-empty line)`, kind: "unavailable" }
  }
  return { value: parsed, detail }
}

function probe(commandLine, cwd) {
  return runProjectCommand(commandLine, cwd).ok
}

export function toolVersion(commandLine, cwd) {
  const result = runProjectCommand(commandLine, cwd)
  if (!result.ok) return null
  return result.stdout.trim().split("\n")[0]?.slice(0, 80) ?? null
}

// ---------------------------------------------------------------------------
// parsing

export function safeJson(text) {
  const objectAt = text.indexOf("{")
  const arrayAt = text.indexOf("[")
  const from = arrayAt !== -1 && (arrayAt < objectAt || objectAt === -1) ? arrayAt : objectAt
  if (from === -1) return null
  try {
    return JSON.parse(text.slice(from))
  } catch {
    return null
  }
}

// Output contract for a project-configured command: the metric is the LAST number on the
// last non-empty line. Taking the first number anywhere read "Scanned 120 files, found 3
// issues" as 120 — silently, and blocking once Phase B flips these metrics.
export function lastNumber(text) {
  const lines = String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const matches = lines[index].match(/-?\d+(?:\.\d+)?/g)
    if (matches) return Number(matches[matches.length - 1])
  }
  return null
}

// Counts failing PLUS quarantined, each independently. Folding the skipped lookup inside the
// failure loop meant "20 passed | 5 skipped" — normal output with no failures — matched
// nothing and scored 0, so a quarantined regression test only counted when something else
// was already red.
export function countFailures(text) {
  const failurePatterns = [/(\d+) failed/i, /(\d+) failures/i, /failures[:=]\s*(\d+)/i, /\bfail\s+(\d+)\b/i]
  let failing = null
  for (const pattern of failurePatterns) {
    const found = pattern.exec(text)
    if (found) {
      failing = Number(found[1])
      break
    }
  }
  const quarantinedMatch = /(\d+) (?:skipped|pending|todo)/i.exec(text)
    ?? /\b(?:skipped|pending|todo)\s+(\d+)\b/i.exec(text)
  const quarantined = quarantinedMatch ? Number(quarantinedMatch[1]) : null
  if (failing === null && quarantined === null) return null
  return (failing ?? 0) + (quarantined ?? 0)
}

// The runner is injectable so the parse semantics are testable without shelling out
// (`run` defaults to the real runner). countingFailures contract (task 4):
//   - a parsed failed/skipped count is the value, regardless of exit code
//   - exit 0 with NO count is `unavailable` — the old fallback scored it 0, a PASS, so a
//     test runner whose summary format changed silently reported zero regressions
//   - a NONZERO exit with no count is value 1 — the suite failed but printed no count
export function fromConfiguredCommand(ctx, commandLine, label, { countingFailures = false, run = runProjectCommand, allowedExitCodes, strict_exit_codes, ...rest } = {}) {
  if (!ctx.projectCommands) {
    return { unavailable: `${label} is configured but project commands are disabled (--no-project-commands)`, kind: "unavailable" }
  }

  if (
    strict_exit_codes === false ||
    rest.strictExitCodes === false ||
    ctx?.strict_exit_codes === false ||
    ctx?.commands?.strict_exit_codes === false ||
    ctx?.thresholds?.strict_exit_codes === false
  ) {
    return { unavailable: `${label}: strict_exit_codes: false bypass is forbidden`, kind: "unavailable" }
  }

  const result = run(commandLine, ctx.root)
  if (result.timedOut) return { unavailable: `${label} timed out after ${COMMAND_TIMEOUT_MS / 1000}s`, kind: "unavailable" }
  const stdoutLines = String(result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const lastLine = stdoutLines.length > 0 ? stdoutLines[stdoutLines.length - 1] : ""
  if (lastLine.startsWith("not_applicable:")) {
    const reason = lastLine.slice("not_applicable:".length).trim() || "not applicable"
    return { not_applicable: reason, unavailable: reason, kind: "not_applicable" }
  }
  if (lastLine.startsWith("unavailable:")) {
    const reason = lastLine.slice("unavailable:".length).trim() || "unavailable"
    return { unavailable: reason, kind: "unavailable" }
  }

  if (countingFailures) {
    if (result.code === null || result.code === undefined) {
      return { unavailable: `${label} failed with unexpected exit null`, kind: "unavailable" }
    }
    const parsed = countFailures(result.stdout + result.stderr)
    const detail = redact(`${label} (exit ${result.code})`)
    if (parsed === null) {
      if (!result.ok) return { value: 1, detail: `${detail} — no count parsed, nonzero exit` }
      return { unavailable: `${label} produced no failure count (exit 0) — the output contract is a failed/skipped count; a missing count is a gap, never a pass`, kind: "unavailable" }
    }
    return { value: parsed, detail }
  }

  const exitCheck = evaluateScannerExitContract(label, result, { allowedExitCodes, strict_exit_codes, ...rest })
  if (!exitCheck.ok) {
    return { unavailable: exitCheck.unavailable, kind: "unavailable" }
  }

  const parsed = lastNumber(result.stdout)
  const detail = redact(`${label} (exit ${result.code})`)
  if (parsed === null || !Number.isFinite(parsed)) {
    return { unavailable: `${label} produced no number (contract: last number on the last non-empty line)`, kind: "unavailable" }
  }
  return { value: parsed, detail }
}

// ---------------------------------------------------------------------------
// adapters

export function coverageAdapter(ctx) {
  const configured = ctx.commands.coverage_artifact
  const candidates = configured
    ? [configured]
    : [
        path.join("coverage", "coverage-summary.json"),
        path.join("coverage", "coverage-final.json"),
        path.join("coverage", ".last_run.json"),
        "coverage.json",
      ]

  for (const candidate of candidates) {
    // Confine a project-configured artifact path to the repo.
    const resolved = resolveInsideRoot(ctx.root, candidate)
    if (!resolved) {
      const reason = `coverage_artifact ${JSON.stringify(candidate)} resolves outside the repository`
      return { line: { unavailable: reason }, branch: { unavailable: reason } }
    }
    const data = readJsonIfExists(resolved)
    if (!data) continue

    if (data.total?.lines?.pct !== undefined) {
      return {
        line: { value: data.total.lines.pct, detail: candidate },
        branch: { value: data.total.branches?.pct ?? null, detail: candidate },
      }
    }
    if (data.result?.line !== undefined) {
      return {
        line: { value: data.result.line, detail: candidate },
        branch: { value: data.result.branch ?? null, detail: candidate },
      }
    }
    if (data.totals?.percent_covered !== undefined) {
      const branches = data.totals.num_branches
        ? Math.round((data.totals.covered_branches / data.totals.num_branches) * 1000) / 10
        : null
      return {
        line: { value: Math.round(data.totals.percent_covered * 10) / 10, detail: candidate },
        branch: { value: branches, detail: candidate },
      }
    }
  }

  const hint = ctx.stack.js
    ? "run the test suite with --coverage (json-summary reporter) first"
    : "run the test suite with coverage reporting first"
  const reason = `no coverage artifact found — ${hint}`
  return { line: { unavailable: reason, kind: "not_configured" }, branch: { unavailable: reason, kind: "not_configured" } }
}

export function complexityAdapter(ctx) {
  if (ctx.commands.complexity) return fromConfiguredCommand(ctx, ctx.commands.complexity, "commands.complexity")

  if (ctx.stack.python && probe("radon cc --version", ctx.root)) {
    const result = runProjectCommand("radon cc -j .", ctx.root)
    const exitCheck = evaluateScannerExitContract("radon", result)
    if (!exitCheck.ok) return { unavailable: exitCheck.unavailable, kind: "unavailable" }
    const data = safeJson(result.stdout)
    if (!data) return { unavailable: "radon output was not parseable JSON", kind: "unavailable" }
    let max = 0
    let where = null
    for (const [file, blocks] of Object.entries(data)) {
      for (const block of blocks ?? []) {
        if ((block.complexity ?? 0) > max) {
          max = block.complexity
          where = `${file}:${block.lineno}`
        }
      }
    }
    return { value: max, detail: where }
  }

  if (ctx.stack.js) {
    if (!probe("npx --no-install eslint --version", ctx.root)) {
      return { unavailable: "eslint not installed — cyclomatic complexity unmeasured", kind: "not_configured" }
    }
    const result = runProjectCommand('npx --no-install eslint . --format json --rule "{\\"complexity\\":[\\"error\\",0]}"', ctx.root)
    const exitCheck = evaluateScannerExitContract("eslint", result)
    if (!exitCheck.ok) return { unavailable: exitCheck.unavailable, kind: "unavailable" }
    const data = safeJson(result.stdout)
    if (!data) return { unavailable: "eslint produced no parseable JSON (check its config)", kind: "unavailable" }
    let max = 0
    let where = null
    for (const file of data) {
      for (const message of file.messages ?? []) {
        const found = /complexity of (\d+)/.exec(message.message ?? "")
        if (found && Number(found[1]) > max) {
          max = Number(found[1])
          where = `${path.relative(ctx.root, file.filePath)}:${message.line}`
        }
      }
    }
    return { value: max, detail: where }
  }

  return { unavailable: "no complexity tool detected for this stack", kind: "not_configured" }
}

export function moduleSizeAdapter(ctx) {
  if (ctx.commands.module_size) return fromConfiguredCommand(ctx, ctx.commands.module_size, "commands.module_size")

  // Counting lines is cheap and stack-agnostic, so this metric is never unavailable for a
  // readable source tree. Tooling (eslint max-lines, RuboCop ClassLength) would add config
  // coupling for the same number.
  const files = listFiles(ctx.root, (file) => SOURCE_FILE_PATTERN.test(file) && !isVendored(file))
  if (files.length === 0) return { unavailable: "no source files matched", kind: "not_applicable" }
  let max = 0
  let where = null
  for (const file of files) {
    const lines = readTextIfExists(file).split("\n").length
    if (lines > max) {
      max = lines
      where = path.relative(ctx.root, file)
    }
  }
  return { value: max, detail: where }
}

export function securityAdapter(ctx) {
  if (ctx.commands.security) return fromConfiguredCommand(ctx, ctx.commands.security, "commands.security")

  if (ctx.stack.ruby && probe("bundle exec brakeman --version", ctx.root)) {
    const result = runProjectCommand("bundle exec brakeman --format json --confidence-level 2", ctx.root)
    const exitCheck = evaluateScannerExitContract("brakeman", result)
    if (!exitCheck.ok) return { unavailable: exitCheck.unavailable, kind: "unavailable" }
    const data = safeJson(result.stdout)
    if (!data) return { unavailable: "brakeman output not parseable", kind: "unavailable" }
    return { value: (data.warnings ?? []).length, detail: "brakeman confidence>=medium" }
  }

  if (ctx.stack.python && probe("bandit --version", ctx.root)) {
    const result = runProjectCommand("bandit -r . -f json -q", ctx.root)
    const exitCheck = evaluateScannerExitContract("bandit", result)
    if (!exitCheck.ok) return { unavailable: exitCheck.unavailable, kind: "unavailable" }
    const data = safeJson(result.stdout)
    if (!data) return { unavailable: "bandit output not parseable", kind: "unavailable" }
    return { value: (data.results ?? []).filter((item) => item.issue_severity !== "LOW").length, detail: "bandit severity>=medium" }
  }

  if (ctx.stack.js) {
    const result = runProjectCommand("npm audit --json --audit-level=moderate", ctx.root)
    const exitCheck = evaluateScannerExitContract("npm-audit", result)
    if (!exitCheck.ok) return { unavailable: exitCheck.unavailable, kind: "unavailable" }
    const data = safeJson(result.stdout)
    if (!data?.metadata?.vulnerabilities) return { unavailable: "npm audit produced no parseable metadata", kind: "unavailable" }
    const counts = data.metadata.vulnerabilities
    return {
      value: (counts.moderate ?? 0) + (counts.high ?? 0) + (counts.critical ?? 0),
      detail: "npm audit moderate+ (dependencies only — it does not read this project's code)",
    }
  }

  return { unavailable: "no static security scanner detected for this stack", kind: "not_configured" }
}

export function boundariesAdapter(ctx) {
  if (ctx.commands.boundaries) return fromConfiguredCommand(ctx, ctx.commands.boundaries, "commands.boundaries")

  if (ctx.stack.js && findAny(ctx.root, [".dependency-cruiser.js", ".dependency-cruiser.cjs", ".dependency-cruiser.json"])) {
    const result = runProjectCommand("npx --no-install depcruise . --output-type json", ctx.root)
    const exitCheck = evaluateScannerExitContract("dependency-cruiser", result)
    if (!exitCheck.ok) return { unavailable: exitCheck.unavailable, kind: "unavailable" }
    const data = safeJson(result.stdout)
    if (!data?.summary) return { unavailable: "dependency-cruiser output not parseable", kind: "unavailable" }
    return { value: data.summary.error ?? data.summary.violations ?? 0, detail: "dependency-cruiser" }
  }

  if (ctx.stack.python && findAny(ctx.root, [".importlinter", "setup.cfg"]) && probe("lint-imports --help", ctx.root)) {
    const result = runProjectCommand("lint-imports", ctx.root)
    const exitCheck = evaluateScannerExitContract("import-linter", result)
    if (!exitCheck.ok) return { unavailable: exitCheck.unavailable, kind: "unavailable" }
    return { value: result.ok ? 0 : 1, detail: "import-linter (binary result)" }
  }

  return { unavailable: "no dependency-boundary config found (dependency-cruiser / import-linter / Packwerk)", kind: "not_configured" }
}

export function suiteAdapter(ctx, suiteName) {
  const suite = ctx.suites[suiteName] ?? {}
  if (!suite.command) {
    return { unavailable: `no ${suiteName} suite declared — set suites.${suiteName}.command in agent-os/quality-thresholds.json`, kind: "not_configured" }
  }
  return fromConfiguredCommand(ctx, suite.command, `suites.${suiteName}.command`, { countingFailures: true })
}

export function mutationAdapter(ctx) {
  if (!ctx.commands.mutation) {
    return { unavailable: "no mutation command declared — set commands.mutation in agent-os/quality-thresholds.json", kind: "not_configured" }
  }
  if (!ctx.projectCommands) {
    return { unavailable: "mutation command is configured but project commands are disabled (--no-project-commands)" }
  }
  const result = runProjectCommand(ctx.commands.mutation, ctx.root)
  const exitCheck = evaluateScannerExitContract("commands.mutation", result)
  if (!exitCheck.ok) return { unavailable: exitCheck.unavailable, kind: "unavailable" }
  const text = result.stdout + result.stderr
  const ratio =
    matchNumber(text, /mutation score[:\s]+([\d.]+)/i) ??
    matchNumber(text, /kill ratio[:\s]+([\d.]+)/i) ??
    matchNumber(text, /score[:\s]+([\d.]+)%/i)
  if (ratio === null) return { unavailable: "mutation output had no recognisable score" }
  return { value: ratio, detail: redact("commands.mutation") }
}

function matchNumber(text, pattern) {
  const found = pattern.exec(text)
  return found ? Number(found[1]) : null
}
// Guardrails v2 (spec 2026-08-31-1317-harness-guardrails-v2): the three new full-speed
// metrics are command-driven — `commands.redteam`, `commands.authz`, `commands.cooldown`
// — each `--metric` printing the LAST-line count contract. A missing command declaration
// is `unavailable` (named gap), never a default, never a zero. `redteam_quickcheck` and
// `dependency_cooldown` are operator-fixed blocking policy; `authz_controls` is observe.
export function redteamQuickcheckAdapter(ctx) {
  if (!ctx.commands.redteam) return { unavailable: "no commands.redteam declared — set it to the harness-redteam-scan --metric command", kind: "not_configured" }
  return fromConfiguredCommand(ctx, ctx.commands.redteam, "commands.redteam")
}

export function authzControlsAdapter(ctx) {
  if (!ctx.commands.authz) return { unavailable: "no commands.authz declared — set it to the harness-security-contract --metric command", kind: "not_configured" }
  return fromConfiguredCommand(ctx, ctx.commands.authz, "commands.authz")
}

export function dependencyCooldownAdapter(ctx) {
  if (!ctx.commands.cooldown) return { unavailable: "no commands.cooldown declared — set it to the harness-dependency-cooldown --metric command", kind: "not_configured" }
  return fromConfiguredCommand(ctx, ctx.commands.cooldown, "commands.cooldown")
}

export function completionGateAdapter(ctx) {
  const relative = ctx.commands.completion_payload ?? path.join("agent-os", "completion.json")
  const resolved = resolveInsideRoot(ctx.root, relative)
  if (!resolved) return { unavailable: "completion payload resolves outside the repository", kind: "unavailable" }
  if (!fs.existsSync(resolved)) {
    return { unavailable: `no completion payload at ${relative}`, kind: "unavailable" }
  }
  const result = validateCompletionFile(resolved)
  if (!result.valid) return { value: 1, detail: `completion payload rejected: ${result.errors.join(", ")}` }
  return { value: 0, detail: `completion payload accepted: ${relative}` }
}

export function memoryAvailableAdapter(ctx) {
  const endpoint = ctx.commands.memory_url ?? process.env.AI_MEMORY_URL ?? "http://127.0.0.1:49374/health"
  let parsed
  try {
    parsed = new URL(endpoint)
  } catch {
    return { unavailable: "memory health check URL is invalid", kind: "unavailable" }
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    return { unavailable: "memory health check URL is invalid", kind: "unavailable" }
  }
  const result = spawnSync("curl", ["--fail", "--silent", "--show-error", "--max-time", "2", endpoint], {
    cwd: ctx.root,
    encoding: "utf8",
    timeout: 3000,
    windowsHide: true,
  })
  if (result.status === 0) return { value: 1, detail: `memory health check: ${endpoint}` }
  const reason = result.error?.message ?? (result.stderr || `exit ${result.status}`)
  return { unavailable: `memory health check failed: ${redact(reason)}`, kind: "unavailable" }
}

export function evalRegressionsAdapter(ctx) {
  if (!ctx.commands.eval) return { unavailable: "no commands.eval declared — set it to the harness-eval-runner --regression --metric command", kind: "not_configured" }
  return fromConfiguredCommand(ctx, ctx.commands.eval, "commands.eval")
}

export function deliveryConfigAdapter(ctx) {
  if (!ctx.commands.delivery) return { unavailable: "no commands.delivery declared — set it to the harness-delivery-preflight --config-check --metric command", kind: "not_configured" }
  return fromConfiguredCommand(ctx, ctx.commands.delivery, "commands.delivery")
}

// Phase 1 anti-slop metrics are command-backed. Keep each adapter explicit so a declared
// threshold can never silently fall through to the gate's "no adapter" gap.
function commandMetricAdapter(ctx, key, label, options = {}) {
  if (!ctx.commands[key]) {
    return { unavailable: `no ${label} command declared — set commands.${key} in agent-os/quality-thresholds.json`, kind: "not_configured" }
  }
  return fromConfiguredCommand(ctx, ctx.commands[key], `commands.${key}`, { ...options, run: options.run ?? runProjectCommand })
}

export function proseTellsAdapter(ctx, options = {}) {
  return commandMetricAdapter(ctx, "prose", "prose tells", options)
}

export function narratingCommentsAdapter(ctx, options = {}) {
  return commandMetricAdapter(ctx, "comments", "narrating comments", options)
}

export function fileGrowthDeltaAdapter(ctx, options = {}) {
  return commandMetricAdapter(ctx, "file_growth", "file growth", options)
}

export function functionSizeAdapter(ctx) {
  return commandMetricAdapter(ctx, "function_size", "function size")
}

export function bypassFindingsAdapter(ctx, options = {}) {
  return commandMetricAdapter(ctx, "bypass_scan", "bypass scan", { ...options, allowedExitCodes: [0] })
}

export function skillLintAdapter(ctx, options = {}) {
  if (!ctx.commands.skill_lint) {
    return { unavailable: "no skill_lint command declared — set commands.skill_lint in agent-os/quality-thresholds.json", kind: "not_configured" }
  }
  if (!ctx.projectCommands) {
    return { unavailable: "commands.skill_lint is configured but project commands are disabled (--no-project-commands)" }
  }
  const run = options.run ?? runProjectCommand
  const result = run(ctx.commands.skill_lint, ctx.root)
  const exitCheck = evaluateScannerExitContract("commands.skill_lint", result, options)
  if (!exitCheck.ok) return { unavailable: exitCheck.unavailable, kind: "unavailable" }
  const data = safeJson(result.stdout)
  if (data && typeof data === "object") {
    if (data.status === "unavailable") {
      return { unavailable: data.reason ?? "no skills directory", kind: "not_configured" }
    }
    const errorCount = Array.isArray(data.errors) ? data.errors.length : (data.ok ? 0 : 1)
    return { value: errorCount, detail: redact(`commands.skill_lint (exit ${result.code}) — ${data.skillsChecked ?? 0} skills, ${errorCount} error(s)`) }
  }
  if (result.code === 0) {
    const parsed = lastNumber(result.stdout)
    if (parsed !== null) {
      return { value: parsed, detail: redact(`commands.skill_lint (exit ${result.code})`) }
    }
  }
  const reason = result.code !== 0
    ? `commands.skill_lint failed (exit ${result.code}) without parseable JSON`
    : "commands.skill_lint produced neither parseable JSON nor a count number"
  return { unavailable: reason }
}

export function evidenceRungMinAdapter(ctx, { reportSourceHash } = {}) {
  const window = readWindow({ root: ctx.root, runs: 1 })
  const hash = reportSourceHash ?? sourceHash(ctx.root, { fresh: true })
  const assessed = assessWindow(window, {
    report: hash ? { sourceHash: hash } : null,
    tier: "sampling",
    root: ctx.root,
  })
  if (!assessed.ok) return { unavailable: `findings window unavailable — ${assessed.errors.join(" · ")}` }
  const rungs = []
  for (const entry of window) {
    for (const finding of entry.data?.findings ?? []) {
      if (Number.isInteger(finding?.evidence_rung) && finding.evidence_rung >= 1 && finding.evidence_rung <= 5) {
        rungs.push(finding.evidence_rung)
      }
    }
  }
  if (rungs.length === 0) return { unavailable: "findings window contains no evidence_rung values" }
  return { value: Math.min(...rungs), detail: "minimum evidence_rung from hash-bound findings window" }
}


function isVendored(file) {
  return /[\\/](node_modules|dist|build|coverage|vendor|\.venv|__pycache__|\.git)[\\/]/.test(file)
}

function findAny(root, names) {
  return names.find((name) => pathExists(path.join(root, name))) ?? null
}

// ---------------------------------------------------------------------------
// adherence adapter — the agent-level rows (continual harness v1.3, ticket T07)
//
// Everything above measures the artifact; these rows measure the agent: which written
// rule was broken, whether the reviewer can cite a rule at all, and how much of the
// rulebook a program checks. The window is read through the GLOBAL harness-findings.mjs
// above — imported by module path from this same global scripts directory, never by
// shelling out — so the project-local-command trust boundary is not widened.
//
// Fail-closed shape: a window problem (no findings file, a file with no roster, a
// recorded gate_source_hash that does not match the evaluated report, malformed JSON)
// makes EVERY adherence row `unavailable` — a gap to name, never a pass, never a zero.
// A violation count printed without the recall estimate beside it (or the statement
// that it is absent) is the false-green path review F10 describes; every violation-
// derived reading carries the annotation, and a test fails if one loses it
// (invariant 20).

const ADHERENCE_METRIC_NAMES = [
  "citation_competence",
  "reviewer_recall_estimate",
  "rule_violations_enforced",
  "rule_violations_prose",
  "adherence_per_changed_lines",
  "unciteable_findings_ratio",
  "enforced_fraction",
  "rules_active",
  "rules_retired",
]

// The only enforcement values that may ever back a blocking row (invariant 19). A rule
// with any other enforcement — `prose`, or no enforcement recorded — is routed to the
// prose row, which is pinned to observe.
const ENFORCED_ENFORCEMENTS = new Set(["lint", "test", "gate_metric"])
const VALID_TIERS = new Set(["full", "sampling", "auto"])
const LEDGER_PATH = path.join("agent-os", "learned-rules.json")

// Security M4: the gate path validates learned_rules at read time and exits 2 on a
// missing or invalid knob — this adapter is the second half of the same rule. A knob the
// gate consumes may never silently fall back to a default; reaching this code with an
// invalid knob is a harness blocker, so it throws (collectReadings converts the throw to
// `unavailable` for every adherence row — a gap to name, never a default, never a zero).
function requiredKnob(knobs, key) {
  const value = knobs?.[key]
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `learned_rules.${key}: missing or invalid (got ${JSON.stringify(value)}) — the gate must exit 2 at read time, never run on defaults (security M4)`,
    )
  }
  return value
}

// invariant 20: a violation count is a floor, never a rate, until a paid-reviewer
// recall estimate exists. Every violation-derived reading carries this annotation so a
// consumer cannot print the count without the estimate — or the statement that it is
// absent (review F10).
export function recallAnnotation(recallReading) {
  if (!recallReading || recallReading.unavailable) {
    return "no recall estimate recorded — this count is a floor, not a rate"
  }
  return `recall estimate ${recallReading.value} — relative to the paid reviewer, not absolute`
}

// The test side of invariant 20: a count reading that lost its annotation must fail
// whatever asserts on it. All violation-derived rows go through the adapter, which
// always annotates; this is the check that catches a consumer stripping the detail.
export function hasRecallAnnotation(reading) {
  return Boolean(reading && typeof reading.detail === "string" && /recall estimate/.test(reading.detail))
}

// A rule qualifies for the enforced_fraction age condition when it has been approved
// for `minRuns` full runs. Rules approved in the current run (runs_since_approval 0,
// or missing stats) are excluded from BOTH sides, which is what makes retirement
// neutral: retiring a young rule cannot move the ratio (T07 §3).
function agedRule(rule, minRuns) {
  const runs = rule?.stats?.runs_since_approval
  return Number.isInteger(runs) && runs >= minRuns
}

// Route a record's pointer against the ledger, not the filesystem: the ledger rule's
// `target#anchor` is the citation contract (D19). A pointer that matches no ACTIVE
// ledger rule — orphan standards prose, a candidate, a retired rule — is prose. A
// pointer matched by several active rules with DIFFERENT enforcement is a ledger
// conflict; the citation is not provably promotion-backed, so it routes to prose —
// the conservative side of invariant 19.
function enforcementFor(ledger, pointer) {
  const cited = String(pointer ?? "").replace(/\\/g, "/")
  const matches = []
  for (const rule of ledger?.rules ?? []) {
    if (rule === null || typeof rule !== "object" || rule.status !== "active") continue
    const target = String(rule.target ?? "").replace(/\\/g, "/")
    if (`${target}#${rule.anchor}` === cited) matches.push(rule)
  }
  if (matches.length === 0) return "prose"
  const enforcements = new Set(matches.map((rule) => rule.enforcement).filter((value) => typeof value === "string"))
  if (enforcements.size > 1) return "prose"
  return matches[0].enforcement ?? "prose"
}

export function adherenceAdapter(ctx, { reportSourceHash, git } = {}) {
  const root = ctx.root
  const thresholds = ctx.thresholds ?? {}
  const knobs = thresholds.learned_rules ?? {}

  // The window is the newest `stage1_window_runs` findings files; the knob is a governed
  // knob (T02) and is validated at gate read time — a missing or invalid value here is a
  // harness blocker, never a default of 1 (security M4).
  const windowRuns = requiredKnob(knobs, "stage1_window_runs")
  const window = readWindow({ root, runs: windowRuns })

  const unavailable = (reason) => Object.fromEntries(ADHERENCE_METRIC_NAMES.map((name) => [name, { unavailable: reason }]))

  if (window.length === 0) {
    return unavailable(
      `no findings file in ${FINDINGS_DIR.replace(/\\/g, "/")} — adherence unmeasured; a gap to name, never a pass, never a zero`,
    )
  }

  // The newest file must be bound to the evaluated report BY VALUE (review B8): the
  // hash the report WILL carry is deterministic from the same tree the gate runs on.
  const reportHash = reportSourceHash ?? sourceHash(root, { git: git ?? makeGit(root), thresholds, fresh: true })
  const newest = window[0]
  const tier = typeof newest.data?.run?.tier === "string" ? newest.data.run.tier.toLowerCase() : null

  // assessWindow runs FIRST, before the tier validity check: a malformed file or a
  // missing roster must report ITS reason (review B8), not be masked by a missing tier.
  const assessed = assessWindow(window, { report: { sourceHash: reportHash }, tier, git, root })
  if (!assessed.ok) {
    return unavailable(`findings window rejected: ${assessed.errors.join(" · ")}`)
  }

  if (!tier || !VALID_TIERS.has(tier)) {
    return unavailable(
      `the newest findings file records no valid run.tier (got ${JSON.stringify(newest.data?.run?.tier)}) — without a tier the window cannot be bound and cross-tier comparison cannot be ruled out`,
    )
  }

  // Cross-tier discipline (T07 §6): counts NEVER aggregate entries of different tiers —
  // at tier `sampling` reviewers see a subset, so counts would silently mix populations.
  // Only the newest file's tier is counted; the exclusion is stated in the report.
  const sameTier = window.filter((entry) => entry?.data?.run?.tier?.toLowerCase() === tier)
  const otherTiers = window.length - sameTier.length
  const tierNote =
    otherTiers > 0
      ? `counted ${sameTier.length} file(s) at tier ${tier}; ${otherTiers} file(s) of another tier excluded — cross-tier comparison refused (T07 §6)`
      : `counted ${sameTier.length} file(s) at tier ${tier}`

  // --- the liveness probe: competence and recall (stage 1's first deliverable) ---
  //
  // The two roster entries T06 writes on a sampling run are told apart by `sample`: the
  // paid reviewer's entry carries sample: true. Records are attributed by `model` —
  // the only per-record field that distinguishes the two sets; a record matching no
  // roster entry is counted as the cheap reviewer's.
  const roster = Array.isArray(newest.data.roster) ? newest.data.roster : []
  const paidEntry = roster.find((entry) => entry && entry.sample === true)
  const cheapEntry = roster.find((entry) => entry && entry.sample === false) ?? roster[0]
  const records = Array.isArray(newest.data.findings) ? newest.data.findings : []
  const paidRecords = records.filter((record) => record?.model === paidEntry?.model)
  const cheapRecords = records.filter((record) => record?.model !== paidEntry?.model || !paidEntry)

  const rows = {}

  // FINAL-R1 (objective 7): a roster where the paid and cheap entries share ONE model would
  // compare each set against itself — the attribution filter keys on `model`, so both sets
  // would be the same records and the "measurement" would be 1.0 (or 0 with an empty cheap
  // side). That is measured nonsense, not a measured number: emit unavailable, never a value.
  // A single-entry roster with `sample: true` is the same case — the cheap fallback IS the paid
  // entry.
  const sameModelLiveness =
    paidEntry && cheapEntry && typeof paidEntry.model === "string" && paidEntry.model === cheapEntry.model

  if (!paidEntry) {
    rows.citation_competence = {
      unavailable: "no paid-reviewer sample in the newest findings file's roster (sample: true) — liveness unmeasured on this run",
      kind: "not_applicable",
    }
    rows.reviewer_recall_estimate = {
      unavailable: "no paid-reviewer sample in the newest findings file's roster (sample: true) — liveness unmeasured on this run",
      kind: "not_applicable",
    }
  } else if (sameModelLiveness) {
    rows.citation_competence = {
      unavailable:
        "the paid and cheap roster entries share one model — the compared sets would be the same records, so liveness would measure the reviewer against itself; unavailable, never a measured value",
    }
    rows.reviewer_recall_estimate = {
      unavailable:
        "the paid and cheap roster entries share one model — the compared sets would be the same records, so liveness would measure the reviewer against itself; unavailable, never a measured value",
    }
  } else {
    const competence = citationCompetence(cheapRecords, paidRecords, { root })
    const recall = recallEstimate(cheapRecords, paidRecords, { root })
    rows.citation_competence =
      competence === null
        ? { unavailable: "the paid reviewer produced no resolvable citations on this run — citation competence unmeasured" }
        : {
            value: competence,
            detail:
              "share of the paid reviewer's rule_violations the cheap reviewer also cited with a resolving pointer — relative, not absolute",
          }
    rows.reviewer_recall_estimate =
      recall === null
        ? { unavailable: "the paid reviewer produced no records on this run — recall estimate unmeasured" }
        : { value: recall, detail: "|cheap ∩ paid| / |paid| — relative to the paid reviewer, a better instrument not a perfect one" }
  }
  const recallReading = rows.reviewer_recall_estimate
  const annotation = recallAnnotation(recallReading)

  // --- violation counts, routed by enforcement against the ledger (T07 §2) ---
  const ledger = readJsonIfExists(path.join(root, LEDGER_PATH))
  const violationRecords = []
  for (const entry of sameTier) {
    for (const record of entry.data?.findings ?? []) {
      if (record?.class === "rule_violation") violationRecords.push(record)
    }
  }

  let enforced = 0
  let prose = 0
  let unresolvable = 0
  const enforcedBreakdown = new Map()
  const proseBreakdown = new Map()
  for (const record of violationRecords) {
    if (!resolveRulePointer(record.rule, { root }).ok) unresolvable += 1
    const enforcement = enforcementFor(ledger, record.rule)
    if (ENFORCED_ENFORCEMENTS.has(enforcement)) {
      enforced += 1
      enforcedBreakdown.set(enforcement, (enforcedBreakdown.get(enforcement) ?? 0) + 1)
    } else {
      prose += 1
      proseBreakdown.set(enforcement ?? "prose", (proseBreakdown.get(enforcement ?? "prose") ?? 0) + 1)
    }
  }
  const breakdownOf = (map) => [...map.entries()].map(([value, count]) => `${value} × ${count}`).join(", ") || "none"

  // The prose row is pinned to observe and the pin is structural: if the config ever
  // flips it to blocking, the adapter REFUSES the reading (unavailable never fails a
  // gate) — one word in a config must not let a machine-drafted sentence refuse a
  // commit (invariant 19, review B7).
  if (thresholds.metrics?.rule_violations_prose?.mode === "blocking") {
    rows.rule_violations_prose = {
      unavailable:
        "rule_violations_prose is pinned to observe, permanently — flipping it to blocking is refused by the adapter regardless of the config (invariant 19, review B7)",
    }
  } else {
    rows.rule_violations_prose = {
      value: prose,
      detail: `prose-routed ${proseBreakdown.size ? breakdownOf(proseBreakdown) : "none"} · ${unresolvable} unresolvable · ${tierNote} · ${annotation}`,
    }
  }
  rows.rule_violations_enforced = {
    value: enforced,
    detail: `promotion-backed ${breakdownOf(enforcedBreakdown)} · ${tierNote} · ${annotation}`,
  }

  // --- violations per changed line, grouped by capability (T07 §1) ---
  // Higher is worse (a lane that drops rules faster), so the row is a ceiling; the
  // worst capability sets the value and the detail lists every capability.
  const byCapability = new Map()
  for (const record of violationRecords) {
    const capability = typeof record.capability === "string" && record.capability ? record.capability : "unknown"
    let group = byCapability.get(capability)
    if (!group) {
      group = { violations: 0, lanes: new Map() }
      byCapability.set(capability, group)
    }
    group.violations += 1
    const lane = record.lane
    const changed = record.changed_lines_in_lane
    // One lane's changed lines count once, however many records it produced.
    if (lane !== undefined && Number.isInteger(changed) && changed > 0 && !group.lanes.has(lane)) {
      group.lanes.set(lane, changed)
    }
  }
  const perCapability = [...byCapability.entries()].map(([capability, group]) => {
    const changedTotal = [...group.lanes.values()].reduce((sum, n) => sum + n, 0)
    return {
      capability,
      violations: group.violations,
      changed: changedTotal,
      ratio: changedTotal > 0 ? group.violations / changedTotal : null,
    }
  })
  const measurableCapabilities = perCapability.filter((entry) => entry.ratio !== null)
  if (measurableCapabilities.length === 0) {
    rows.adherence_per_changed_lines = { unavailable: "no capability with measurable changed lines in the window" }
  } else {
    const worst = measurableCapabilities.reduce((a, b) => (b.ratio > a.ratio ? b : a))
    rows.adherence_per_changed_lines = {
      value: worst.ratio,
      detail: `worst ${worst.capability} ${worst.violations}/${worst.changed} · per capability: ${measurableCapabilities
        .map((entry) => `${entry.capability} ${entry.violations}/${entry.changed}`)
        .join(", ")} · ${tierNote} · ${annotation}`,
    }
  }

  // --- unciteable ratio (reviewer discipline) ---
  const unciteable = unciteableRatio(sameTier, { root })
  rows.unciteable_findings_ratio =
    unciteable === null
      ? { unavailable: "no rule-bearing records in the window — unciteable ratio unmeasured" }
      : {
          value: unciteable,
          detail: `${unresolvable} of ${violationRecords.length} citations unresolvable · ${tierNote} · ${annotation}`,
        }

  // --- enforced_fraction and its companion observation rows (T07 §3) ---
  // The age knob is a governed knob, validated at gate read time — never a default of 3
  // (security M4).
  const minRuns = requiredKnob(knobs, "enforced_fraction_min_runs")
  const fractionConfig = thresholds.metrics?.enforced_fraction
  if (fractionConfig?.ratchet && (fractionConfig.threshold === null || fractionConfig.threshold === undefined)) {
    // `threshold: null` with `direction: min` passes 0 >= null, which would seed
    // baseline = 0 and pin the ratchet bar at zero forever (review M1). Unavailable is
    // also the honest status: a ratchet with no bar reads as a green number, which is
    // the false-green path — the row stays unavailable until a threshold exists.
    rows.enforced_fraction = {
      unavailable:
        "enforced_fraction is ratcheted with threshold null — no baseline may be seeded from a null-threshold run (review M1); the row stays unavailable until a threshold exists",
    }
  } else if (!ledger) {
    rows.enforced_fraction = {
      unavailable: `no ${LEDGER_PATH.replace(/\\/g, "/")} — enforced_fraction unavailable, never 0, never 1 (T07 §3)`,
    }
  } else if (!Array.isArray(ledger.rules)) {
    rows.enforced_fraction = { unavailable: "ledger.rules is not an array — enforced_fraction unavailable (T07 §3)" }
  } else {
    // A candidate is not a rule (D7): only `status === "active"` may enter either side
    // of the fraction — candidates must not inflate the denominator or the numerator
    // (code-review W3). The age condition still applies on top.
    const aged = ledger.rules.filter((rule) => rule?.status === "active" && agedRule(rule, minRuns))
    if (aged.length === 0) {
      rows.enforced_fraction = {
        unavailable: `no active rules old enough to count (age condition: enforced_fraction_min_runs ${minRuns}) — 0/0 is unavailable, never 0 or 1 (T07 §3)`,
      }
    } else {
      // A permanently-prose rule is a first-class terminal outcome, not a backlog (D20,
      // T11 §1): it is excluded from BOTH sides of the fraction, so the ratio cannot be
      // dragged down by judgement nobody can mechanise — that exclusion is what stops
      // the metric from pressuring the unmechanisable. Any OTHER prose rule stays in
      // the denominator: an unmarked prose rule is still promotion pressure, exactly as
      // ticket T07 §3 defines it (denominator = active rules meeting the age condition).
      const counted = aged.filter((rule) => rule?.prose_permanent !== true)
      if (counted.length === 0) {
        rows.enforced_fraction = {
          unavailable: `every aged active rule is prose_permanent (${aged.length}) — nothing left to count, 0/0 is unavailable, never 0 or 1 (T07 §3, D20)`,
        }
      } else {
        const numerator = counted.filter((rule) => ENFORCED_ENFORCEMENTS.has(rule.enforcement)).length
        const excludedPermanent = aged.length - counted.length
        const activeCount = ledger.rules.filter((rule) => rule?.status === "active").length
        rows.enforced_fraction = {
          value: numerator / counted.length,
          detail: `${numerator}/${counted.length} enforced (active, age >= ${minRuns} run(s)) · ${excludedPermanent} permanently-prose rule(s) excluded from the denominator · rules_active ${activeCount} · rules_retired ${
            Array.isArray(ledger.retired) ? ledger.retired.length : 0
          }`,
        }
      }
    }
  }

  // Observation rows: a rise in enforced_fraction by deletion is visible in the same
  // table — an empty ledger is an honest zero, a MISSING ledger is unavailable. Only
  // `status === "active"` counts: a candidate is not a rule (D7) and must not inflate
  // the working-set rows (code-review W3).
  rows.rules_active = !ledger
    ? { unavailable: `no ${LEDGER_PATH.replace(/\\/g, "/")} — rules_active unmeasured` }
    : {
        value: Array.isArray(ledger.rules) ? ledger.rules.filter((rule) => rule?.status === "active").length : 0,
        detail: "observation row — active rules only; candidates are not rules (D7), a rise by deletion shows here (T07 §3)",
      }
  rows.rules_retired = !ledger
    ? { unavailable: `no ${LEDGER_PATH.replace(/\\/g, "/")} — rules_retired unmeasured` }
    : {
        value: Array.isArray(ledger.retired) ? ledger.retired.length : 0,
        detail: "observation row — the working-set shrink side (T07 §3)",
      }

  return rows
}

// The full set, so the gate does not have to know each adapter's name.
export function collectReadings(ctx, mode, wants, options = {}) {
  const readings = {}
  const shouldCollect = typeof wants === "function" ? wants : function() { return true }
  const attempt = (label, fn) => {
    try {
      // One adapter failing is that metric's `unavailable`, never the gate's exit 2.
      return fn()
    } catch (error) {
      return { unavailable: redact(`${label} threw: ${error.message}`) }
    }
  }

  if (shouldCollect("line_coverage") || shouldCollect("branch_coverage")) {
    const coverage = attempt("coverage adapter", () => coverageAdapter(ctx))
    readings.line_coverage = coverage.line ?? coverage
    readings.branch_coverage = coverage.branch ?? coverage
  }
  if (shouldCollect("cyclomatic_max")) readings.cyclomatic_max = attempt("complexity adapter", () => complexityAdapter(ctx))
  if (shouldCollect("module_lines_max")) readings.module_lines_max = attempt("module-size adapter", () => moduleSizeAdapter(ctx))
  if (shouldCollect("function_size_violations")) readings.function_size_violations = attempt("function-size adapter", () => functionSizeAdapter(ctx))
  if (shouldCollect("security_findings")) readings.security_findings = attempt("security adapter", () => securityAdapter(ctx))
  if (shouldCollect("boundary_violations")) readings.boundary_violations = attempt("boundaries adapter", () => boundariesAdapter(ctx))
  if (shouldCollect("regression_suite")) readings.regression_suite = attempt("regression adapter", () => suiteAdapter(ctx, "regression"))
  if (shouldCollect("e2e_suite")) readings.e2e_suite = attempt("e2e adapter", () => suiteAdapter(ctx, "e2e"))
  if (shouldCollect("mutation_kill_ratio")) readings.mutation_kill_ratio = attempt("mutation adapter", () => mutationAdapter(ctx))
  if (shouldCollect("redteam_quickcheck")) readings.redteam_quickcheck = attempt("redteam quickcheck adapter", () => redteamQuickcheckAdapter(ctx))
  if (shouldCollect("authz_controls")) readings.authz_controls = attempt("authz controls adapter", () => authzControlsAdapter(ctx))
  if (shouldCollect("eval_regressions")) readings.eval_regressions = attempt("eval regressions adapter", () => evalRegressionsAdapter(ctx))
  if (shouldCollect("delivery_config")) readings.delivery_config = attempt("delivery config adapter", () => deliveryConfigAdapter(ctx))
  if (shouldCollect("dependency_cooldown")) readings.dependency_cooldown = attempt("dependency cooldown adapter", () => dependencyCooldownAdapter(ctx))
  if (shouldCollect("completion_gate")) readings.completion_gate = attempt("completion gate adapter", () => completionGateAdapter(ctx))
  if (shouldCollect("memory_available")) readings.memory_available = attempt("memory availability adapter", () => memoryAvailableAdapter(ctx))
  if (shouldCollect("prose_tells")) readings.prose_tells = attempt("prose tells adapter", () => proseTellsAdapter(ctx, options))
  if (shouldCollect("narrating_comments")) readings.narrating_comments = attempt("narrating comments adapter", () => narratingCommentsAdapter(ctx, options))
  if (shouldCollect("file_growth_delta")) readings.file_growth_delta = attempt("file growth adapter", () => fileGrowthDeltaAdapter(ctx, options))
  if (shouldCollect("skill_lint")) readings.skill_lint = attempt("skill lint adapter", () => skillLintAdapter(ctx, options))
  if (shouldCollect("bypass_findings")) readings.bypass_findings = attempt("bypass scan adapter", () => bypassFindingsAdapter(ctx, options))
  if (shouldCollect("evidence_rung_min")) readings.evidence_rung_min = attempt("evidence rung adapter", () => evidenceRungMinAdapter(ctx, options))
  if (ADHERENCE_METRIC_NAMES.some((name) => shouldCollect(name))) {
    const adherence = attempt("adherence adapter", () => adherenceAdapter(ctx, options))
    if (adherence.unavailable && typeof adherence.unavailable === "string") {
      for (const name of ADHERENCE_METRIC_NAMES) if (shouldCollect(name)) readings[name] = { unavailable: adherence.unavailable }
    } else {
      for (const [name, reading] of Object.entries(adherence)) if (shouldCollect(name)) readings[name] = reading
    }
  }
  return readings
}

export async function collectReadingsAsync(ctx, mode, wants, options = {}) {
  const readings = {}
  const shouldCollect = typeof wants === "function" ? wants : function() { return true }
  const attempt = async (label, fn) => {
    try {
      return await fn()
    } catch (error) {
      return { unavailable: redact(`${label} threw: ${error.message}`) }
    }
  }

  const tasks = []

  if (shouldCollect("line_coverage") || shouldCollect("branch_coverage")) {
    tasks.push(
      attempt("coverage adapter", () => coverageAdapter(ctx)).then((coverage) => {
        readings.line_coverage = coverage.line ?? coverage
        readings.branch_coverage = coverage.branch ?? coverage
      }),
    )
  }

  if (shouldCollect("cyclomatic_max")) {
    tasks.push(
      attempt("complexity adapter", async () => {
        if (ctx.commands.complexity) return fromConfiguredCommandAsync(ctx, ctx.commands.complexity, "commands.complexity")
        return complexityAdapter(ctx)
      }).then((res) => { readings.cyclomatic_max = res }),
    )
  }

  if (shouldCollect("module_lines_max")) {
    tasks.push(
      attempt("module-size adapter", async () => {
        if (ctx.commands.module_size) return fromConfiguredCommandAsync(ctx, ctx.commands.module_size, "commands.module_size")
        return moduleSizeAdapter(ctx)
      }).then((res) => { readings.module_lines_max = res }),
    )
  }
  if (shouldCollect("function_size_violations")) {
    tasks.push(
      attempt("function-size adapter", async () => {
        if (ctx.commands.function_size) return fromConfiguredCommandAsync(ctx, ctx.commands.function_size, "commands.function_size")
        return functionSizeAdapter(ctx)
      }).then((res) => { readings.function_size_violations = res }),
    )
  }

  if (shouldCollect("security_findings")) {
    tasks.push(
      attempt("security adapter", async () => {
        if (ctx.commands.security) return fromConfiguredCommandAsync(ctx, ctx.commands.security, "commands.security")
        return securityAdapter(ctx)
      }).then((res) => { readings.security_findings = res }),
    )
  }

  if (shouldCollect("boundary_violations")) {
    tasks.push(
      attempt("boundaries adapter", async () => {
        if (ctx.commands.boundaries) return fromConfiguredCommandAsync(ctx, ctx.commands.boundaries, "commands.boundaries")
        return boundariesAdapter(ctx)
      }).then((res) => { readings.boundary_violations = res }),
    )
  }

  if (shouldCollect("regression_suite")) {
    tasks.push(
      attempt("regression adapter", async () => {
        const suite = ctx.suites["regression"] ?? {}
        if (!suite.command) {
          return { unavailable: "no regression suite declared — set suites.regression.command in agent-os/quality-thresholds.json", kind: "not_configured" }
        }
        return fromConfiguredCommandAsync(ctx, suite.command, "suites.regression.command", { countingFailures: true })
      }).then((res) => { readings.regression_suite = res }),
    )
  }

  if (shouldCollect("e2e_suite")) {
    tasks.push(
      attempt("e2e adapter", async () => {
        const suite = ctx.suites["e2e"] ?? {}
        if (!suite.command) {
          return { unavailable: "no e2e suite declared — set suites.e2e.command in agent-os/quality-thresholds.json", kind: "not_configured" }
        }
        return fromConfiguredCommandAsync(ctx, suite.command, "suites.e2e.command", { countingFailures: true })
      }).then((res) => { readings.e2e_suite = res }),
    )
  }

  if (shouldCollect("mutation_kill_ratio")) {
    tasks.push(
      attempt("mutation adapter", () => mutationAdapter(ctx)).then((res) => { readings.mutation_kill_ratio = res }),
    )
  }

  if (shouldCollect("redteam_quickcheck")) {
    tasks.push(
      attempt("redteam quickcheck adapter", async () => {
        if (!ctx.commands.redteam) return { unavailable: "no commands.redteam declared — set it to the harness-redteam-scan --metric command", kind: "not_configured" }
        return fromConfiguredCommandAsync(ctx, ctx.commands.redteam, "commands.redteam")
      }).then((res) => { readings.redteam_quickcheck = res }),
    )
  }

  if (shouldCollect("authz_controls")) {
    tasks.push(
      attempt("authz controls adapter", async () => {
        if (!ctx.commands.authz) return { unavailable: "no commands.authz declared — set it to the harness-security-contract --metric command", kind: "not_configured" }
        return fromConfiguredCommandAsync(ctx, ctx.commands.authz, "commands.authz")
      }).then((res) => { readings.authz_controls = res }),
    )
  }
  if (shouldCollect("eval_regressions")) {
    tasks.push(
      attempt("eval regressions adapter", async () => {
        if (!ctx.commands.eval) return { unavailable: "no commands.eval declared — set it to the harness-eval-runner --regression --metric command", kind: "not_configured" }
        return fromConfiguredCommandAsync(ctx, ctx.commands.eval, "commands.eval")
      }).then((res) => { readings.eval_regressions = res }),
    )
  }
  if (shouldCollect("delivery_config")) {
    tasks.push(
      attempt("delivery config adapter", async () => {
        if (!ctx.commands.delivery) return { unavailable: "no commands.delivery declared — set it to the harness-delivery-preflight --config-check --metric command", kind: "not_configured" }
        return fromConfiguredCommandAsync(ctx, ctx.commands.delivery, "commands.delivery")
      }).then((res) => { readings.delivery_config = res }),
    )
  }

  if (shouldCollect("dependency_cooldown")) {
    tasks.push(
      attempt("dependency cooldown adapter", async () => {
        if (!ctx.commands.cooldown) return { unavailable: "no commands.cooldown declared — set it to the harness-dependency-cooldown --metric command", kind: "not_configured" }
        return fromConfiguredCommandAsync(ctx, ctx.commands.cooldown, "commands.cooldown")
      }).then((res) => { readings.dependency_cooldown = res }),
    )
  }
  if (shouldCollect("completion_gate")) {
    tasks.push(
      attempt("completion gate adapter", () => completionGateAdapter(ctx)).then((res) => { readings.completion_gate = res }),
    )
  }
  if (shouldCollect("memory_available")) {
    tasks.push(
      attempt("memory availability adapter", () => memoryAvailableAdapter(ctx)).then((res) => { readings.memory_available = res }),
    )
  }

  if (shouldCollect("prose_tells")) {
    tasks.push(
      attempt("prose tells adapter", async () => {
        if (!ctx.commands.prose) return { unavailable: "no prose tells command declared — set commands.prose in agent-os/quality-thresholds.json", kind: "not_configured" }
        return fromConfiguredCommandAsync(ctx, ctx.commands.prose, "commands.prose", options)
      }).then((res) => { readings.prose_tells = res }),
    )
  }

  if (shouldCollect("narrating_comments")) {
    tasks.push(
      attempt("narrating comments adapter", async () => {
        if (!ctx.commands.comments) return { unavailable: "no narrating comments command declared — set commands.comments in agent-os/quality-thresholds.json", kind: "not_configured" }
        return fromConfiguredCommandAsync(ctx, ctx.commands.comments, "commands.comments", options)
      }).then((res) => { readings.narrating_comments = res }),
    )
  }

  if (shouldCollect("file_growth_delta")) {
    tasks.push(
      attempt("file growth adapter", async () => {
        if (!ctx.commands.file_growth) return { unavailable: "no file growth command declared — set commands.file_growth in agent-os/quality-thresholds.json", kind: "not_configured" }
        return fromConfiguredCommandAsync(ctx, ctx.commands.file_growth, "commands.file_growth", options)
      }).then((res) => { readings.file_growth_delta = res }),
    )
  }
  if (shouldCollect("skill_lint")) {
    tasks.push(
      attempt("skill lint adapter", async () => {
        if (!ctx.commands.skill_lint) return { unavailable: "no skill_lint command declared — set commands.skill_lint in agent-os/quality-thresholds.json", kind: "not_configured" }
        if (!ctx.projectCommands) return { unavailable: "commands.skill_lint is configured but project commands are disabled (--no-project-commands)" }
        const runner = options.run ?? runProjectCommandAsync
        const result = await runner(ctx.commands.skill_lint, ctx.root)
        const exitCheck = evaluateScannerExitContract("commands.skill_lint", result, options)
        if (!exitCheck.ok) return { unavailable: exitCheck.unavailable, kind: "unavailable" }
        const data = safeJson(result.stdout)
        if (data && typeof data === "object") {
          if (data.status === "unavailable") {
            return { unavailable: data.reason ?? "no skills directory", kind: "not_configured" }
          }
          const errorCount = Array.isArray(data.errors) ? data.errors.length : (data.ok ? 0 : 1)
          return { value: errorCount, detail: redact(`commands.skill_lint (exit ${result.code}) — ${data.skillsChecked ?? 0} skills, ${errorCount} error(s)`) }
        }
        if (result.code === 0) {
          const parsed = lastNumber(result.stdout)
          if (parsed !== null) return { value: parsed, detail: redact(`commands.skill_lint (exit ${result.code})`) }
        }
        const reason = result.code !== 0
          ? `commands.skill_lint failed (exit ${result.code}) without parseable JSON`
          : "commands.skill_lint produced neither parseable JSON nor a count number"
        return { unavailable: reason }
      }).then((res) => { readings.skill_lint = res }),
    )
  }
  if (shouldCollect("bypass_findings")) {
    tasks.push(
      attempt("bypass scan adapter", async () => {
        if (!ctx.commands.bypass_scan) return { unavailable: "no bypass scan command declared — set commands.bypass_scan in agent-os/quality-thresholds.json", kind: "not_configured" }
        return fromConfiguredCommandAsync(ctx, ctx.commands.bypass_scan, "commands.bypass_scan", { ...options, allowedExitCodes: [0] })
      }).then((res) => { readings.bypass_findings = res }),
    )
  }


  if (shouldCollect("evidence_rung_min")) {
    tasks.push(
      attempt("evidence rung adapter", () => evidenceRungMinAdapter(ctx, options)).then((res) => { readings.evidence_rung_min = res }),
    )
  }

  if (ADHERENCE_METRIC_NAMES.some((name) => shouldCollect(name))) {
    tasks.push(
      attempt("adherence adapter", () => adherenceAdapter(ctx, options)).then((adherence) => {
        if (adherence.unavailable && typeof adherence.unavailable === "string") {
          for (const name of ADHERENCE_METRIC_NAMES) if (shouldCollect(name)) readings[name] = { unavailable: adherence.unavailable }
        } else {
          for (const [name, reading] of Object.entries(adherence)) if (shouldCollect(name)) readings[name] = reading
        }
      }),
    )
  }

  await Promise.all(tasks)
  return readings
}
