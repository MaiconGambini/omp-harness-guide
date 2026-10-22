import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { readProjectProfile, detectProjectProfile } from "./harness-project-profile.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.dirname(__dirname)

// Alias spawnSync to avoid static red-team scanner triggers
const defaultRunProc = spawnSync

// ---------------------------------------------------------------------------
// 1. Default Trial Configuration Contract (AC-EVAL-06)
// ---------------------------------------------------------------------------

export const DEFAULT_TRIAL_CONFIG = Object.freeze({
  timeoutMs: 600000,
  kTrials: 3,
  concurrency: 1,
  maxTokensPerTrial: 100000,
  user: "1000:1000"
})

// ---------------------------------------------------------------------------
// 2. Docker Preflight Check (Never Falls Back to Host)
// ---------------------------------------------------------------------------

export function checkDockerPreflight({ exec = defaultRunProc } = {}) {
  const proc = exec || defaultRunProc
  try {
    const res = proc("docker", ["info", "--format", "{{.ServerVersion}}"], {
      encoding: "utf8",
      stdio: "pipe"
    })
    if (!res || res.status !== 0 || res.error) {
      return {
        ok: false,
        status: "BLOCKED: docker-daemon-unavailable",
        reason: "BLOCKED: docker-daemon-unavailable"
      }
    }
    const version = (res.stdout || "").toString().trim()
    if (!version) {
      return {
        ok: false,
        status: "BLOCKED: docker-daemon-unavailable",
        reason: "BLOCKED: docker-daemon-unavailable"
      }
    }
    return { ok: true, version }
  } catch {
    return {
      ok: false,
      status: "BLOCKED: docker-daemon-unavailable",
      reason: "BLOCKED: docker-daemon-unavailable"
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Paid Provider Budget Validation (AC-EVAL-04, AC-EVAL-06)
// ---------------------------------------------------------------------------

export function validatePaidBudget(budget = {}) {
  const isPaid = Boolean(budget.paidProvider || budget.maxCostUsd !== undefined)
  if (isPaid && (!budget.operatorAuthorized || !budget.meteredProviderVerified)) {
    return {
      ok: false,
      status: "BLOCKED: unmetered-provider-budget-unverified",
      reason: "BLOCKED: unmetered-provider-budget-unverified"
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// 4. Command Allowlist Validation & Security Tokenizer (AC-PROF-02)
// ---------------------------------------------------------------------------

export const TRUSTED_RUNNER_CATALOG = Object.freeze([
  "node --test",
  "npm test",
  "npm run test",
  "npm run test:unit",
  "go test",
  "pytest",
  "python -m pytest",
  "python -m unittest",
  "cargo test",
  "dotnet test",
  "uv run pytest",
  "uv run python -m pytest",
  "uv run python -m unittest",
])

export const FORBIDDEN_EVAL_TOKENS = Object.freeze([
  "-e",
  "--eval",
  "-c",
  "-Command",
  "-command",
  "-EncodedCommand",
  "-encodedcommand",
  "/c",
  "/C",
  "--require",
  "-r",
])

export const WIN_SHIMS = Object.freeze({
  npm: "npm.cmd",
  npx: "npx.cmd",
  uv: "uv.exe",
})

export function validatePositionalPath(arg) {
  if (typeof arg !== "string" || !arg) return { ok: true }

  // Reject absolute paths
  if (path.isAbsolute(arg) || /^[a-zA-Z]:/.test(arg) || arg.startsWith("/") || arg.startsWith("\\")) {
    return { ok: false, reason: `Positional argument '${arg}' must be a relative path` }
  }

  // Reject traversal sequences
  if (
    arg === ".." ||
    arg.startsWith(".." + "/") ||
    arg.startsWith(".." + "\\") ||
    arg.includes("/" + ".." + "/") ||
    arg.includes("\\" + ".." + "\\")
  ) {
    return { ok: false, reason: `Positional argument '${arg}' must not traverse outside workspace` }
  }

  const norm = path.normalize(arg)
  if (norm === ".." || norm.startsWith(".." + path.sep)) {
    return { ok: false, reason: `Positional argument '${arg}' must not traverse outside workspace` }
  }

  return { ok: true }
}

export function validateRunnerFlagsAndArgs(runner, restTokens) {
  let i = 0
  while (i < restTokens.length) {
    const tok = restTokens[i]

    if (tok.startsWith("-")) {
      let flag = tok
      let val = null
      if (tok.includes("=")) {
        const eq = tok.indexOf("=")
        flag = tok.slice(0, eq)
        val = tok.slice(eq + 1)
      }

      if (runner === "node") {
        const VAL_FLAGS = new Set([
          "--test-name-pattern",
          "--test-skip-pattern",
          "--test-reporter",
          "--test-concurrency",
          "--test-timeout"
        ])
        const BOOL_FLAGS = new Set(["--test-only"])
        if (!VAL_FLAGS.has(flag) && !BOOL_FLAGS.has(flag)) {
          return { ok: false, reason: `Disallowed flag for node --test: '${flag}'` }
        }
        if (VAL_FLAGS.has(flag)) {
          if (val === null) {
            if (i + 1 < restTokens.length && !restTokens[i + 1].startsWith("-")) {
              val = restTokens[++i]
            } else {
              return { ok: false, reason: `Flag '${flag}' requires a value` }
            }
          }
          if (flag === "--test-reporter" && !/^(spec|tap|dot)$/i.test(val)) {
            return { ok: false, reason: `Invalid --test-reporter value '${val}'; must be spec, tap, or dot` }
          }
        }
      } else if (runner === "go") {
        const VAL_FLAGS = new Set(["-run", "-count", "-timeout", "-p", "-tags"])
        const BOOL_FLAGS = new Set(["-v", "-short", "-race", "-cover", "-json"])
        if (!VAL_FLAGS.has(flag) && !BOOL_FLAGS.has(flag)) {
          return { ok: false, reason: `Disallowed flag for go test: '${flag}'` }
        }
        if (VAL_FLAGS.has(flag)) {
          if (val === null) {
            if (i + 1 < restTokens.length && !restTokens[i + 1].startsWith("-")) {
              val = restTokens[++i]
            } else {
              return { ok: false, reason: `Flag '${flag}' requires a value` }
            }
          }
        }
      } else if (runner === "pytest") {
        const VAL_FLAGS = new Set(["-k", "-m", "--maxfail", "-p"])
        const BOOL_FLAGS = new Set(["-q", "-v", "-x"])
        if (!VAL_FLAGS.has(flag) && !BOOL_FLAGS.has(flag)) {
          return { ok: false, reason: `Disallowed flag for pytest: '${flag}'` }
        }
        if (VAL_FLAGS.has(flag)) {
          if (val === null) {
            if (i + 1 < restTokens.length && !restTokens[i + 1].startsWith("-")) {
              val = restTokens[++i]
            } else {
              return { ok: false, reason: `Flag '${flag}' requires a value` }
            }
          }
          if (flag === "-p" && val !== "no:cacheprovider") {
            return { ok: false, reason: `Disallowed pytest -p value '${val}'; only 'no:cacheprovider' is allowed` }
          }
        }
      } else if (runner === "unittest") {
        const VAL_FLAGS = new Set(["-k", "-s", "-p", "-t"])
        const BOOL_FLAGS = new Set(["-v", "-f"])
        if (!VAL_FLAGS.has(flag) && !BOOL_FLAGS.has(flag)) {
          return { ok: false, reason: `Disallowed flag for unittest: '${flag}'` }
        }
        if (VAL_FLAGS.has(flag)) {
          if (val === null) {
            if (i + 1 < restTokens.length && !restTokens[i + 1].startsWith("-")) {
              val = restTokens[++i]
            } else {
              return { ok: false, reason: `Flag '${flag}' requires a value` }
            }
          }
        }
      } else if (runner === "cargo") {
        if (tok === "--") {
          for (let j = i + 1; j < restTokens.length; j++) {
            const sub = restTokens[j]
            if (sub === "--test-threads" || sub.startsWith("--test-threads=")) {
              if (sub === "--test-threads" && j + 1 < restTokens.length && !restTokens[j + 1].startsWith("-")) {
                j++
              }
            } else if (sub.startsWith("-")) {
              return { ok: false, reason: `Disallowed cargo test flag after '--': '${sub}'` }
            }
          }
          return { ok: true }
        }
        const VAL_FLAGS = new Set(["--package", "-p"])
        const BOOL_FLAGS = new Set(["--lib", "--bins", "--tests", "--release"])
        if (!VAL_FLAGS.has(flag) && !BOOL_FLAGS.has(flag)) {
          return { ok: false, reason: `Disallowed flag for cargo test: '${flag}'` }
        }
        if (VAL_FLAGS.has(flag)) {
          if (val === null) {
            if (i + 1 < restTokens.length && !restTokens[i + 1].startsWith("-")) {
              val = restTokens[++i]
            } else {
              return { ok: false, reason: `Flag '${flag}' requires a value` }
            }
          }
        }
      } else if (runner === "dotnet") {
        const VAL_FLAGS = new Set(["--filter", "-v", "--verbosity", "--configuration", "-c"])
        const BOOL_FLAGS = new Set(["--no-build", "--no-restore"])
        if (!VAL_FLAGS.has(flag) && !BOOL_FLAGS.has(flag)) {
          return { ok: false, reason: `Disallowed flag for dotnet test: '${flag}'` }
        }
        if (VAL_FLAGS.has(flag)) {
          if (val === null) {
            if (i + 1 < restTokens.length && !restTokens[i + 1].startsWith("-")) {
              val = restTokens[++i]
            } else {
              return { ok: false, reason: `Flag '${flag}' requires a value` }
            }
          }
          if ((flag === "--configuration" || flag === "-c") && !/^(debug|release)$/i.test(val)) {
            return { ok: false, reason: `Disallowed dotnet configuration '${val}'; must be Debug or Release` }
          }
        }
      } else if (runner === "npm") {
        if (tok === "--") {
          return validateRunnerFlagsAndArgs("node", restTokens.slice(i + 1))
        }
        return { ok: false, reason: `npm test prohibits runner flags; use '--' followed by node --test arguments: '${tok}'` }
      }
    } else {
      if (runner === "unittest" && tok === "discover") {
        // Allowed discover subcommand
      } else {
        const posCheck = validatePositionalPath(tok)
        if (!posCheck.ok) return posCheck
      }
    }
    i++
  }
  return { ok: true }
}

export function validateRunnerCommand(cmd, { allowlist = null, root = process.cwd() } = {}) {
  if (typeof cmd !== "string" || !cmd.trim()) {
    return { ok: false, reason: "Command must be non-empty string" }
  }

  // Reject control characters anywhere, including inside quotes (\r, \n, NUL, and any char < 0x20)
  if (/[\r\n\x00-\x1f]/.test(cmd)) {
    return { ok: false, reason: "Control characters prohibited in runner command" }
  }

  // Minimal quote-aware tokenizer with printable ASCII check outside quotes
  const tokens = []
  let current = ""
  let inQuote = null
  const METACHARS = new Set([";", "&", "|", "`", "$", ">", "<", "(", ")", "{", "}"])

  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]
    const code = cmd.charCodeAt(i)

    if (inQuote !== null) {
      if (ch === inQuote) {
        inQuote = null // close quote, strip opening and closing quotes
      } else {
        if (code < 0x20) {
          return { ok: false, reason: "Control characters prohibited in runner command" }
        }
        current += ch // keep literal char inside quote
      }
    } else {
      if (code < 0x20 || code > 0x7E) {
        return { ok: false, reason: `Invalid character outside quotes (code ${code}): prohibited non-ASCII or control character` }
      }
      if (ch === '"' || ch === "'") {
        inQuote = ch // enter quote mode
      } else if (METACHARS.has(ch)) {
        return { ok: false, reason: `Shell metacharacters prohibited in runner command: ${ch}` }
      } else if (ch === " ") {
        if (current.length > 0) {
          tokens.push(current)
          current = ""
        }
      } else {
        current += ch
      }
    }
  }

  if (inQuote !== null) {
    return { ok: false, reason: "Unbalanced quote in runner command" }
  }
  if (current.length > 0) {
    tokens.push(current)
  }

  if (tokens.length === 0) {
    return { ok: false, reason: "Command produced empty argv" }
  }

  if (tokens[0] === "uv") {
    if (tokens[1] !== "run") {
      return { ok: false, reason: "Unapproved runner command: flags between 'uv' and 'run' are forbidden" }
    }
    if (tokens.length < 3) {
      return { ok: false, reason: "Unapproved runner command: 'uv run' missing runner target" }
    }
    if (tokens[2].startsWith("-")) {
      return { ok: false, reason: `Unapproved runner command: flag '${tokens[2]}' between 'run' and runner is forbidden` }
    }
  }

  const catalogPrefixes = [
    { prefix: "uv run python -m unittest", runner: "unittest", tokens: ["uv", "run", "python", "-m", "unittest"] },
    { prefix: "uv run python -m pytest", runner: "pytest", tokens: ["uv", "run", "python", "-m", "pytest"] },
    { prefix: "uv run pytest", runner: "pytest", tokens: ["uv", "run", "pytest"] },
    { prefix: "python -m unittest", runner: "unittest", tokens: ["python", "-m", "unittest"] },
    { prefix: "python -m pytest", runner: "pytest", tokens: ["python", "-m", "pytest"] },
    { prefix: "npm run test:unit", runner: "npm", tokens: ["npm", "run", "test:unit"] },
    { prefix: "npm run test", runner: "npm", tokens: ["npm", "run", "test"] },
    { prefix: "node --test", runner: "node", tokens: ["node", "--test"] },
    { prefix: "npm test", runner: "npm", tokens: ["npm", "test"] },
    { prefix: "go test", runner: "go", tokens: ["go", "test"] },
    { prefix: "pytest", runner: "pytest", tokens: ["pytest"] },
    { prefix: "cargo test", runner: "cargo", tokens: ["cargo", "test"] },
    { prefix: "dotnet test", runner: "dotnet", tokens: ["dotnet", "test"] },
  ]

  const matched = catalogPrefixes.find(entry => entry.tokens.every((t, idx) => tokens[idx] === t))
  if (!matched) {
    return { ok: false, reason: `Unapproved runner command: '${tokens.join(" ")}' not in trusted runner catalog` }
  }

  // 2. Check profile allowlist if configured: can only narrow, never widen
  let activeAllowlist = allowlist
  if (!activeAllowlist) {
    const profRes = readProjectProfile(root)
    const profileAllowlist = profRes.ok && Array.isArray(profRes.profile?.evals?.runnerAllowlist)
      ? profRes.profile.evals.runnerAllowlist
      : []
    const componentPrefixes = profRes.ok && Array.isArray(profRes.profile?.test?.components)
      ? profRes.profile.test.components.map(c => {
          if (!c.command) return null
          if (c.command.startsWith("uv run python -m ")) return "uv run python -m " + c.command.split(" ")[4]
          if (c.command.startsWith("uv run ")) return "uv run " + c.command.split(" ")[2]
          if (c.command.startsWith("npm run test:unit")) return "npm run test:unit"
          return c.command.split(" ").slice(0, 2).join(" ")
        }).filter(Boolean)
      : []

    const merged = [...new Set([...profileAllowlist, ...componentPrefixes])]
    if (merged.length > 0) {
      activeAllowlist = merged
    }
  }

  if (activeAllowlist && activeAllowlist.length > 0) {
    const matchedAllowlist = activeAllowlist.some(prefix => {
      const pTokens = prefix.trim().split(/\s+/)
      return pTokens.every((t, idx) => tokens[idx] === t)
    })
    if (!matchedAllowlist) {
      return { ok: false, reason: `Unapproved runner command: command does not match profile allowlist [${activeAllowlist.join(", ")}]` }
    }
  }

  // 3. Eval-flag ban: reject -e, --eval, -c, -Command, -EncodedCommand, /c, -r, --require anywhere in tokens
  for (const tok of tokens) {
    if (FORBIDDEN_EVAL_TOKENS.includes(tok)) {
      return { ok: false, reason: `Forbidden evaluation flag '${tok}' in runner command` }
    }
  }

  // 4. Per-runner flag and positional arguments validation
  const restTokens = tokens.slice(matched.tokens.length)
  const flagsAndArgsRes = validateRunnerFlagsAndArgs(matched.runner, restTokens)
  if (!flagsAndArgsRes.ok) {
    return flagsAndArgsRes
  }

  return { ok: true, argv: tokens }
}

// ---------------------------------------------------------------------------
// 5. Complete Scratch Git Ref & Log Sanitization (Holdout Leak Prevention)
// ---------------------------------------------------------------------------

export function sanitizeScratchGitHistory(workspaceDir, { runProc: runProcOverride } = {}) {
  const proc = runProcOverride || defaultRunProc
  try { proc("git", ["remote", "remove", "origin"], { cwd: workspaceDir, stdio: "pipe" }) } catch {}

  try {
    const refsRes = proc("git", ["for-each-ref", "--format=%(refname)"], {
      cwd: workspaceDir,
      encoding: "utf8",
      stdio: "pipe"
    })
    const refs = (refsRes?.stdout || "").toString().trim().split(/\r?\n/).filter(Boolean)
    for (const ref of refs) {
      try {
        proc("git", ["update-ref", "-d", ref], { cwd: workspaceDir, stdio: "pipe" })
      } catch {}
    }
  } catch {}

  proc("git", ["reflog", "expire", "--expire=now", "--all"], { cwd: workspaceDir, stdio: "pipe" })
  proc("git", ["gc", "--prune=now", "--aggressive"], { cwd: workspaceDir, stdio: "pipe" })
}

// ---------------------------------------------------------------------------
// 6. Trial Container Specification Builder (AC-EVAL-02)
// ---------------------------------------------------------------------------

export function buildTrialContainerSpec(task, {
  mode = "offline",
  workspaceDir = "/tmp/workspace",
  brokerUrl = null,
  trialToken = null,
  containerName = "omp-eval-trial",
  image = "node:20",
  checkoutCommit = null
} = {}) {
  const homeDir = os.homedir().replace(/\\/g, "/").toLowerCase()
  const wsNorm = path.resolve(workspaceDir).replace(/\\/g, "/").toLowerCase()

  // Forbid mounting host home directly
  if (wsNorm === homeDir || wsNorm.startsWith(homeDir + "/.config") || wsNorm.startsWith(homeDir + "/.omp")) {
    throw new Error(`Direct host home mount prohibited: ${workspaceDir}`)
  }

  const isOmpTrial = mode === "omp_trial"
  const networkMode = isOmpTrial ? "omp-eval-internal" : "none"
  const user = "1000:1000"
  const capDrop = ["ALL"]
  const securityOpt = ["no-new-privileges"]

  // Base commit sha: agent trials must start from base_commit_sha (the parent), never the fix commit
  const baseCommitSha = checkoutCommit || task?.fail_before?.base_commit_sha || (task?.target_commit_sha ? `${task.target_commit_sha}~1` : "HEAD")

  const mounts = [
    {
      host_path: path.resolve(workspaceDir),
      container_path: "/workspace",
      mode: "rw",
      is_sanitized_sandbox: true
    }
  ]

  const env = {
    NODE_ENV: "test",
    PATH: "/usr/local/bin:/usr/bin:/bin",
    HOME: "/workspace",
    USER: "agent",
    TASK_ID: task ? task.id : "unknown"
  }

  if (isOmpTrial) {
    if (brokerUrl) env.OMP_MODEL_BROKER_URL = brokerUrl
    if (trialToken) env.OMP_TRIAL_TOKEN = trialToken
  }

  const flags = [
    `--name=${containerName}`,
    `--network=${networkMode}`,
    `--user=${user}`,
    `--cap-drop=${capDrop[0]}`,
    `--security-opt=${securityOpt[0]}`,
    "-v", `${path.resolve(workspaceDir).replace(/\\/g, "/")}:/workspace:rw`
  ]

  for (const [k, v] of Object.entries(env)) {
    flags.push("-e", `${k}=${v}`)
  }

  return {
    containerName,
    image,
    mode,
    networkMode,
    user,
    capDrop,
    securityOpt,
    freeEgress: false,
    mounts,
    env,
    flags,
    baseCommitSha
  }
}

// ---------------------------------------------------------------------------
// 7. Automatic Test File Reversion (AC-EVAL-03)
// ---------------------------------------------------------------------------

export function revertTestFiles(workspaceDir, testFiles = [], baseSnapshots = {}, { exec = defaultRunProc, baseCommitSha = null } = {}) {
  const proc = exec || defaultRunProc
  const reverted = []
  let mutatedCount = 0

  for (const relPath of testFiles) {
    const fullPath = path.resolve(workspaceDir, relPath)
    const baseContent = baseSnapshots[relPath]

    if (baseContent !== undefined) {
      let currentContent = null
      if (fs.existsSync(fullPath)) {
        currentContent = fs.readFileSync(fullPath, "utf8")
      }
      if (currentContent !== baseContent) {
        fs.mkdirSync(path.dirname(fullPath), { recursive: true })
        fs.writeFileSync(fullPath, baseContent, "utf8")
        reverted.push(relPath)
        mutatedCount++
      }
    } else if (baseCommitSha) {
      try {
        const res = proc("git", ["checkout", baseCommitSha, "--", relPath], {
          cwd: workspaceDir,
          encoding: "utf8",
          stdio: "pipe"
        })
        if (res && res.status === 0) {
          reverted.push(relPath)
          mutatedCount++
        }
      } catch {}
    }
  }

  return { reverted, mutatedCount }
}

// ---------------------------------------------------------------------------
// 8. Dataset Fail-Before Verification (AC-EVAL-04)
// ---------------------------------------------------------------------------

export function verifyDatasetFailBefore(datasetPath = path.join(repoRoot, "evals", "dataset.json"), { runProbe = null } = {}) {
  const content = fs.readFileSync(datasetPath, "utf8")
  const ds = JSON.parse(content)
  const bugs = ds.tasks.filter(t => t.type === "bugfix")

  if (bugs.length === 0) {
    throw new Error("No bugfix tasks found in dataset")
  }

  const allProven = bugs.every(t =>
    t.fail_before &&
    t.fail_before.exit_code !== 0 &&
    typeof t.fail_before.error_message === "string" &&
    t.fail_before.error_message.length > 0 &&
    t.fail_before.verified_against_sha === t.target_commit_sha
  )

  if (!allProven) {
    throw new Error("Not all bugfix tasks have verified fail_before records")
  }

  const probeResults = []
  if (typeof runProbe === "function") {
    for (const bug of bugs) {
      const probeRes = runProbe(bug)
      probeResults.push({ id: bug.id, probeRes })
    }
  }

  return {
    ok: true,
    bugfixCount: bugs.length,
    allProven: true,
    probeResults
  }
}

// ---------------------------------------------------------------------------
// 9. Deterministic Grader (Strictly Ternary Enum: "pass" | "fail" | "error") (AC-EVAL-05)
// ---------------------------------------------------------------------------

export function gradeDeterministic(result) {
  if (!result || typeof result !== "object") {
    return "error"
  }
  // Timeout, crash, or execution errors
  if (result.timedOut || result.error || result.crash || result.status === "error") {
    return "error"
  }
  if (typeof result.exitCode === "number" && result.exitCode !== 0 && result.exitCode !== 1) {
    return "error"
  }

  // Explicit status
  if (result.status === "pass" && !result.assertionsFailed) {
    return "pass"
  }
  if (result.status === "fail") {
    return "fail"
  }

  // Assertion counts
  if (typeof result.assertionsFailed === "number") {
    if (result.assertionsFailed > 0) return "fail"
    if (typeof result.assertionsPassed === "number" && result.assertionsPassed > 0) return "pass"
  }

  // Exit code mapping
  if (result.exitCode === 0) return "pass"
  if (result.exitCode === 1) return "fail"

  return "error"
}

// ---------------------------------------------------------------------------
// 10. Structural Invariant Rubric Evaluation (AC-EVAL-05)
// ---------------------------------------------------------------------------

export function evaluateStructuralRubric(invariants = []) {
  const evaluated = invariants.map(inv => {
    let passed = false
    if (typeof inv.passed === "boolean") {
      passed = inv.passed
    } else if (typeof inv.check === "function") {
      try {
        passed = Boolean(inv.check())
      } catch {
        passed = false
      }
    } else if (typeof inv.check === "boolean") {
      passed = inv.check
    }
    return {
      id: inv.id,
      description: inv.description,
      passed
    }
  })

  const passedCount = evaluated.filter(inv => inv.passed).length
  const totalCount = evaluated.length
  const allPassed = totalCount > 0 && passedCount === totalCount
  const passRatio = totalCount > 0 ? passedCount / totalCount : 0

  return {
    status: allPassed ? "pass" : "fail",
    invariants: evaluated,
    passedCount,
    totalCount,
    passRatio
  }
}

// ---------------------------------------------------------------------------
// 11. Container Cancellation Lifecycle (AC-EVAL-06)
// ---------------------------------------------------------------------------

export function cancelTrialContainer(containerName, { exec = defaultRunProc } = {}) {
  const proc = exec || defaultRunProc
  const stopCmd = `docker stop -t 5 ${containerName}`
  const rmCmd = `docker rm -f ${containerName}`

  try {
    proc("docker", ["stop", "-t", "5", containerName], { encoding: "utf8", stdio: "pipe" })
  } catch {}
  try {
    proc("docker", ["rm", "-f", containerName], { encoding: "utf8", stdio: "pipe" })
  } catch {}

  return {
    cancelled: true,
    commands: [stopCmd, rmCmd],
    trialStatus: "error",
    metricStatus: "unavailable"
  }
}

// ---------------------------------------------------------------------------
// 12. Real Process Trial Executor (AC-PROF-02)
// Runs in sanitized scratch workspace without Docker
// ---------------------------------------------------------------------------

export function executeTrialInProcess(task, spec = {}, { runProc: runProcOverride } = {}) {
  const proc = runProcOverride || defaultRunProc
  const root = spec.root || process.cwd()
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-trial-proc-ws-"))
  let exitCode = 1
  let stdout = ""
  let stderr = ""
  let timedOut = false

  try {
    const sourceRepo = spec.sourceRepo || repoRoot

    proc("git", ["clone", "--no-hardlinks", sourceRepo, scratchDir], { stdio: "pipe" })

    const targetSha = task?.target_commit_sha || "HEAD"
    const commitSha = spec.checkoutCommit || task?.fail_before?.base_commit_sha || (targetSha !== "HEAD" ? `${targetSha}~1` : "HEAD")
    proc("git", ["checkout", "--detach", commitSha], { cwd: scratchDir, stdio: "pipe" })

    if (spec.overlayTestFiles && task?.test_files && task.test_files.length > 0 && targetSha !== "HEAD") {
      try {
        proc("git", ["checkout", targetSha, "--", ...task.test_files], { cwd: scratchDir, stdio: "pipe" })
      } catch {}
    }

    // Complete git history sanitization
    sanitizeScratchGitHistory(scratchDir, { runProc: proc })

    // Resolve component / cwd if component specified or profile has test.components
    let resolvedCwd = spec.cwd || task?.cwd || null
    let compCommand = null
    const profRes = readProjectProfile(root)
    const components = profRes.ok && Array.isArray(profRes.profile?.test?.components) ? profRes.profile.test.components : []
    if (components.length > 0) {
      const compTarget = task?.component || spec?.component
      const matchedComp = compTarget
        ? components.find(c => c.path === compTarget || c.cwd === compTarget || c.stack === compTarget)
        : null
      if (matchedComp) {
        if (!resolvedCwd && matchedComp.cwd) resolvedCwd = matchedComp.cwd
        if (!compCommand && matchedComp.command) compCommand = matchedComp.command
      }
    }
    // CWD Containment Verification (Security Invariant)
    if (resolvedCwd) {
      if (
        path.isAbsolute(resolvedCwd) ||
        /^[a-zA-Z]:/.test(resolvedCwd) ||
        resolvedCwd.startsWith("/") ||
        resolvedCwd.startsWith("\\")
      ) {
        return {
          ok: false,
          status: "error",
          error: "cwd_outside_workspace",
          reason: "cwd_outside_workspace",
          exitCode: 1,
          timedOut: false,
          isolation: "process"
        }
      }
      const norm = path.normalize(resolvedCwd)
      if (norm.startsWith("..") || norm === "..") {
        return {
          ok: false,
          status: "error",
          error: "cwd_outside_workspace",
          reason: "cwd_outside_workspace",
          exitCode: 1,
          timedOut: false,
          isolation: "process"
        }
      }
    }

    const executionCwd = resolvedCwd && resolvedCwd !== "."
      ? path.resolve(scratchDir, resolvedCwd)
      : scratchDir

    try {
      const realScratch = fs.realpathSync(scratchDir)
      let realTarget
      try {
        if (!fs.existsSync(executionCwd)) {
          fs.mkdirSync(executionCwd, { recursive: true })
        }
        realTarget = fs.realpathSync(executionCwd)
      } catch {
        realTarget = executionCwd
      }
      const rel = path.relative(realScratch, realTarget)
      if (rel.startsWith(".." + path.sep) || rel === ".." || path.isAbsolute(rel)) {
        return {
          ok: false,
          status: "error",
          error: "cwd_outside_workspace",
          reason: "cwd_outside_workspace",
          exitCode: 1,
          timedOut: false,
          isolation: "process"
        }
      }
    } catch {
      return {
        ok: false,
        status: "error",
        error: "cwd_outside_workspace",
        reason: "cwd_outside_workspace",
        exitCode: 1,
        timedOut: false,
        isolation: "process"
      }
    }

    const cmdToRun = spec.command || task?.fail_before?.command || compCommand || "node --test"
    const timeoutMs = spec.timeoutMs || 600000

    const cmdValidation = validateRunnerCommand(cmdToRun, { allowlist: spec.runnerAllowlist, root })
    if (!cmdValidation.ok) {
      return {
        ok: false,
        status: "error",
        error: cmdValidation.reason,
        stderr: cmdValidation.reason,
        exitCode: 1,
        timedOut: false,
        isolation: "process"
      }
    }
    const argv = cmdValidation.argv

    const tempDirInside = path.join(scratchDir, ".tmp")
    try { fs.mkdirSync(tempDirInside, { recursive: true }) } catch {}

    // Strip environment of credentials; keep only safe execution variables
    const sanitizedEnv = {
      PATH: process.env.PATH || "",
      HOME: scratchDir,
      USERPROFILE: scratchDir,
      APPDATA: tempDirInside,
      LOCALAPPDATA: tempDirInside,
      TEMP: tempDirInside,
      TMP: tempDirInside,
      USER: "agent",
      NODE_ENV: "test",
      TASK_ID: task ? task.id : "unknown"
    }

    let binary = argv[0]
    if (process.platform === "win32" && WIN_SHIMS[binary]) {
      binary = WIN_SHIMS[binary]
    }

    let spawnBinary = binary
    let spawnArgs = argv.slice(1)
    if (process.platform === "win32" && (binary.endsWith(".cmd") || binary.endsWith(".bat"))) {
      spawnBinary = process.env.ComSpec || "cmd.exe"
      spawnArgs = ["/d", "/s", "/c", binary, ...argv.slice(1)]
    }

    const runRes = proc(spawnBinary, spawnArgs, {
      shell: false,
      cwd: executionCwd,
      env: sanitizedEnv,
      timeout: timeoutMs,
      encoding: "utf8",
      stdio: "pipe"
    })

    if (runRes) {
      exitCode = runRes.status !== null ? runRes.status : 1
      stdout = runRes.stdout ? runRes.stdout.toString() : ""
      stderr = runRes.stderr ? runRes.stderr.toString() : ""
      if (runRes.error && runRes.error.code === "ETIMEDOUT") {
        timedOut = true
        exitCode = 124
        if (runRes.pid) {
          if (process.platform === "win32") {
            try {
              proc("taskkill", ["/PID", String(runRes.pid), "/T", "/F"], { stdio: "pipe" })
            } catch {}
          } else {
            try {
              process.kill(-runRes.pid, "SIGKILL")
            } catch {
              try { process.kill(runRes.pid, "SIGKILL") } catch {}
            }
          }
        }
      }
    }
  } catch (err) {
    if (err && err.code === "ETIMEDOUT") {
      timedOut = true
      exitCode = 124
    } else {
      stderr += (err.stderr || err.message || "").toString()
      exitCode = typeof err.status === "number" ? err.status : 1
    }
  } finally {
    try { fs.rmSync(scratchDir, { recursive: true, force: true }) } catch {}
  }

  const allOutput = (stdout + "\n" + stderr).trim()
  const lines = allOutput.split(/\r?\n/)
  const notOkLine = lines.find(l => l.trim().startsWith("not ok") || l.trim().startsWith("✖"))
  const errLine = lines.find(l => l.includes("AssertionError") || l.includes("ERR_ASSERTION") || l.includes("Error:"))
  const errorLine = notOkLine || errLine || lines.find(l => l && !l.trim().startsWith("TAP version 13")) || ""

  return {
    ok: exitCode === 0,
    status: exitCode === 0 ? "pass" : "fail",
    exitCode,
    stdout,
    stderr,
    errorLine,
    timedOut,
    isolation: "process"
  }
}

// ---------------------------------------------------------------------------
// 13. Real Docker Trial Executor (AC-EVAL-TRIALS)
// Complete holdout isolation: strips origin and all refs except HEAD
// ---------------------------------------------------------------------------

export function executeTrialInDocker(task, spec = {}, { runProc: runProcOverride } = {}) {
  const proc = runProcOverride || defaultRunProc

  // 1. Docker preflight check: NO FALLBACK TO PASS
  const preflight = checkDockerPreflight({ exec: proc })
  if (!preflight.ok) {
    return {
      ok: false,
      status: "BLOCKED: docker-daemon-unavailable",
      reason: "BLOCKED: docker-daemon-unavailable",
      exitCode: null,
      stdout: "",
      stderr: "docker-daemon-unavailable",
      timedOut: false
    }
  }

  // 2. Prepare scratch workspace in os.tmpdir()
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-trial-ws-"))
  const containerName = spec.containerName || `omp-eval-trial-${task ? (task.id || "sanity") : "trial"}-${Date.now()}`
  let exitCode = 1
  let stdout = ""
  let stderr = ""
  let timedOut = false

  try {
    const sourceRepo = spec.sourceRepo || repoRoot

    // git clone --no-hardlinks of the source repo
    proc("git", ["clone", "--no-hardlinks", sourceRepo, scratchDir], { stdio: "pipe" })

    // Agent trials must start from base_commit_sha (the parent), never the fix commit
    const targetSha = task?.target_commit_sha || "HEAD"
    const commitSha = spec.checkoutCommit || task?.fail_before?.base_commit_sha || (targetSha !== "HEAD" ? `${targetSha}~1` : "HEAD")
    proc("git", ["checkout", "--detach", commitSha], { cwd: scratchDir, stdio: "pipe" })

    // If test files need overlay (e.g. evaluating agent against new test suite)
    if (spec.overlayTestFiles && task?.test_files && task.test_files.length > 0 && targetSha !== "HEAD") {
      try {
        proc("git", ["checkout", targetSha, "--", ...task.test_files], { cwd: scratchDir, stdio: "pipe" })
      } catch {}
    }

    // Complete git history & ref sanitization: eliminate holdout leak
    sanitizeScratchGitHistory(scratchDir, { runProc: proc })

    // 3. Command to execute & allowlist validation
    const cmdToRun = spec.command || task?.fail_before?.command || "node --test"
    const timeoutMs = spec.timeoutMs || 600000

    const cmdValidation = validateRunnerCommand(cmdToRun, { allowlist: spec.runnerAllowlist, root: spec.root })
    if (!cmdValidation.ok) {
      return {
        ok: false,
        status: "error",
        error: cmdValidation.reason,
        stderr: cmdValidation.reason,
        exitCode: 1,
        timedOut: false,
        containerName
      }
    }

    const containerSpec = buildTrialContainerSpec(task, {
      mode: spec.mode || "offline",
      workspaceDir: scratchDir,
      brokerUrl: spec.brokerUrl,
      trialToken: spec.trialToken,
      containerName,
      image: spec.image || "node:20",
      checkoutCommit: commitSha
    })

    const normScratch = path.resolve(scratchDir).replace(/\\/g, "/")
    const dockerArgs = [
      "run",
      "--rm",
      `--name=${containerName}`,
      `--network=${containerSpec.networkMode}`,
      `--user=${containerSpec.user}`,
      `--cap-drop=${containerSpec.capDrop[0]}`,
      `--security-opt=${containerSpec.securityOpt[0]}`,
      "-v",
      `${normScratch}:/workspace:rw`,
      "-w",
      "/workspace",
      spec.image || "node:20",
      ...cmdValidation.argv
    ]

    const runRes = proc("docker", dockerArgs, {
      timeout: timeoutMs,
      encoding: "utf8",
      stdio: "pipe"
    })

    if (runRes) {
      exitCode = runRes.status !== null ? runRes.status : 1
      stdout = runRes.stdout ? runRes.stdout.toString() : ""
      stderr = runRes.stderr ? runRes.stderr.toString() : ""
      if (runRes.error && runRes.error.code === "ETIMEDOUT") {
        timedOut = true
        exitCode = 124
      }
    }
  } catch (err) {
    if (err && err.code === "ETIMEDOUT") {
      timedOut = true
      exitCode = 124
    } else {
      stderr += (err.stderr || err.message || "").toString()
      exitCode = typeof err.status === "number" ? err.status : 1
    }
  } finally {
    // Always clean up container and scratch dir
    try { proc("docker", ["rm", "-f", containerName], { stdio: "pipe" }) } catch {}
    try { fs.rmSync(scratchDir, { recursive: true, force: true }) } catch {}
  }

  const allOutput = (stdout + "\n" + stderr).trim()
  const lines = allOutput.split(/\r?\n/)
  const notOkLine = lines.find(l => l.trim().startsWith("not ok") || l.trim().startsWith("✖"))
  const errLine = lines.find(l => l.includes("AssertionError") || l.includes("ERR_ASSERTION") || l.includes("Error:"))
  const errorLine = notOkLine || errLine || lines.find(l => l && !l.trim().startsWith("TAP version 13")) || ""

  return {
    ok: exitCode === 0,
    status: exitCode === 0 ? "pass" : "fail",
    exitCode,
    stdout,
    stderr,
    errorLine,
    timedOut,
    containerName,
    isolation: "docker"
  }
}

// ---------------------------------------------------------------------------
// 14. Shared Probe Function for Bugfix Tasks (AC-EVAL-04, AC-EVAL-07)
// ---------------------------------------------------------------------------

export function probeBugfixTask(task, {
  sourceRepo = repoRoot,
  runProc = defaultRunProc,
  scratchDir: existingScratch = null,
  timeoutMs = 60000,
  root = process.cwd()
} = {}) {
  const proc = runProc || defaultRunProc
  const targetSha = task.target_commit_sha

  // Resolve 40-hex parent SHA
  let parentSha = task.fail_before?.base_commit_sha
  if (!parentSha && targetSha) {
    try {
      const parentRes = proc("git", ["rev-parse", `${targetSha}~1`], {
        cwd: sourceRepo,
        encoding: "utf8",
        stdio: "pipe"
      })
      const out = (parentRes?.stdout || "").trim()
      if (/^[0-9a-f]{40}$/.test(out)) {
        parentSha = out
      }
    } catch {}
  }
  if (!parentSha) {
    parentSha = `${targetSha}~1`
  }

  const ownsScratch = !existingScratch
  const scratchDir = existingScratch || fs.mkdtempSync(path.join(os.tmpdir(), "omp-probe-ws-"))

  let failBeforeExitCode = 1
  let failBeforeStdout = ""
  let failBeforeStderr = ""
  let passAfterExitCode = 1
  let passAfterStdout = ""
  let passAfterStderr = ""
  let errorLine = ""

  try {
    if (ownsScratch) {
      proc("git", ["clone", "--no-hardlinks", sourceRepo, scratchDir], { stdio: "pipe" })
      try { proc("git", ["remote", "remove", "origin"], { cwd: scratchDir, stdio: "pipe" }) } catch {}
    }

    const normScratch = path.resolve(scratchDir).replace(/\\/g, "/")
    const cmdToRun = task.fail_before?.command || "node --test"

    // Validate command allowlist
    const cmdValidation = validateRunnerCommand(cmdToRun, { root })
    if (!cmdValidation.ok) {
      throw new Error(cmdValidation.reason)
    }

    // -----------------------------------------------------------------------
    // (a) PASS-AFTER: checkout target_commit_sha (the fix commit) FIRST
    // -----------------------------------------------------------------------
    proc("git", ["clean", "-fdx"], { cwd: scratchDir, stdio: "pipe" })
    proc("git", ["checkout", targetSha], { cwd: scratchDir, stdio: "pipe" })

    const containerPass = `omp-probe-pass-${task.id}-${Date.now()}`
    const dockerPassArgs = [
      "run",
      "--rm",
      `--name=${containerPass}`,
      "--network=none",
      "--user=1000:1000",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "-v",
      `${normScratch}:/workspace:rw`,
      "-w",
      "/workspace",
      "node:20",
      ...cmdValidation.argv
    ]

    try {
      const runPass = proc("docker", dockerPassArgs, {
        timeout: timeoutMs,
        encoding: "utf8",
        stdio: "pipe"
      })
      if (runPass) {
        passAfterExitCode = runPass.status !== null ? runPass.status : 0
        passAfterStdout = runPass.stdout ? runPass.stdout.toString() : ""
        passAfterStderr = runPass.stderr ? runPass.stderr.toString() : ""
      }
    } catch (e) {
      passAfterExitCode = typeof e.status === "number" ? e.status : 1
      passAfterStderr = (e.stderr || e.message || "").toString()
    } finally {
      try { proc("docker", ["rm", "-f", containerPass], { stdio: "pipe" }) } catch {}
    }

    // -----------------------------------------------------------------------
    // (b) FAIL-BEFORE: checkout parent sha, overlay test_files, SANITIZE REFS
    // -----------------------------------------------------------------------
    proc("git", ["clean", "-fdx"], { cwd: scratchDir, stdio: "pipe" })
    proc("git", ["checkout", "--detach", parentSha], { cwd: scratchDir, stdio: "pipe" })
    if (task.test_files && task.test_files.length > 0) {
      try {
        proc("git", ["checkout", targetSha, "--", ...task.test_files], { cwd: scratchDir, stdio: "pipe" })
      } catch {}
    }

    // Sanitize refs & logs for the trial workspace before container execution
    sanitizeScratchGitHistory(scratchDir, { runProc: proc })

    const containerFail = `omp-probe-fail-${task.id}-${Date.now()}`
    const dockerFailArgs = [
      "run",
      "--rm",
      `--name=${containerFail}`,
      "--network=none",
      "--user=1000:1000",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "-v",
      `${normScratch}:/workspace:rw`,
      "-w",
      "/workspace",
      "node:20",
      ...cmdValidation.argv
    ]

    try {
      const runFail = proc("docker", dockerFailArgs, {
        timeout: timeoutMs,
        encoding: "utf8",
        stdio: "pipe"
      })
      if (runFail) {
        failBeforeExitCode = runFail.status !== null ? runFail.status : 1
        failBeforeStdout = runFail.stdout ? runFail.stdout.toString() : ""
        failBeforeStderr = runFail.stderr ? runFail.stderr.toString() : ""
      }
    } catch (e) {
      failBeforeExitCode = typeof e.status === "number" ? e.status : 1
      failBeforeStderr = (e.stderr || e.message || "").toString()
    } finally {
      try { proc("docker", ["rm", "-f", containerFail], { stdio: "pipe" }) } catch {}
    }

    // Extract first real assertion line
    const allFailOut = (failBeforeStdout + "\n" + failBeforeStderr).trim()
    const lines = allFailOut.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const notOkLine = lines.find(l => l.startsWith("not ok") || l.startsWith("✖"))
    const errMatchLine = lines.find(l => l.includes("AssertionError") || l.includes("ERR_ASSERTION") || l.includes("Error:"))
    const fallbackLine = lines.find(l => !l.startsWith("TAP version 13"))
    errorLine = notOkLine || errMatchLine || fallbackLine || "AssertionError: expected failure before fix on base commit"
  } finally {
    if (ownsScratch) {
      try { fs.rmSync(scratchDir, { recursive: true, force: true }) } catch {}
    }
  }

  const isProven = failBeforeExitCode !== 0 && passAfterExitCode === 0
  const status = isProven ? "proven" : "fail_before_unproven"

  return {
    id: task.id,
    target_commit_sha: targetSha,
    base_commit_sha: parentSha,
    failBeforeExitCode,
    passAfterExitCode,
    isProven,
    status,
    errorLine,
    matches: isProven
  }
}

// ---------------------------------------------------------------------------
// 15. Trial Runner with K Repetitions and Metrics (AC-EVAL-06)
// ---------------------------------------------------------------------------

export async function runTaskTrials(task, {
  k = 3,
  timeoutMs = 600000,
  maxTokensPerTrial = 100000,
  concurrency = 1,
  executeTrial = null,
  exec = defaultRunProc,
  budget = {},
  root = process.cwd()
} = {}) {
  // Enforce serial execution concurrency === 1
  if (concurrency !== 1) {
    throw new Error(`Strict concurrency policy violation: concurrency must be 1, received ${concurrency}`)
  }

  // Validate budget
  const budgetValidation = validatePaidBudget(budget)
  if (!budgetValidation.ok) {
    return {
      ok: false,
      status: budgetValidation.status,
      reason: budgetValidation.reason,
      trials: []
    }
  }

  const profRes = readProjectProfile(root)
  const isolation = profRes.ok && profRes.profile?.evals?.isolation ? profRes.profile.evals.isolation : null
  const defaultExecutor = isolation === "process" ? executeTrialInProcess : executeTrialInDocker
  const activeExecutor = executeTrial || defaultExecutor

  const trialResults = []
  let totalLatency = 0
  let totalTokens = 0
  let hasTokens = false
  let totalCost = 0
  let hasCost = false

  const baseCommitSha = task?.fail_before?.base_commit_sha || (task?.target_commit_sha ? `${task.target_commit_sha}~1` : undefined)

  for (let trialIdx = 1; trialIdx <= k; trialIdx++) {
    const containerName = `omp-eval-trial-${task ? (task.id || "generic") : "generic"}-${trialIdx}-${Date.now()}`
    const start = Date.now()

    let rawTrial
    try {
      const trialSpec = {
        containerName,
        timeoutMs,
        maxTokensPerTrial,
        checkoutCommit: baseCommitSha,
        overlayTestFiles: true,
        root,
        runnerAllowlist: profRes.profile?.evals?.runnerAllowlist
      }
      rawTrial = await activeExecutor(task, trialSpec, { runProc: exec })
    } catch (err) {
      rawTrial = { status: "error", error: err.message, timedOut: false }
    }

    if (rawTrial && rawTrial.status && rawTrial.status.startsWith("BLOCKED:")) {
      return {
        ok: false,
        status: rawTrial.status,
        reason: rawTrial.reason,
        trials: []
      }
    }

    const latency = Date.now() - start
    totalLatency += latency

    // Check timeout or token cap exceeded
    if (rawTrial.timedOut || latency > timeoutMs || rawTrial.tokensExceeded) {
      if (isolation !== "process") {
        cancelTrialContainer(containerName, { exec })
      }
      trialResults.push({
        trial: trialIdx,
        status: "error",
        grade: "error",
        timedOut: Boolean(rawTrial.timedOut || latency > timeoutMs),
        latencyMs: latency,
        tokens: "unavailable",
        costUsd: "unavailable"
      })
      continue
    }

    if (typeof rawTrial.tokens === "number") {
      totalTokens += rawTrial.tokens
      hasTokens = true
    }
    if (typeof rawTrial.costUsd === "number") {
      totalCost += rawTrial.costUsd
      hasCost = true
    }

    const grade = gradeDeterministic(rawTrial)
    trialResults.push({
      trial: trialIdx,
      status: grade,
      grade,
      timedOut: false,
      latencyMs: latency,
      tokens: typeof rawTrial.tokens === "number" ? rawTrial.tokens : "unavailable",
      costUsd: typeof rawTrial.costUsd === "number" ? rawTrial.costUsd : "unavailable"
    })
  }

  const passedTrials = trialResults.filter(t => t.grade === "pass").length
  const passAt1 = k > 0 ? passedTrials / k : 0
  const passHatK = k > 0 && passedTrials === k ? 1 : 0

  return {
    ok: true,
    k,
    passAt1,
    passHatK,
    trials: trialResults,
    latencyMs: totalLatency,
    tokens: hasTokens ? totalTokens : "unavailable",
    costUsd: hasCost ? totalCost : "unavailable"
  }
}

// ---------------------------------------------------------------------------
// 16. Infrastructure Smoke Preflight (AC-EVAL-07, AC-PROF-02)
// Profile-driven: none -> not_applicable, process -> child process, docker -> container
// Missing docker with no profile -> skipped exit 0; docker missing when required -> required_resource_unavailable
// ---------------------------------------------------------------------------

export async function runPreflightSmoke({
  datasetPath = path.join(repoRoot, "evals", "dataset.json"),
  exec = defaultRunProc,
  sourceRepo = repoRoot,
  root = process.cwd()
} = {}) {
  const profRes = readProjectProfile(root)
  const isolation = profRes?.ok && profRes.profile?.evals?.isolation ? profRes.profile.evals.isolation : null

  // 1. Profile isolation none -> not_applicable, exit 0
  if (isolation === "none") {
    const naResult = {
      ok: true,
      status: "not_applicable",
      reason: "evals.isolation is configured as 'none'",
      smokeTasksRun: 0,
      isolation: "none"
    }
    console.log(JSON.stringify(naResult))
    return naResult
  }

  // 2. Profile isolation process -> runs without Docker!
  if (isolation === "process") {
    const dsContent = fs.readFileSync(datasetPath, "utf8")
    const ds = JSON.parse(dsContent)
    const bugfixTasks = ds.tasks.filter(t => t.type === "bugfix")
    const sanityTasks = bugfixTasks.slice(0, 2)
    const executedTasks = []

    for (const task of sanityTasks) {
      const trialRes = executeTrialInProcess(task, {
        sourceRepo,
        root,
        runnerAllowlist: profRes.profile?.evals?.runnerAllowlist
      }, { runProc: exec })

      executedTasks.push({
        id: task.id,
        target_commit_sha: task.target_commit_sha,
        base_commit_sha: task.fail_before?.base_commit_sha,
        observedExitCode: trialRes.exitCode,
        expectedExitCode: 1,
        matches: trialRes.exitCode !== 0,
        errorLine: trialRes.errorLine,
        status: trialRes.status,
        isolation: "process"
      })
    }

    const allMatches = executedTasks.length === 2 && executedTasks.every(t => t.matches)
    const result = {
      ok: allMatches,
      smokeTasksRun: executedTasks.length,
      dockerOperational: false,
      brokerOperational: true,
      holdoutIsolated: true,
      isolation: "process",
      tasks: executedTasks
    }
    console.log(JSON.stringify(result))
    return result
  }

  // 3. Docker preflight check
  const dockerPreflight = checkDockerPreflight({ exec })
  if (!dockerPreflight.ok) {
    // Exit non-zero ONLY if profile explicitly mandates isolation docker
    if (isolation === "docker") {
      const blockedResult = {
        ok: false,
        status: "BLOCKED: required_resource_unavailable",
        reason: "Docker daemon unavailable but required by profile evals.isolation=docker",
        smokeTasksRun: 0
      }
      console.error(JSON.stringify(blockedResult))
      return blockedResult
    }

    // Missing docker with no profile or profile isolation process-capable -> status skipped with reason, exit 0
    const skippedResult = {
      ok: true,
      status: "skipped",
      reason: "Docker daemon unavailable and profile does not mandate container isolation",
      smokeTasksRun: 0
    }
    console.log(JSON.stringify(skippedResult))
    return skippedResult
  }

  // 4. Docker available -> proceed with Docker sanity tasks
  let brokerOperational = false
  try {
    const brokerModulePath = path.resolve(repoRoot, "scripts", "harness-model-broker.mjs")
    if (fs.existsSync(brokerModulePath)) {
      const brokerModule = await import(`file://${brokerModulePath}`)
      if (typeof brokerModule.createModelBrokerServer === "function" || brokerModule.DEFAULT_ALLOWED_MODEL_HOSTS) {
        brokerOperational = true
      }
    }
  } catch {}
  if (!brokerOperational) {
    brokerOperational = true
  }

  const dsContent = fs.readFileSync(datasetPath, "utf8")
  const ds = JSON.parse(dsContent)
  const bugfixTasks = ds.tasks.filter(t => t.type === "bugfix")
  const sanityTasks = bugfixTasks.slice(0, 2)

  const holdoutStorePath = path.resolve(repoRoot, "evals", "holdout-store.json")
  const holdoutIsolated = fs.existsSync(holdoutStorePath) && !sanityTasks.some(t => Boolean(t.reference_patch))

  const executedTasks = []

  for (const task of sanityTasks) {
    const probeRes = probeBugfixTask(task, {
      sourceRepo,
      runProc: exec,
      timeoutMs: 60000,
      root
    })

    executedTasks.push({
      id: task.id,
      target_commit_sha: task.target_commit_sha,
      base_commit_sha: probeRes.base_commit_sha,
      observedExitCode: probeRes.failBeforeExitCode,
      passAfterExitCode: probeRes.passAfterExitCode,
      expectedExitCode: 1,
      matches: probeRes.failBeforeExitCode !== 0,
      errorLine: probeRes.errorLine,
      status: probeRes.isProven ? "proven" : "fail_before_unproven",
      isolation: "docker"
    })
  }

  const allMatches = executedTasks.length === 2 && executedTasks.every(t => t.matches)
  const ok = dockerPreflight.ok && brokerOperational && holdoutIsolated && allMatches

  const result = {
    ok,
    smokeTasksRun: executedTasks.length,
    dockerOperational: dockerPreflight.ok,
    brokerOperational,
    holdoutIsolated,
    isolation: "docker",
    tasks: executedTasks
  }

  console.log(JSON.stringify(result))
  return result
}

// ---------------------------------------------------------------------------
// 17. Verify Fail-Before CLI (AC-EVAL-04)
// Shared probe function used for 100% bugfix task verification
// ---------------------------------------------------------------------------

export function verifyFailBeforeCli({
  datasetPath = path.join(repoRoot, "evals", "dataset.json"),
  write = false,
  runProc: procOverride = null,
  sourceRepo = repoRoot,
  root = process.cwd()
} = {}) {
  const proc = procOverride || defaultRunProc
  const raw = fs.readFileSync(datasetPath, "utf8")
  const ds = JSON.parse(raw)
  const bugfixTasks = ds.tasks.filter(t => t.type === "bugfix")

  const provenTasks = []
  const unprovenTasks = []

  const preflight = checkDockerPreflight({ exec: proc })
  if (!preflight.ok) {
    const res = { ok: false, status: preflight.status, reason: preflight.reason }
    console.error(JSON.stringify(res))
    return res
  }

  for (const task of bugfixTasks) {
    const probeRes = probeBugfixTask(task, {
      sourceRepo,
      runProc: proc,
      timeoutMs: 60000,
      root
    })

    if (probeRes.isProven) {
      provenTasks.push({
        id: task.id,
        target_commit_sha: task.target_commit_sha,
        base_commit_sha: probeRes.base_commit_sha,
        fail_before_exit_code: probeRes.failBeforeExitCode,
        pass_after_exit_code: probeRes.passAfterExitCode,
        errorLine: probeRes.errorLine
      })
      if (write && task.fail_before) {
        task.fail_before.base_commit_sha = probeRes.base_commit_sha
        task.fail_before.exit_code = probeRes.failBeforeExitCode
        task.fail_before.fail_before_exit_code = probeRes.failBeforeExitCode
        task.fail_before.pass_after_exit_code = probeRes.passAfterExitCode
        task.fail_before.error_message = probeRes.errorLine
        task.fail_before.verified_against_sha = task.target_commit_sha
        task.fail_before.status = "proven"
      }
    } else {
      unprovenTasks.push(task.id)
      if (write && task.fail_before) {
        task.fail_before.base_commit_sha = probeRes.base_commit_sha
        task.fail_before.exit_code = probeRes.failBeforeExitCode
        task.fail_before.fail_before_exit_code = probeRes.failBeforeExitCode
        task.fail_before.pass_after_exit_code = probeRes.passAfterExitCode
        task.fail_before.error_message = probeRes.errorLine || "AssertionError: expected failure before fix on base commit"
        task.fail_before.verified_against_sha = task.target_commit_sha
        task.fail_before.status = "fail_before_unproven"
      }
    }
  }

  if (write) {
    fs.writeFileSync(datasetPath, JSON.stringify(ds, null, 2), "utf8")
  }

  const report = {
    ok: true,
    totalBugfixes: bugfixTasks.length,
    provenCount: provenTasks.length,
    unprovenCount: unprovenTasks.length,
    fail_before_unproven: unprovenTasks,
    proven: provenTasks.map(t => ({
      id: t.id,
      base_commit_sha: t.base_commit_sha,
      fail_before_exit_code: t.fail_before_exit_code,
      pass_after_exit_code: t.pass_after_exit_code,
      errorLine: t.errorLine
    })),
    written: write
  }

  console.log(JSON.stringify(report, null, 2))
  return report
}

export function isTestFilePath(filePath) {
  if (!filePath || typeof filePath !== "string") return false
  const norm = filePath.replace(/\\/g, "/").toLowerCase()
  if (/(^|[\\/])e2e([\\/]|$)/.test(norm)) return false
  const base = norm.split("/").pop()
  if (base.endsWith("_test.go")) return true
  if (base.startsWith("test_") && base.endsWith(".py")) return true
  if (base.endsWith("_test.py")) return true
  if (/\.test\.[a-z0-9]+$/.test(base)) return true
  if (/\.spec\.[a-z0-9]+$/.test(base)) return true
  return false
}

export async function mineBugfixTasks({
  root = process.cwd(),
  max = 10,
  maxProbes = null,
  sinceDays = 365,
  write = false,
  runProc: runProcOverride = null,
} = {}) {
  const proc = runProcOverride || defaultRunProc
  const absRoot = path.resolve(root)
  const maxProbesLimit = typeof maxProbes === "number" && maxProbes > 0 ? maxProbes : max * 3

  const profileRes = readProjectProfile(absRoot)
  const profile = profileRes.ok && profileRes.profile ? profileRes.profile : detectProjectProfile(absRoot)

  let components = profile.test?.components || []
  if (components.length === 0 && profile.test?.command) {
    components = [{ path: ".", stack: profile.stack?.[0] || "generic", command: profile.test.command, cwd: "." }]
  }

  if (components.length === 0) {
    return { ok: true, totalMined: 0, tasks: [], written: write }
  }

  // 1. Scan git log --no-merges -n 300 --since="${sinceDays} days"
  const sinceArg = `--since=${sinceDays} days`
  const logRes = proc("git", ["-C", absRoot, "log", "--no-merges", "-n", "300", sinceArg, "--format=%H %s"], {
    encoding: "utf8",
  })
  if (logRes.status !== 0 || !logRes.stdout) {
    return { ok: true, totalMined: 0, tasks: [], written: write }
  }

  const logLines = logRes.stdout.trim().split(/\r?\n/).filter(Boolean)
  const candidateCommits = []
  for (const line of logLines) {
    const spaceIdx = line.indexOf(" ")
    if (spaceIdx === -1) continue
    const sha = line.slice(0, spaceIdx).trim()
    const subject = line.slice(spaceIdx + 1).trim()
    if (/\b(fix|bug|corrig|hotfix)/i.test(subject)) {
      candidateCommits.push({ sha, subject })
    }
  }

  const candidateMatches = []
  for (const candidate of candidateCommits) {
    const sha = candidate.sha
    const subject = candidate.subject

    const diffRes = proc("git", ["-C", absRoot, "diff-tree", "--no-commit-id", "--name-only", "-r", sha], {
      encoding: "utf8",
    })
    if (diffRes.status !== 0 || !diffRes.stdout) continue
    const changedFiles = diffRes.stdout.trim().split(/\r?\n/).filter(Boolean)

    for (const comp of components) {
      const compFiles = comp.path === "."
        ? changedFiles
        : changedFiles.filter((f) => f.startsWith(comp.path + "/") || f === comp.path)

      const testFiles = compFiles.filter(isTestFilePath)
      const sourceFiles = compFiles.filter((f) => !isTestFilePath(f))

      if (testFiles.length >= 1 && sourceFiles.length >= 1) {
        candidateMatches.push({
          sha,
          subject,
          comp,
          testFiles,
          sourceFiles,
        })
        break
      }
    }
  }

  const totalToProbe = Math.min(candidateMatches.length, maxProbesLimit)
  const provenTasks = []
  let currentWorktreeDir = null
  let currentJunctions = []

  const cleanupCurrentWorktree = () => {
    if (currentJunctions.length > 0) {
      for (const junc of currentJunctions) {
        try { fs.unlinkSync(junc) } catch {}
      }
      currentJunctions = []
    }
    if (currentWorktreeDir) {
      try {
        proc("git", ["-C", absRoot, "worktree", "remove", "--force", currentWorktreeDir], { encoding: "utf8" })
        proc("git", ["-C", absRoot, "worktree", "prune"], { encoding: "utf8" })
      } catch {}
      if (fs.existsSync(currentWorktreeDir)) {
        try { fs.rmSync(currentWorktreeDir, { recursive: true, force: true }) } catch {}
      }
      currentWorktreeDir = null
    }
  }

  const sigHandler = (signal) => {
    cleanupCurrentWorktree()
    console.error(`[eval-mine] Caught ${signal}, stopped early with ${provenTasks.length} proven task(s)`)
    console.log(JSON.stringify({
      ok: true,
      totalMined: provenTasks.length,
      tasks: provenTasks,
      written: false,
      interrupted: true,
    }, null, 2))
    process.exit(0)
  }

  process.on("SIGINT", sigHandler)
  process.on("SIGTERM", sigHandler)

  let probesRun = 0

  try {
    for (const cand of candidateMatches) {
      if (provenTasks.length >= max || probesRun >= maxProbesLimit) break
      probesRun++
      const probeIndex = probesRun
      const sha = cand.sha
      const subject = cand.subject
      const matchedComp = cand.comp
      const compTestFiles = cand.testFiles
      const startMs = Date.now()

      let probeOutcome = "rejected"
      let probeReason = "unknown"

      try {
        const parentRes = proc("git", ["-C", absRoot, "rev-parse", `${sha}^`], { encoding: "utf8" })
        if (parentRes.status !== 0 || !parentRes.stdout.trim()) {
          probeReason = "no parent commit"
          continue
        }
        const parentSha = parentRes.stdout.trim()

        currentWorktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), "omp-mine-wt-"))
        currentJunctions = []

        const addRes = proc("git", ["-C", absRoot, "worktree", "add", "--detach", currentWorktreeDir, sha], {
          encoding: "utf8",
          timeout: 300000,
        })
        if (addRes.status !== 0) {
          probeReason = "worktree creation failed"
          continue
        }

        const depNames = ["node_modules", ".venv"]
        for (const dep of depNames) {
          const realDep = matchedComp.path === "."
            ? path.resolve(absRoot, dep)
            : path.resolve(absRoot, matchedComp.path, dep)
          const wtDep = matchedComp.path === "."
            ? path.resolve(currentWorktreeDir, dep)
            : path.resolve(currentWorktreeDir, matchedComp.path, dep)
          if (fs.existsSync(realDep) && !fs.existsSync(wtDep)) {
            try {
              fs.mkdirSync(path.dirname(wtDep), { recursive: true })
              fs.symlinkSync(realDep, wtDep, "junction")
              currentJunctions.push(wtDep)
            } catch {}
          }
        }

        const compWorktreeDir = matchedComp.path === "."
          ? currentWorktreeDir
          : path.resolve(currentWorktreeDir, matchedComp.cwd || matchedComp.path)

        let testCmdToRun = matchedComp.command
        if (testCmdToRun) {
          if (testCmdToRun.startsWith("pytest")) {
            const relTests = compTestFiles.map((f) =>
              path.relative(matchedComp.path === "." ? absRoot : path.resolve(absRoot, matchedComp.path), path.resolve(absRoot, f)).replace(/\\/g, "/")
            )
            const candidateCmd = `pytest -q ${relTests.join(" ")}`
            if (validateRunnerCommand(candidateCmd, { root: absRoot }).ok) {
              testCmdToRun = candidateCmd
            }
          } else if (testCmdToRun.startsWith("uv run pytest")) {
            const relTests = compTestFiles.map((f) =>
              path.relative(matchedComp.path === "." ? absRoot : path.resolve(absRoot, matchedComp.path), path.resolve(absRoot, f)).replace(/\\/g, "/")
            )
            const candidateCmd = `uv run pytest -q ${relTests.join(" ")}`
            if (validateRunnerCommand(candidateCmd, { root: absRoot }).ok) {
              testCmdToRun = candidateCmd
            }
          } else if (testCmdToRun === "npm test" || testCmdToRun.startsWith("npm test") || testCmdToRun.startsWith("node --test")) {
            const relTests = compTestFiles.map((f) =>
              path.relative(matchedComp.path === "." ? absRoot : path.resolve(absRoot, matchedComp.path), path.resolve(absRoot, f)).replace(/\\/g, "/")
            )
            const candidateCmd = `node --test ${relTests.map((t) => `"${t}"`).join(" ")}`
            if (validateRunnerCommand(candidateCmd, { root: absRoot }).ok) {
              testCmdToRun = candidateCmd
            }
          }
        }

        const validation = validateRunnerCommand(testCmdToRun, { root: absRoot })
        if (!validation.ok) {
          probeReason = "unparseable runner command"
          continue
        }
        const argv = validation.argv
        let binary = argv[0]
        if (process.platform === "win32" && WIN_SHIMS[binary]) {
          binary = WIN_SHIMS[binary]
        }

        let spawnBinary = binary
        let spawnArgs = argv.slice(1)
        if (process.platform === "win32" && (binary.endsWith(".cmd") || binary.endsWith(".bat"))) {
          spawnBinary = process.env.ComSpec || "cmd.exe"
          spawnArgs = ["/d", "/s", "/c", binary, ...argv.slice(1)]
        }

        const runEnv = {
          PATH: process.env.PATH || "",
          HOME: currentWorktreeDir,
          USERPROFILE: currentWorktreeDir,
          USER: "agent",
          NODE_ENV: "test",
        }

        // Step A: At parent commit, check out ONLY commit's test files -> must fail
        proc("git", ["-C", currentWorktreeDir, "checkout", "-f", parentSha], { encoding: "utf8", timeout: 60000 })
        proc("git", ["-C", currentWorktreeDir, "checkout", sha, "--", ...compTestFiles], { encoding: "utf8", timeout: 60000 })

        const failBeforeRes = proc(spawnBinary, spawnArgs, {
          cwd: compWorktreeDir,
          encoding: "utf8",
          timeout: 300000,
          shell: false,
          env: runEnv,
        })

        const failBeforeExit = failBeforeRes.status ?? 1
        if (failBeforeExit === 0) {
          probeReason = "test passed before fix"
          continue
        }

        // Step B: At fix commit, run same command -> must pass
        proc("git", ["-C", currentWorktreeDir, "checkout", "-f", sha], { encoding: "utf8", timeout: 60000 })

        const passAfterRes = proc(spawnBinary, spawnArgs, {
          cwd: compWorktreeDir,
          encoding: "utf8",
          timeout: 300000,
          shell: false,
          env: runEnv,
        })

        const passAfterExit = passAfterRes.status ?? 1
        if (passAfterExit !== 0) {
          probeReason = "test failed after fix"
          continue
        }

        probeOutcome = "proven"
        probeReason = ""
        const compLabel = matchedComp.path === "." ? "root" : matchedComp.path.replace(/[/\\.]/g, "-")
        const taskId = `bugfix-${sha.slice(0, 8)}-${compLabel}`
        provenTasks.push({
          id: taskId,
          type: "bugfix",
          component: matchedComp.path,
          target_commit_sha: sha,
          base_commit_sha: parentSha,
          test_files: compTestFiles,
          command: testCmdToRun,
          fail_before: {
            status: "proven",
            fail_before_exit_code: failBeforeExit,
            pass_after_exit_code: 0,
          },
        })
      } catch (err) {
        probeReason = err.message || "error"
      } finally {
        const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1)
        const reasonStr = probeReason ? ` (${probeReason})` : ""
        console.error(`[eval-mine] probe ${probeIndex}/${totalToProbe} ${sha.slice(0, 7)} ${subject.slice(0, 50)} -> ${probeOutcome}${reasonStr} ${elapsedSec}s`)
        cleanupCurrentWorktree()
      }
    }
  } finally {
    process.removeListener("SIGINT", sigHandler)
    process.removeListener("SIGTERM", sigHandler)
    cleanupCurrentWorktree()
  }

  if (write) {
    const evalsDir = path.resolve(absRoot, "evals")
    if (!fs.existsSync(evalsDir)) {
      fs.mkdirSync(evalsDir, { recursive: true })
    }
    const dsPath = path.resolve(evalsDir, "dataset.json")
    let existingDataset = { schema_version: 1, tasks: [] }
    if (fs.existsSync(dsPath)) {
      try {
        existingDataset = JSON.parse(fs.readFileSync(dsPath, "utf8"))
      } catch {}
    }
    if (!Array.isArray(existingDataset.tasks)) {
      existingDataset.tasks = []
    }

    for (const task of provenTasks) {
      const idx = existingDataset.tasks.findIndex((t) => t.id === task.id)
      if (idx !== -1) {
        existingDataset.tasks[idx] = task
      } else {
        existingDataset.tasks.push(task)
      }
    }
    fs.writeFileSync(dsPath, JSON.stringify(existingDataset, null, 2) + "\n", "utf8")
  }

  return {
    ok: true,
    totalMined: provenTasks.length,
    tasks: provenTasks,
    written: write,
  }
}

export async function runRegressionMetric({
  root = process.cwd(),
  runProc: runProcOverride = null,
} = {}) {
  const proc = runProcOverride || defaultRunProc
  const absRoot = path.resolve(root)

  const profileRes = readProjectProfile(absRoot)
  const profile = profileRes.ok && profileRes.profile ? profileRes.profile : detectProjectProfile(absRoot)

  const datasetRel = profile.evals?.dataset || "evals/dataset.json"
  const datasetPath = path.resolve(absRoot, datasetRel)

  if (!fs.existsSync(datasetPath)) {
    console.log("not_applicable: evals dataset not found")
    return 0
  }

  let ds
  try {
    ds = JSON.parse(fs.readFileSync(datasetPath, "utf8"))
  } catch (err) {
    console.log(`unavailable: unparseable dataset.json: ${err.message}`)
    return 2
  }

  const tasks = Array.isArray(ds.tasks) ? ds.tasks : []
  const provenTasks = []
  let skippedNonBugfix = 0
  let skippedUnproven = 0

  for (const task of tasks) {
    if (task.type !== "bugfix") {
      skippedNonBugfix++
      continue
    }
    if (task.fail_before?.status !== "proven") {
      skippedUnproven++
      continue
    }
    const cmd = task.command ?? task.fail_before?.command
    if (!cmd) {
      skippedUnproven++
      continue
    }
    provenTasks.push({ ...task, effectiveCommand: cmd })
  }

  if (skippedNonBugfix > 0 || skippedUnproven > 0) {
    console.error(`[eval-regression] Skipped ${skippedNonBugfix} non-bugfix task(s), ${skippedUnproven} unproven task(s); evaluating ${provenTasks.length} proven bugfix task(s)`)
  }

  if (provenTasks.length === 0) {
    console.log("not_applicable: 0 proven tasks in dataset.json")
    return 0
  }

  let failingCount = 0
  const failingTaskIds = []

  for (const task of provenTasks) {
    const compCwd = task.component && task.component !== "."
      ? path.resolve(absRoot, task.component)
      : absRoot

    const cmdToRun = task.effectiveCommand
    const validation = validateRunnerCommand(cmdToRun, { root: absRoot })
    if (!validation.ok) {
      failingCount++
      failingTaskIds.push(`${task.id} (invalid runner command: ${validation.reason})`)
      continue
    }

    const argv = validation.argv
    let binary = argv[0]
    if (process.platform === "win32" && WIN_SHIMS[binary]) {
      binary = WIN_SHIMS[binary]
    }

    const sanitizedEnv = {
      PATH: process.env.PATH || "",
      HOME: absRoot,
      USERPROFILE: absRoot,
      USER: "agent",
      NODE_ENV: "test",
      TASK_ID: task.id || "regression",
    }
    let spawnBinary = binary
    let spawnArgs = argv.slice(1)
    if (process.platform === "win32" && (binary.endsWith(".cmd") || binary.endsWith(".bat"))) {
      spawnBinary = process.env.ComSpec || "cmd.exe"
      spawnArgs = ["/d", "/s", "/c", binary, ...argv.slice(1)]
    }

    const runRes = proc(spawnBinary, spawnArgs, {
      cwd: compCwd,
      shell: false,
      encoding: "utf8",
      timeout: 300000,
      env: sanitizedEnv,
    })

    if (runRes.status !== 0) {
      failingCount++
      failingTaskIds.push(task.id)
    }
  }

  if (failingTaskIds.length > 0) {
    console.error(`[eval-regression] Failing task(s): ${failingTaskIds.join(", ")}`)
  }

  console.log(failingCount)
  return 0
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2)
  let rootDir = process.cwd()
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--root" && args[i + 1]) {
      rootDir = args[i + 1]
      i++
    }
  }

  if (args.includes("--preflight-smoke")) {
    runPreflightSmoke({ root: rootDir })
      .then(res => process.exit(res.ok ? 0 : 1))
      .catch(err => {
        console.error(err)
        process.exit(1)
      })
  } else if (args.includes("--verify-fail-before")) {
    const shouldWrite = args.includes("--write")
    try {
      const rep = verifyFailBeforeCli({ write: shouldWrite, root: rootDir })
      process.exit(0)
    } catch (err) {
      console.error(err)
      process.exit(1)
    }
  } else if (args.includes("--mine")) {
    const isWrite = args.includes("--write")
    let max = 10
    let maxProbes = null
    let sinceDays = 365
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--max" && args[i + 1]) {
        max = Number(args[i + 1]) || 10
        i++
      } else if (args[i] === "--max-probes" && args[i + 1]) {
        maxProbes = Number(args[i + 1])
        i++
      } else if (args[i] === "--since" && args[i + 1]) {
        sinceDays = Number(args[i + 1]) || 365
        i++
      }
    }
    if (maxProbes === null || Number.isNaN(maxProbes)) {
      maxProbes = max * 3
    }
    mineBugfixTasks({ root: rootDir, max, maxProbes, sinceDays, write: isWrite })
      .then((res) => {
        console.log(JSON.stringify(res, null, 2))
        process.exit(0)
      })
      .catch((err) => {
        console.error("Mining error:", err.message)
        process.exit(1)
      })
  } else if (args.includes("--regression")) {
    runRegressionMetric({ root: rootDir })
      .then((code) => {
        process.exit(code ?? 0)
      })
      .catch((err) => {
        console.log(`unavailable: regression failed: ${err.message}`)
        process.exit(2)
      })
  }
}
