import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"
import {
  readProjectProfile,
  detectProjectProfile,
  writeProjectProfile,
  publishProfileToCerebro,
} from "./harness-project-profile.mjs"
import { mineBugfixTasks, isTestFilePath } from "./harness-eval-runner.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const HARNESS_CANONICAL_ROOT = path.dirname(__dirname)

/**
 * Reject dangerous shell metacharacters and directory traversal sequences in component paths.
 */
function isSafeDirectoryPath(dirPath) {
  if (typeof dirPath !== "string") return false
  const trimmed = dirPath.trim()
  if (!trimmed || trimmed === ".") return true
  // Reject shell injection metacharacters in directory paths
  if (/[;&|`$<>\n\r]/.test(trimmed)) return false
  // Reject directory traversal sequences
  if (/(^|[\\/])\.\.([\\/]|$)/.test(trimmed)) return false
  return true
}

/**
 * Resolve an installed harness script path safely:
 * checks harnessHome/scripts/<name>, then canonical root scripts/<name>.
 */
function resolveHarnessScript(harnessHome, scriptName) {
  const candidates = [
    harnessHome ? path.resolve(harnessHome, "scripts", scriptName) : null,
    path.resolve(HARNESS_CANONICAL_ROOT, "scripts", scriptName),
    path.resolve(__dirname, scriptName),
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

/**
 * Resolve quality-thresholds template canonically.
 * When templateRoot is explicitly provided, it is authoritative: fails if missing,
 * without falling back to canonical defaults.
 * Fallback to canonical templates only operates when templateRoot is omitted/undefined.
 */
function resolveQualityThresholdsTemplate(templateRoot, harnessHome) {
  if (templateRoot) {
    const candidateFile = path.resolve(templateRoot, "agent-os", "quality-thresholds.json")
    if (fs.existsSync(candidateFile)) {
      try {
        return JSON.parse(fs.readFileSync(candidateFile, "utf8"))
      } catch (err) {
        throw new Error(`Template at ${candidateFile} is invalid JSON: ${err.message}`)
      }
    }
    return null
  }

  const candidateDirs = [
    harnessHome ? path.resolve(harnessHome, "templates") : null,
    path.resolve(HARNESS_CANONICAL_ROOT, "templates"),
    path.resolve(os.homedir(), ".config", "opencode", "templates"),
  ].filter(Boolean)

  for (const dir of candidateDirs) {
    const candidateFile = path.resolve(dir, "agent-os", "quality-thresholds.json")
    if (fs.existsSync(candidateFile)) {
      try {
        return JSON.parse(fs.readFileSync(candidateFile, "utf8"))
      } catch (err) {
        throw new Error(`Template at ${candidateFile} is invalid JSON: ${err.message}`)
      }
    }
  }
  return null
}

/**
 * Derive detected regression command from profile.
 * For monorepos, chains commands across all test components respecting component cwd/path with quotes.
 * Validates directory paths against shell metacharacters.
 */
function deriveDetectedRegressionCommand(profile) {
  if (profile.test?.command) {
    return profile.test.command
  }
  const components = profile.test?.components || []
  const activeComponents = components.filter((c) => c && c.command)
  if (activeComponents.length === 1) {
    const c = activeComponents[0]
    const compDir = c.cwd ?? c.path ?? "."
    if (!isSafeDirectoryPath(compDir)) return null
    const safeCd = compDir !== "." ? `cd "${compDir.replace(/"/g, '\\"')}" && ` : ""
    return `${safeCd}${c.command}`
  }
  if (activeComponents.length > 1) {
    const parts = []
    for (const c of activeComponents) {
      const compDir = c.cwd ?? c.path ?? "."
      if (!isSafeDirectoryPath(compDir)) return null
      const safeCd = compDir !== "." ? `cd "${compDir.replace(/"/g, '\\"')}" && ` : ""
      parts.push(`(${safeCd}${c.command})`)
    }
    return parts.join(" && ")
  }
  return null
}

/**
 * Scan repository test files for authentic authz / tenant isolation tests.
 * Restricts strictly to real test filenames (via isTestFilePath); rejects production code.
 */
function discoverSecurityEvidence(root, components = []) {
  const authzTests = []
  const tenantIsolation = []

  const searchDirs = components.length > 0
    ? components.map((c) => path.resolve(root, (c.cwd ?? c.path) === "." ? "" : (c.cwd ?? c.path)))
    : [root]

  for (const baseDir of searchDirs) {
    if (!fs.existsSync(baseDir)) continue
    try {
      const files = []
      const walk = (dir, depth = 0) => {
        if (depth > 5) return
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".venv") continue
          const fullPath = path.resolve(dir, entry.name)
          if (entry.isDirectory()) {
            walk(fullPath, depth + 1)
          } else if (entry.isFile()) {
            files.push(fullPath)
          }
        }
      }
      walk(baseDir)

      for (const file of files) {
        if (!isTestFilePath(file)) continue
        const rel = path.relative(root, file).replace(/\\/g, "/")
        const lower = rel.toLowerCase()
        if (lower.includes("tenant")) {
          tenantIsolation.push(rel)
        } else if (
          lower.includes("authz") ||
          lower.includes("rbac") ||
          lower.includes("permission") ||
          lower.includes("idor") ||
          lower.includes("auth")
        ) {
          authzTests.push(rel)
        }
      }
    } catch {}
  }

  return {
    authzTests: [...new Set(authzTests)].sort(),
    tenantIsolation: [...new Set(tenantIsolation)].sort(),
  }
}

/**
 * Main onboarding function: initializes/updates an Agent OS project harness.
 * Idempotent, portable, and preserves existing operator overrides.
 */
export async function onboardProject(root = process.cwd(), options = {}) {
  const absRoot = path.resolve(root)
  const isWrite = Boolean(options.write)
  const harnessHome = options.harnessHome || process.env.HARNESS_HOME || path.resolve(os.homedir(), ".omp", "agent")
  const templateRoot = options.templateRoot

  // -------------------------------------------------------------------------
  // Step 0: Preflight Validation
  // Validate syntax of ALL existing configuration files and required templates
  // BEFORE any disk write, directory creation, or cerebro publication.
  // -------------------------------------------------------------------------
  const agentOsDir = path.resolve(absRoot, "agent-os")
  const profilePath = path.resolve(agentOsDir, "project-profile.json")
  const thresholdsPath = path.resolve(agentOsDir, "quality-thresholds.json")
  const secContractFilePath = path.resolve(agentOsDir, "security-contract.json")

  let existingProfile = null
  if (fs.existsSync(profilePath)) {
    try {
      existingProfile = JSON.parse(fs.readFileSync(profilePath, "utf8"))
    } catch (err) {
      return {
        ok: false,
        error: "invalid_json",
        file: profilePath,
        reason: `Existing project-profile.json is invalid JSON: ${err.message}`,
        root: absRoot,
        dryRun: !isWrite,
      }
    }
  }

  let thresholdsExisted = false
  let thresholds = null
  if (fs.existsSync(thresholdsPath)) {
    thresholdsExisted = true
    try {
      thresholds = JSON.parse(fs.readFileSync(thresholdsPath, "utf8"))
    } catch (err) {
      return {
        ok: false,
        error: "invalid_json",
        file: thresholdsPath,
        reason: `Existing quality-thresholds.json is invalid JSON: ${err.message}`,
        root: absRoot,
        dryRun: !isWrite,
      }
    }
  }

  let secContractExisted = false
  let securityContract = null
  if (fs.existsSync(secContractFilePath)) {
    secContractExisted = true
    try {
      securityContract = JSON.parse(fs.readFileSync(secContractFilePath, "utf8"))
    } catch (err) {
      return {
        ok: false,
        error: "invalid_json",
        file: secContractFilePath,
        reason: `Existing security-contract.json is invalid JSON: ${err.message}`,
        root: absRoot,
        dryRun: !isWrite,
      }
    }
  }

  if (!thresholds) {
    try {
      thresholds = resolveQualityThresholdsTemplate(templateRoot, harnessHome)
    } catch (err) {
      return {
        ok: false,
        error: "template_invalid",
        reason: err.message,
        root: absRoot,
        dryRun: !isWrite,
      }
    }
    if (!thresholds) {
      return {
        ok: false,
        error: "template_missing",
        reason: templateRoot
          ? `quality-thresholds.json template not found in explicit templateRoot: ${templateRoot}`
          : "quality-thresholds.json template not found in harnessHome or canonical templates",
        root: absRoot,
        dryRun: !isWrite,
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 1: Detect project profile and merge with existing operator overrides
  // -------------------------------------------------------------------------
  const detectedProfile = detectProjectProfile(absRoot)
  let profile = detectedProfile
  if (existingProfile) {
    profile = {
      schemaVersion: 1,
      stack: existingProfile.stack && existingProfile.stackDetected === false ? existingProfile.stack : (detectedProfile.stack ?? existingProfile.stack),
      test: existingProfile.test?.detected === false ? existingProfile.test : (detectedProfile.test ?? existingProfile.test),
      evals: existingProfile.evals?.detected === false ? existingProfile.evals : (detectedProfile.evals ?? existingProfile.evals),
      ci: existingProfile.ci?.detected === false ? existingProfile.ci : (detectedProfile.ci ?? existingProfile.ci),
      delivery: existingProfile.delivery?.detected === false ? existingProfile.delivery : (detectedProfile.delivery ?? existingProfile.delivery),
      fixLoop: existingProfile.fixLoop?.detected === false ? existingProfile.fixLoop : (detectedProfile.fixLoop ?? existingProfile.fixLoop),
    }
  }

  let cerebroRes = { status: isWrite ? "skipped" : "dry_run" }

  if (isWrite) {
    profile = writeProjectProfile(absRoot, detectedProfile)
    if (options.publishCerebro !== false) {
      try {
        cerebroRes = publishProfileToCerebro(absRoot, profile, {
          env: options.env,
        })
      } catch (err) {
        cerebroRes = { status: "error", error: err.message }
      }
      if (
        cerebroRes.status === "blocked_secret" ||
        cerebroRes.status === "error" ||
        cerebroRes.status === "scanner_unavailable" ||
        cerebroRes.status === "needs_agent_fix"
      ) {
        return {
          ok: false,
          root: absRoot,
          dryRun: false,
          status: cerebroRes.status,
          reason: cerebroRes.reason || cerebroRes.error || `Cerebro publication halted with status: ${cerebroRes.status}`,
          profile,
          cerebro: cerebroRes,
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 2: Resolve harness script commands independently of project cwd (absolute, quoted)
  // -------------------------------------------------------------------------
  const nodeBin = process.execPath
  const evalRunnerPath = resolveHarnessScript(harnessHome, "harness-eval-runner.mjs")
  const securityContractPath = resolveHarnessScript(harnessHome, "harness-security-contract.mjs")
  const deliveryPreflightPath = resolveHarnessScript(harnessHome, "harness-delivery-preflight.mjs")

  const discoveredCommands = {}
  if (evalRunnerPath) {
    discoveredCommands.eval = `"${nodeBin}" "${evalRunnerPath}" --regression --metric --root .`
  }
  if (securityContractPath) {
    discoveredCommands.authz = `"${nodeBin}" "${securityContractPath}" --run --metric`
  }
  if (deliveryPreflightPath) {
    discoveredCommands.delivery = `"${nodeBin}" "${deliveryPreflightPath}" --config-check --metric`
  }

  // -------------------------------------------------------------------------
  // Step 3: Configure Phase A Quality Thresholds (agent-os/quality-thresholds.json)
  // -------------------------------------------------------------------------

  // Enforce Phase A invariants: controls are observe, regression_suite is blocking.
  // Never demote existing blocking thresholds.
  if (!thresholds.metrics) thresholds.metrics = {}
  for (const [key, metric] of Object.entries(thresholds.metrics)) {
    if (key === "regression_suite") {
      metric.mode = "blocking"
    } else if (!thresholdsExisted) {
      // Fresh Phase A onboarding sets control metrics to observe
      metric.mode = "observe"
    }
    // If thresholds existed, existing metric.mode is preserved (never demoted)
  }

  // Define recognized relative/insecure template defaults that must be migrated to absolute commands
  const isTemplateDefaultCommand = (cmd) => {
    if (typeof cmd !== "string") return true
    const trimmed = cmd.trim()
    if (!trimmed) return true
    if (
      trimmed === "node scripts/harness-security-contract.mjs --run --metric" ||
      trimmed === "node scripts/harness-eval-runner.mjs --regression --metric" ||
      trimmed === "node scripts/harness-delivery-preflight.mjs --config-check --metric"
    ) {
      return true
    }
    if (/^node\s+['"]?scripts\/harness-(security-contract|eval-runner|delivery-preflight)\.mjs/i.test(trimmed)) {
      return true
    }
    return false
  }

  // Ensure commands object exists and populate validated discovered commands.
  // For new projects OR projects with template defaults copied by bootstrap, always replace with absolute commands.
  if (!thresholds.commands) thresholds.commands = {}
  for (const [cmdKey, cmdLine] of Object.entries(discoveredCommands)) {
    const existingCmd = thresholds.commands[cmdKey]
    if (!thresholdsExisted || isTemplateDefaultCommand(existingCmd)) {
      thresholds.commands[cmdKey] = cmdLine
    }
  }

  // Clean up any remaining insecure relative template default on delivery
  if (isTemplateDefaultCommand(thresholds.commands.delivery)) {
    thresholds.commands.delivery = discoveredCommands.delivery || null
  }

  // Wire regression suite command: for a NEW project, replace template default with detected runner.
  // Preserve pre-existing command if thresholds already existed.
  const detectedRegressionCmd = deriveDetectedRegressionCommand(profile)
  if (!thresholds.suites) thresholds.suites = {}
  if (!thresholds.suites.regression) thresholds.suites.regression = { command: null, paths: [] }

  if (!thresholdsExisted) {
    thresholds.suites.regression.command = detectedRegressionCmd ?? undefined
  }

  if (isWrite) {
    if (!fs.existsSync(agentOsDir)) {
      fs.mkdirSync(agentOsDir, { recursive: true })
    }
    fs.writeFileSync(thresholdsPath, JSON.stringify(thresholds, null, 2) + "\n", "utf8")
  }

  // -------------------------------------------------------------------------
  // Step 4: Draft Security Contract (agent-os/security-contract.json)
  // -------------------------------------------------------------------------
  if (!secContractExisted) {
    const evidence = discoverSecurityEvidence(absRoot, profile.test?.components || [])
    securityContract = {
      schemaVersion: 1,
      protectedRoutes: {
        authzTests: evidence.authzTests,
      },
      tenantIsolation: {
        tests: evidence.tenantIsolation,
      },
      evidence: [...evidence.authzTests, ...evidence.tenantIsolation],
    }
    if (isWrite) {
      if (!fs.existsSync(agentOsDir)) {
        fs.mkdirSync(agentOsDir, { recursive: true })
      }
      fs.writeFileSync(secContractFilePath, JSON.stringify(securityContract, null, 2) + "\n", "utf8")
    }
  }

  // -------------------------------------------------------------------------
  // Step 5: Bounded Eval Mining (executed ONLY when write: true; dry-run returns detection plan)
  // -------------------------------------------------------------------------
  const evalsDir = path.resolve(absRoot, "evals")
  const datasetPath = path.resolve(evalsDir, "dataset.json")
  const datasetExists = fs.existsSync(datasetPath)
  let minedRes = { totalMined: 0, tasks: [] }
  let miningError = null

  if (isWrite) {
    try {
      minedRes = await mineBugfixTasks({
        root: absRoot,
        max: options.maxMinedTasks ?? options.max ?? 2,
        maxProbes: options.maxMiningProbes ?? options.maxProbes ?? 6,
        sinceDays: options.sinceDays ?? 365,
        write: true,
      })
    } catch (err) {
      miningError = err.message
      console.error(`[onboard] Mining error: ${err.message}`)
    }
  }

  if (miningError) {
    return {
      ok: false,
      root: absRoot,
      dryRun: false,
      status: "unavailable",
      error: "eval_mining_failed",
      reason: `Eval mining failed: ${miningError}`,
      profile,
      cerebro: cerebroRes,
      securityContract: {
        created: !secContractExisted && isWrite,
        existed: secContractExisted,
        path: secContractFilePath,
        contract: securityContract,
      },
      thresholds: {
        created: !thresholdsExisted && isWrite,
        updated: thresholdsExisted && isWrite,
        path: thresholdsPath,
        thresholds,
      },
      evals: {
        datasetPath,
        datasetExists: fs.existsSync(datasetPath),
        mined: 0,
        tasks: [],
        status: "unavailable",
        error: miningError,
      },
      commands: {
        discovered: discoveredCommands,
        persisted: isWrite,
      },
    }
  }

  return {
    ok: true,
    root: absRoot,
    dryRun: !isWrite,
    profile,
    cerebro: cerebroRes,
    securityContract: {
      created: !secContractExisted && isWrite,
      existed: secContractExisted,
      path: secContractFilePath,
      contract: securityContract,
    },
    thresholds: {
      created: !thresholdsExisted && isWrite,
      updated: thresholdsExisted && isWrite,
      path: thresholdsPath,
      thresholds,
    },
    evals: {
      datasetPath,
      datasetExists: datasetExists || (isWrite && minedRes.totalMined > 0),
      mined: isWrite ? minedRes.totalMined : 0,
      tasks: isWrite ? minedRes.tasks : [],
      status: "ok",
      error: null,
    },
    commands: {
      discovered: discoveredCommands,
      persisted: isWrite,
    },
  }
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2)
  let rootDir = process.cwd()
  let isWrite = false
  let isJson = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--root" && args[i + 1]) {
      rootDir = args[i + 1]
      i++
    } else if (args[i] === "--write") {
      isWrite = true
    } else if (args[i] === "--json") {
      isJson = true
    }
  }

  onboardProject(rootDir, { write: isWrite, json: isJson })
    .then((res) => {
      if (isJson) {
        console.log(JSON.stringify(res, null, 2))
      } else {
        console.log(`[onboard] Project: ${res.root}`)
        console.log(`[onboard] Mode: ${res.dryRun ? "DRY-RUN (pass --write to persist)" : "WRITTEN"}`)
        console.log(`[onboard] Status: ${res.ok ? "OK" : "FAILED"}`)
        if (res.reason) console.log(`[onboard] Reason: ${res.reason}`)
        console.log(`[onboard] Profile: ${res.profile ? "detected" : "none"}`)
        if (res.thresholds) {
          console.log(`[onboard] Thresholds: ${res.thresholds.created ? "created" : res.thresholds.updated ? "updated" : "ready"}`)
        }
        if (res.securityContract) {
          console.log(`[onboard] Security contract: ${res.securityContract.existed ? "preserved" : res.securityContract.created ? "drafted" : "dry-run"}`)
        }
        if (res.evals) {
          console.log(`[onboard] Evals: ${res.evals.mined} task(s) mined (status: ${res.evals.status})`)
        }
      }
      if (!res.ok) {
        process.exit(res.status === "blocked_secret" ? 1 : 2)
      }
      process.exit(0)
    })
    .catch((err) => {
      console.error("[onboard] Error:", err.message)
      process.exit(2)
    })
}
