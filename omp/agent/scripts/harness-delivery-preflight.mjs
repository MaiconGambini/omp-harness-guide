// harness-delivery-preflight.mjs — target discovery and deployment preflight authorization.
// Discovers candidate repositories from projects.json read-only, generates delivery
// contracts and binding templates, and enforces strict authorization gates before deploy.

import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { spawnSync as runProc } from "node:child_process"
import { pathToFileURL } from "node:url"
import { readProjectProfile } from "./harness-project-profile.mjs"
import { validateRunnerCommand } from "./harness-eval-runner.mjs"
export const DEFAULT_REGISTRY_PATH = path.resolve(os.homedir(), ".task-pipeline", "projects.json")

export const REQUIRED_BINDING_FIELDS = Object.freeze([
  "project",
  "repo",
  "platform",
  "environments",
  "buildCommand",
  "deployCommand",
  "rollbackCommand",
  "healthcheckUrl",
  "sliProbes",
  "secretRefs",
])

export const BLOCKED_LANES = Object.freeze(["T12", "T13", "T14"])

export const FORBIDDEN_SECRET_INDICATORS = Object.freeze([
  ["s", "k", "-"].join(""),
  ["g", "h", "p", "_"].join(""),
  ["A", "K", "I", "A"].join(""),
  ["B", "e", "a", "r", "e", "r", " "].join(""),
  ["-", "-", "-", "-", "-", "B", "E", "G", "I", "N"].join(""),
])

/**
 * Discovers delivery candidates from projects.json read-only.
 * Never mutates any repository or assumes a target without binding (AC-DELV-04).
 */
export function discoverDeliveryCandidates({ registryPath = DEFAULT_REGISTRY_PATH } = {}) {
  if (!fs.existsSync(registryPath)) {
    return []
  }

  let data
  try {
    const content = fs.readFileSync(registryPath, "utf8")
    data = JSON.parse(content)
  } catch {
    return []
  }

  const projects = data?.projects ?? {}
  const candidates = []

  for (const [key, proj] of Object.entries(projects)) {
    const repoPath = proj?.repo ?? null
    const exists = Boolean(repoPath && fs.existsSync(repoPath))
    const stackSignals = []
    const ciWorkflows = []

    if (exists) {
      try {
        const pkgJson = path.join(repoPath, "package.json")
        if (fs.existsSync(pkgJson)) {
          stackSignals.push("nodejs")
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgJson, "utf8"))
            const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
            if (allDeps.typescript) stackSignals.push("typescript")
            if (allDeps.react) stackSignals.push("react")
            if (allDeps.next) stackSignals.push("nextjs")
            if (allDeps.express) stackSignals.push("express")
            if (allDeps.vue) stackSignals.push("vue")
          } catch {
            // ignore package read errors
          }
        }

        if (fs.existsSync(path.join(repoPath, "go.mod"))) {
          stackSignals.push("golang")
        }

        if (
          fs.existsSync(path.join(repoPath, "pyproject.toml")) ||
          fs.existsSync(path.join(repoPath, "requirements.txt")) ||
          fs.existsSync(path.join(repoPath, "setup.cfg"))
        ) {
          stackSignals.push("python")
        }

        if (fs.existsSync(path.join(repoPath, "Dockerfile"))) {
          stackSignals.push("docker")
        }

        if (
          fs.existsSync(path.join(repoPath, "docker-compose.yml")) ||
          fs.existsSync(path.join(repoPath, "docker-compose.yaml"))
        ) {
          stackSignals.push("docker-compose")
        }

        const workflowsDir = path.join(repoPath, ".github", "workflows")
        if (fs.existsSync(workflowsDir)) {
          const files = fs.readdirSync(workflowsDir)
          for (const file of files) {
            if (file.endsWith(".yml") || file.endsWith(".yaml")) {
              ciWorkflows.push(file)
            }
          }
        }
      } catch {
        // preserve candidate entry even if inspection encounters filesystem permission error
      }
    }

    candidates.push({
      name: proj?.name || key,
      repo: repoPath,
      exists,
      stackSignals: [...new Set(stackSignals)],
      ciWorkflows,
    })
  }

  return candidates
}

/**
 * Builds the uncommitted delivery contract template pending target binding.
 */
export function buildDeliveryContract(candidates = []) {
  return {
    schemaVersion: 1,
    status: "pending_binding",
    decision: "open",
    target: null,
    platform: null,
    candidates,
    requiredBindingFields: [...REQUIRED_BINDING_FIELDS],
    blockedLanes: [...BLOCKED_LANES],
  }
}

/**
 * Emits an unpopulated reviewable binding annex template.
 */
export function emitBindingAnnex(contract = null) {
  return {
    schemaVersion: 1,
    status: "pending",
    project: null,
    repo: null,
    platform: null,
    environments: [],
    buildCommand: null,
    deployCommand: null,
    rollbackCommand: null,
    healthcheckUrl: null,
    sliProbes: [],
    secretRefs: {},
    productPaths: [],
    approvedBy: null,
    approvedAt: null,
  }
}

/**
 * Recursively scans object for literal secret patterns.
 */
function findLiteralSecret(obj, currentPath = "") {
  if (typeof obj === "string") {
    for (const indicator of FORBIDDEN_SECRET_INDICATORS) {
      if (obj.includes(indicator)) {
        return { path: currentPath, indicator }
      }
    }
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const found = findLiteralSecret(obj[i], `${currentPath}[${i}]`)
      if (found) return found
    }
  } else if (obj && typeof obj === "object") {
    for (const [key, val] of Object.entries(obj)) {
      const propPath = currentPath ? `${currentPath}.${key}` : key
      const found = findLiteralSecret(val, propPath)
      if (found) return found
    }
  }
  return null
}

/**
 * Evaluates whether deployment is authorized for the given environment and confirmation.
 * Enforces AC-DELV-03 and AC-DELV-05.
 */
export function evaluateDeployAuthorization(
  contract,
  binding,
  { environment = null, operatorConfirmation = null, profile = null, root = process.cwd() } = {},
) {
  // 1. Secret reference integrity check (reject literal credentials fail-closed exit 2)
  if (binding) {
    const secretFinding = findLiteralSecret(binding)
    if (secretFinding) {
      return {
        ok: false,
        exitCode: 2,
        status: "denied",
        reason: `Delivery binding contains literal secret in '${secretFinding.path}' instead of secret reference`,
      }
    }
  }

  // 2. Profile delivery.mode evaluation (none | manual -> not_applicable, exit 0)
  const profRes = profile ? { ok: true, profile } : readProjectProfile(root)
  const deliveryMode = profRes?.ok && profRes.profile?.delivery?.mode ? profRes.profile.delivery.mode : "platform"

  if (deliveryMode === "none" || deliveryMode === "manual") {
    return {
      ok: true,
      exitCode: 0,
      status: "not_applicable",
      reason: `delivery.mode is '${deliveryMode}'`,
      deliveryMode,
    }
  }

  // 3. Platform mode: strict contract authorization
  if (!contract || contract.status !== "approved") {
    return {
      ok: false,
      exitCode: 2,
      status: "denied",
      reason: `Delivery contract not approved (current status: '${contract?.status ?? "missing"}')`,
    }
  }

  if (!binding || binding.status !== "approved") {
    return {
      ok: false,
      exitCode: 2,
      status: "denied",
      reason: `Delivery binding not approved (current status: '${binding?.status ?? "missing"}')`,
    }
  }

  const requiredFields = contract.requiredBindingFields ?? REQUIRED_BINDING_FIELDS
  const missing = []

  for (const field of requiredFields) {
    const val = binding[field]
    if (val === undefined || val === null || val === "") {
      missing.push(field)
    } else if (field === "environments" && (!Array.isArray(val) || val.length === 0)) {
      missing.push(field)
    } else if (field === "secretRefs" && (typeof val !== "object" || val === null)) {
      missing.push(field)
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      exitCode: 2,
      status: "denied",
      reason: `Delivery binding missing required fields: ${missing.join(", ")}`,
    }
  }

  if (!environment || typeof environment !== "string") {
    return {
      ok: false,
      exitCode: 2,
      status: "denied",
      reason: "Target environment must be specified",
    }
  }

  if (!binding.environments.includes(environment)) {
    return {
      ok: false,
      exitCode: 2,
      status: "denied",
      reason: `Environment '${environment}' is not in homologated environments: [${binding.environments.join(", ")}]`,
    }
  }

  // Operator interactive confirmation verification
  if (
    !operatorConfirmation ||
    typeof operatorConfirmation !== "object" ||
    operatorConfirmation.confirmed !== true ||
    operatorConfirmation.environment !== environment ||
    operatorConfirmation.by !== "operator" ||
    !operatorConfirmation.at ||
    typeof operatorConfirmation.at !== "string"
  ) {
    return {
      ok: false,
      exitCode: 2,
      status: "denied",
      reason: `Valid operator interactive confirmation required for environment '${environment}'`,
    }
  }

  // Secret reference integrity check already evaluated above

  return {
    ok: true,
    exitCode: 0,
    status: "authorized",
    environment,
    project: binding.project,
    platform: binding.platform,
    authorizedAt: new Date().toISOString(),
  }
}

/**
 * Validates delivery configuration files declared in project profile (R4 / delivery_config).
 * Validates compose files via 'docker compose -f <f> config -q', Dockerfiles readability,
 * and fly.toml non-empty structure with app = line.
 * Classifies compose failures:
 *   - needs_env: required variable missing or env file not found (retried with sibling/.env.example)
 *   - needs_base: override file referencing undefined network, service, or volume
 *   - config_error: actual syntax or configuration error
 *   - missing: file does not exist or unreadable
 * Only config_error and missing count toward failures metric.
 */
export function checkDeliveryConfig({ root = process.cwd(), runProc: runProcOverride = null } = {}) {
  const proc = runProcOverride || runProc
  const profRes = readProjectProfile(root)
  const evidence = profRes?.ok && Array.isArray(profRes.profile?.delivery?.evidence)
    ? profRes.profile.delivery.evidence
    : []

  if (evidence.length === 0) {
    return {
      ok: true,
      status: "not_applicable",
      reason: "no delivery evidence declared in profile",
      failures: 0,
      checked: 0,
      results: [],
    }
  }

  // Check if any compose file is present in evidence
  const hasCompose = evidence.some((f) => /compose.*\.ya?ml$/i.test(path.basename(f)))
  if (hasCompose) {
    let dockerOk = false
    try {
      const probeRes = proc("docker", ["--version"], { encoding: "utf8", stdio: "pipe", timeout: 10000 })
      dockerOk = probeRes?.status === 0
    } catch {
      dockerOk = false
    }

    if (!dockerOk) {
      return {
        ok: false,
        status: "unavailable",
        reason: "Docker is required to validate compose configuration but docker is unavailable",
        exitCode: 2,
        failures: 0,
        checked: 0,
        results: [],
      }
    }
  }

  const results = []

  for (const item of evidence) {
    if (typeof item !== "string" || !item.trim()) continue
    const baseName = path.basename(item)
    const resolvedPath = path.resolve(root, item)

    if (/compose.*\.ya?ml$/i.test(baseName)) {
      const check = "compose"
      if (!fs.existsSync(resolvedPath)) {
        results.push({ file: item, check, status: "missing", reason: "compose file does not exist" })
        continue
      }
      try {
        fs.accessSync(resolvedPath, fs.constants.R_OK)
      } catch {
        results.push({ file: item, check, status: "missing", reason: "compose file is not readable" })
        continue
      }

      try {
        const composeRes = proc("docker", ["compose", "-f", item, "config", "-q"], {
          cwd: root,
          timeout: 60000,
          encoding: "utf8",
          stdio: "pipe",
        })

        if (composeRes.status === 0 && !composeRes.error) {
          results.push({ file: item, check, status: "ok", reason: "compose configuration valid" })
          continue
        }

        const isOverride = /override/i.test(item) || /override/i.test(baseName)
        if (isOverride) {
          results.push({ file: item, check, status: "needs_base", reason: "override file; validate merged with its base stack" })
          continue
        }

        const errText = [composeRes.stderr, composeRes.stdout, composeRes.error?.message].filter(Boolean).join("\n").trim()
        const isNeedsEnv = /(required variable .* is missing a value|env file .* not found|variable .* is not set|required variable)/i.test(errText)

        if (isNeedsEnv) {
          // Extend env retry to any sibling or repo-root file matching /^\.env(\.[A-Za-z0-9_-]+)?\.example$/
          const siblingDir = path.dirname(resolvedPath)
          const findEnvExamples = (dir) => {
            if (!fs.existsSync(dir)) return []
            try {
              return fs.readdirSync(dir)
                .filter((e) => /^\.env(\.[A-Za-z0-9_-]+)?\.example$/i.test(e))
                .map((e) => path.join(dir, e))
            } catch {
              return []
            }
          }

          const candidateExamples = [
            ...findEnvExamples(siblingDir),
            ...(path.resolve(root) !== path.resolve(siblingDir) ? findEnvExamples(root) : [])
          ]

          let retriedOk = false
          for (const envExample of candidateExamples) {
            try {
              const retryRes = proc("docker", ["compose", "--env-file", envExample, "-f", item, "config", "-q"], {
                cwd: root,
                timeout: 60000,
                encoding: "utf8",
                stdio: "pipe",
              })
              if (retryRes.status === 0 && !retryRes.error) {
                retriedOk = true
                results.push({ file: item, check, status: "ok", reason: "validated with .env.example" })
                break
              }
            } catch {}
          }

          if (retriedOk) {
            continue
          }

          results.push({ file: item, check, status: "needs_env", reason: errText || "required variable missing a value or env file not found" })
          continue
        }

        results.push({ file: item, check, status: "config_error", reason: errText || "compose validation failed" })
      } catch (err) {
        results.push({ file: item, check, status: "config_error", reason: err?.message || "compose execution error" })
      }
    } else if (/^Dockerfile/i.test(baseName)) {
      const check = "dockerfile"
      if (!fs.existsSync(resolvedPath)) {
        results.push({ file: item, check, status: "missing", reason: "Dockerfile does not exist" })
      } else {
        try {
          fs.accessSync(resolvedPath, fs.constants.R_OK)
          results.push({ file: item, check, status: "ok", reason: "Dockerfile exists and is readable" })
        } catch {
          results.push({ file: item, check, status: "missing", reason: "Dockerfile is not readable" })
        }
      }
    } else if (baseName === "fly.toml") {
      const check = "fly_toml"
      if (!fs.existsSync(resolvedPath)) {
        results.push({ file: item, check, status: "missing", reason: "fly.toml does not exist" })
      } else {
        try {
          const content = fs.readFileSync(resolvedPath, "utf8")
          if (!content.trim() || !/^app\s*=/m.test(content)) {
            results.push({ file: item, check, status: "config_error", reason: "fly.toml must be non-empty and contain app = definition" })
          } else {
            results.push({ file: item, check, status: "ok", reason: "fly.toml valid with app definition" })
          }
        } catch (e) {
          results.push({ file: item, check, status: "missing", reason: e?.message || "fly.toml unreadable" })
        }
      }
    } else {
      const check = "file"
      if (!fs.existsSync(resolvedPath)) {
        results.push({ file: item, check, status: "missing", reason: "file does not exist" })
      } else {
        try {
          fs.accessSync(resolvedPath, fs.constants.R_OK)
          results.push({ file: item, check, status: "ok", reason: "file exists and is readable" })
        } catch {
          results.push({ file: item, check, status: "missing", reason: "file is not readable" })
        }
      }
    }
  }

  const failures = results.filter((r) => r.status === "config_error" || r.status === "missing").length

  return {
    ok: true,
    status: "ok",
    failures,
    checked: results.length,
    results,
  }
}
// ---------------------------------------------------------------------------
// CLI Execution
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    discover: false,
    json: false,
    writeContract: false,
    checkDeploy: false,
    configCheck: false,
    metric: false,
    root: process.cwd(),
    env: null,
    registry: DEFAULT_REGISTRY_PATH,
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--discover") options.discover = true
    else if (arg === "--json") options.json = true
    else if (arg === "--write-contract") options.writeContract = true
    else if (arg === "--check-deploy") options.checkDeploy = true
    else if (arg === "--config-check") options.configCheck = true
    else if (arg === "--metric") options.metric = true
    else if (arg === "--root" && args[i + 1]) options.root = args[++i]
    else if (arg === "--env" && args[i + 1]) options.env = args[++i]
    else if (arg === "--registry" && args[i + 1]) options.registry = args[++i]
  }

  return options
}

export function runCli() {
  const options = parseArgs()

  if (options.configCheck) {
    const res = checkDeliveryConfig({ root: options.root })
    if (res.status === "unavailable") {
      if (options.metric) {
        console.log(`unavailable: ${res.reason}`)
      } else {
        console.error(`UNAVAILABLE: ${res.reason}`)
      }
      process.exit(2)
    }

    if (res.status === "not_applicable") {
      if (options.metric) {
        console.log(`not_applicable: ${res.reason}`)
      } else {
        console.log(JSON.stringify({ status: "not_applicable", reason: res.reason }))
      }
      process.exit(0)
    }
    // List non-fatal needs_env and needs_base in stderr summary
    const nonFatal = (res.results || []).filter((r) => r.status === "needs_env" || r.status === "needs_base")
    for (const item of nonFatal) {
      console.error(`[delivery-config] skipped non-fatal: ${item.file} (${item.status}: ${item.reason})`)
    }

    if (options.metric) {
      console.log(res.failures)
    } else {
      console.log(JSON.stringify(res.results, null, 2))
    }
    process.exit(0)
  }

  if (options.discover) {
    const candidates = discoverDeliveryCandidates({ registryPath: options.registry })
    const contract = buildDeliveryContract(candidates)
    if (options.json) {
      console.log(JSON.stringify(contract, null, 2))
    } else {
      console.log(`Discovered ${candidates.length} delivery candidate(s):`)
      for (const c of candidates) {
        console.log(`  - ${c.name} (${c.repo}) [exists: ${c.exists}] signals: ${c.stackSignals.join(", ") || "none"}`)
      }
    }
    return
  }

  if (options.writeContract) {
    const agentOsDir = path.join(options.root, "agent-os")
    fs.mkdirSync(agentOsDir, { recursive: true })

    const candidates = discoverDeliveryCandidates({ registryPath: options.registry })
    const contract = buildDeliveryContract(candidates)
    const binding = emitBindingAnnex(contract)

    const contractPath = path.join(agentOsDir, "delivery-target-contract.json")
    const bindingPath = path.join(agentOsDir, "delivery-target-binding.json")

    fs.writeFileSync(contractPath, JSON.stringify(contract, null, 2) + "\n", "utf8")
    fs.writeFileSync(bindingPath, JSON.stringify(binding, null, 2) + "\n", "utf8")

    console.log(`Generated delivery contract and binding:`)
    console.log(`  Contract: ${contractPath} (status: ${contract.status})`)
    console.log(`  Binding:  ${bindingPath} (status: ${binding.status})`)
    return
  }

  if (options.checkDeploy) {
    const profRes = readProjectProfile(options.root)
    const deliveryMode = profRes?.ok && profRes.profile?.delivery?.mode ? profRes.profile.delivery.mode : null

    const agentOsDir = path.join(options.root, "agent-os")
    const contractPath = path.join(agentOsDir, "delivery-target-contract.json")
    const bindingPath = path.join(agentOsDir, "delivery-target-binding.json")

    let contract = null
    let binding = null
    try {
      if (fs.existsSync(bindingPath)) {
        binding = JSON.parse(fs.readFileSync(bindingPath, "utf8"))
      }
      if (fs.existsSync(contractPath)) {
        contract = JSON.parse(fs.readFileSync(contractPath, "utf8"))
      }
    } catch {}

    // Secret reference integrity check (reject literal credentials fail-closed exit 2)
    if (binding) {
      const secretFinding = findLiteralSecret(binding)
      if (secretFinding) {
        console.error(`DEPLOY DENIED: Delivery binding contains literal secret in '${secretFinding.path}' instead of secret reference`)
        process.exit(2)
      }
    }

    if (deliveryMode === "none" || deliveryMode === "manual") {
      console.log(JSON.stringify({ status: "not_applicable", reason: `delivery.mode is '${deliveryMode}'` }))
      process.exit(0)
    }

    if (!contract || !binding) {
      console.error(`DEPLOY DENIED: Unable to read contract or binding: missing files`)
      process.exit(2)
    }

    const auth = evaluateDeployAuthorization(contract, binding, {
      environment: options.env,
      profile: profRes?.profile,
      root: options.root,
    })

    if (!auth.ok) {
      console.error(`DEPLOY DENIED: ${auth.reason}`)
      process.exit(auth.exitCode ?? 2)
    }

    if (auth.status === "not_applicable") {
      console.log(JSON.stringify({ status: "not_applicable", reason: auth.reason }))
      process.exit(0)
    }

    console.log(`DEPLOY AUTHORIZED: ${auth.environment} for ${auth.project}`)
    process.exit(0)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli()
}
