// harness-security-contract — generic RLS/IDOR controls presence and execution check (R2).
//
// Static mode (--metric): verifies declared evidence path existence.
// Execution mode (--run --metric): executes authz/IDOR/tenant test suites and verifies RLS policies.

import fs from "node:fs"
import net from "node:net"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import { redactSensitiveText } from "./harness-common.mjs"
import { validateRunnerCommand } from "./harness-eval-runner.mjs"
import { readProjectProfile } from "./harness-project-profile.mjs"

const defaultRunProc = spawnSync

const CONTRACT_PATH = path.join("agent-os", "security-contract.json")
const EVIDENCE_FIELDS = ["policyFiles", "rlsPolicies", "authzTests", "regressionCases", "tests"]
const ENV_KEY_RE = /^[A-Z_][A-Z0-9_]*$/
const IDENT_RE = /^[A-Za-z0-9_.-]{1,63}$/
export const RLS_COUNT_QUERY = "SELECT count(*) FROM pg_tables WHERE schemaname = :'schema' AND rowsecurity = false;\n"
export const RLS_AUDIT_QUERY = "SELECT tablename FROM pg_tables WHERE schemaname = :'schema' AND rowsecurity = false ORDER BY tablename;\n"

export function parseDotenv(content) {
  const env = {}
  const lines = String(content ?? "").split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const eqIdx = line.indexOf("=")
    if (eqIdx === -1) continue
    const key = line.slice(0, eqIdx).trim()
    if (!ENV_KEY_RE.test(key)) continue
    let val = line.slice(eqIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    env[key] = val
  }
  return env
}

export function hasSkippedTests(output) {
  const text = String(output ?? "")
  // go: a line starting with '--- SKIP'
  if (/(?:^|\n)\s*---\s*SKIP\b/.test(text)) return true
  // pytest: /\b\d+ skipped\b/
  const pytestMatch = text.match(/\b(\d+)\s+skipped\b/)
  if (pytestMatch && parseInt(pytestMatch[1], 10) > 0) return true
  // node --test: /^# skipped [1-9]/m or spec reporter 'ℹ skipped [1-9]' or '# SKIP'
  if (/(?:^|\n)\s*(?:#|ℹ)\s*skipped\s+[1-9]\d*/im.test(text) || /\b#\s*SKIP\b/.test(text)) return true
  return false
}

export function defaultTcpCheck(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let settled = false
    const onDone = (ok) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once("connect", () => onDone(true))
    socket.once("timeout", () => onDone(false))
    socket.once("error", () => onDone(false))
    try {
      socket.connect(port, host)
    } catch {
      onDone(false)
    }
  })
}

function parseCommandTokens(cmd) {
  const tokens = []
  let current = ""
  let inQuote = null
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]
    if (inQuote !== null) {
      if (ch === inQuote) inQuote = null
      else current += ch
    } else {
      if (ch === '"' || ch === "'") inQuote = ch
      else if (ch === " ") {
        if (current.length) {
          tokens.push(current)
          current = ""
        }
      } else {
        current += ch
      }
    }
  }
  if (current.length) tokens.push(current)
  return tokens
}

function resolveInsideRoot(root, declared) {
  if (typeof declared !== "string" || !declared.trim()) return null
  const resolved = path.resolve(root, declared)
  const relative = path.relative(path.resolve(root), resolved)
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) return null
  return resolved
}

export function inspectContract(root) {
  const contractFile = path.join(root, CONTRACT_PATH)
  if (!fs.existsSync(contractFile)) {
    return {
      status: "unavailable",
      reason: `no ${CONTRACT_PATH.replace(/\\/g, "/")} — the project has no declared tenant-isolation/authorization evidence; a named gap, not a pass and not a violation`,
      missing: [],
    }
  }
  let contract
  try {
    contract = JSON.parse(fs.readFileSync(contractFile, "utf8"))
  } catch (error) {
    return {
      status: "unavailable",
      reason: `${CONTRACT_PATH.replace(/\\/g, "/")} is not parseable JSON — a malformed contract is a gap, never a measured violation`,
      missing: [],
    }
  }
  if (contract === null || typeof contract !== "object" || contract.schemaVersion !== 1) {
    return {
      status: "unavailable",
      reason: `${CONTRACT_PATH.replace(/\\/g, "/")} is not a schemaVersion:1 contract — a malformed declaration is a gap, never a measured violation`,
      missing: [],
    }
  }
  const missing = []
  let declaredCount = 0
  for (const section of ["tenantIsolation", "protectedRoutes", "idor"]) {
    const block = contract[section]
    if (block === null || typeof block !== "object") continue
    for (const field of EVIDENCE_FIELDS) {
      const declared = block[field]
      if (declared === undefined) continue
      if (!Array.isArray(declared)) {
        return {
          status: "unavailable",
          reason: `${CONTRACT_PATH.replace(/\\/g, "/")}#${section}.${field} is not an array — a malformed declaration is a gap, never a measured violation`,
          missing: [],
        }
      }
      declaredCount += declared.length
      for (const entry of declared) {
        const entryPath = typeof entry === "string" ? entry : (entry?.path ?? "")
        if (typeof entryPath !== "string" || !entryPath.trim()) {
          missing.push(`${section}.${field}: <empty declared path>`)
          continue
        }
        const resolved = resolveInsideRoot(root, entryPath)
        if (resolved === null || !fs.existsSync(resolved)) {
          missing.push(`${section}.${field}: ${entryPath}`)
        }
      }
    }
  }
  if (declaredCount === 0) {
    return {
      status: "unavailable",
      reason: `${CONTRACT_PATH.replace(/\\/g, "/")} declares zero evidence paths — an empty contract is a named gap, never a pass`,
      missing: [],
    }
  }
  return {
    status: missing.length ? "violation" : "ok",
    missing,
    declared: EVIDENCE_FIELDS.reduce((acc, field) => {
      acc[field] = (contract.tenantIsolation?.[field] ?? []).length
        + (contract.protectedRoutes?.[field] ?? []).length
        + (contract.idor?.[field] ?? []).length
      return acc
    }, {}),
  }
}

export async function executeSecurityContract(root, { runProc = defaultRunProc, tcpCheck = defaultTcpCheck } = {}) {
  const contractFile = path.join(root, CONTRACT_PATH)
  if (!fs.existsSync(contractFile)) {
    return {
      status: "unavailable",
      reason: `no ${CONTRACT_PATH.replace(/\\/g, "/")} declared`,
      exitCode: 2,
      output: `unavailable: no ${CONTRACT_PATH.replace(/\\/g, "/")} declared`,
      failureCount: 0,
    }
  }

  let contract
  try {
    contract = JSON.parse(fs.readFileSync(contractFile, "utf8"))
  } catch (error) {
    return {
      status: "unavailable",
      reason: `${CONTRACT_PATH.replace(/\\/g, "/")} is not parseable JSON`,
      exitCode: 2,
      output: `unavailable: ${CONTRACT_PATH.replace(/\\/g, "/")} is not parseable JSON`,
      failureCount: 0,
    }
  }

  if (contract === null || typeof contract !== "object" || contract.schemaVersion !== 1) {
    return {
      status: "unavailable",
      reason: `${CONTRACT_PATH.replace(/\\/g, "/")} is not a schemaVersion:1 contract`,
      exitCode: 2,
      output: `unavailable: ${CONTRACT_PATH.replace(/\\/g, "/")} is not a schemaVersion:1 contract`,
      failureCount: 0,
    }
  }

  const executableEntries = []
  const sections = [
    { name: "protectedRoutes", field: "authzTests" },
    { name: "idor", field: "regressionCases" },
    { name: "tenantIsolation", field: "tests" },
  ]

  for (const { name, field } of sections) {
    const list = contract[name]?.[field]
    if (Array.isArray(list)) {
      for (const item of list) {
        if (typeof item === "string" && item.trim()) {
          executableEntries.push({
            section: name,
            field,
            path: item.trim(),
            command: null,
            requires: null,
            envFile: null,
            requireNoSkips: false,
          })
        } else if (item && typeof item === "object" && typeof item.path === "string" && item.path.trim()) {
          executableEntries.push({
            section: name,
            field,
            path: item.path.trim(),
            command: typeof item.command === "string" && item.command.trim() ? item.command.trim() : null,
            requires: Array.isArray(item.requires) ? item.requires : null,
            envFile: typeof item.envFile === "string" && item.envFile.trim() ? item.envFile.trim() : null,
            requireNoSkips: Boolean(item.requireNoSkips),
          })
        }
      }
    }
  }

  const rls = contract.tenantIsolation?.rls
  const isRlsRequired = Boolean(rls && rls.required === true)

  if (executableEntries.length === 0 && !isRlsRequired) {
    return {
      status: "not_applicable",
      reason: "no executable security evidence declared",
      exitCode: 0,
      output: "not_applicable: no executable security evidence declared",
      failureCount: 0,
    }
  }

  // Preflight TCP connectivity for requires
  for (const entry of executableEntries) {
    if (entry.requires) {
      for (const req of entry.requires) {
        if (!req || typeof req !== "object") continue
        const host = req.host || "localhost"
        const port = Number(req.port)
        if (!port || isNaN(port)) continue
        const reachable = await tcpCheck(host, port, 1500)
        if (!reachable) {
          return {
            status: "unavailable",
            reason: `service ${host}:${port} not reachable`,
            exitCode: 2,
            output: `unavailable: service ${host}:${port} not reachable`,
            failureCount: 0,
          }
        }
      }
    }
  }

  if (isRlsRequired && Array.isArray(rls.requires)) {
    for (const req of rls.requires) {
      if (!req || typeof req !== "object") continue
      const host = req.host || "localhost"
      const port = Number(req.port)
      if (!port || isNaN(port)) continue
      const reachable = await tcpCheck(host, port, 1500)
      if (!reachable) {
        return {
          status: "unavailable",
          reason: `service ${host}:${port} not reachable`,
          exitCode: 2,
          output: `unavailable: service ${host}:${port} not reachable`,
          failureCount: 0,
        }
      }
    }
  }

  // Preflight envFile check
  for (const entry of executableEntries) {
    if (entry.envFile) {
      const resolvedEnv = resolveInsideRoot(root, entry.envFile)
      if (!resolvedEnv || !fs.existsSync(resolvedEnv)) {
        return {
          status: "unavailable",
          reason: `envFile ${entry.envFile} not found or outside repository`,
          exitCode: 2,
          output: `unavailable: envFile ${entry.envFile} not found or outside repository`,
          failureCount: 0,
        }
      }
      try {
        const stat = fs.statSync(resolvedEnv)
        if (!stat.isFile()) {
          return {
            status: "unavailable",
            reason: `envFile ${entry.envFile} is not a regular file`,
            exitCode: 2,
            output: `unavailable: envFile ${entry.envFile} is not a regular file`,
            failureCount: 0,
          }
        }
      } catch {
        return {
          status: "unavailable",
          reason: `envFile ${entry.envFile} could not be inspected`,
          exitCode: 2,
          output: `unavailable: envFile ${entry.envFile} could not be inspected`,
          failureCount: 0,
        }
      }
    }
  }

  // Resolve component commands from profile
  const profileRes = readProjectProfile(root)
  const components = profileRes.ok && Array.isArray(profileRes.profile?.test?.components)
    ? profileRes.profile.test.components
    : []

  let failureCount = 0
  const diagnostics = []

  for (const entry of executableEntries) {
    const rawPath = entry.path
    const normPath = rawPath.replace(/\\/g, "/")
    const resolvedPath = resolveInsideRoot(root, rawPath)
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      failureCount += 1
      diagnostics.push(`missing file: ${normPath}`)
      continue
    }

    try {
      const stat = fs.statSync(resolvedPath)
      if (!stat.isFile()) {
        failureCount += 1
        diagnostics.push(`not a regular file: ${normPath}`)
        continue
      }
    } catch {
      failureCount += 1
      diagnostics.push(`cannot stat file: ${normPath}`)
      continue
    }

    // Longest prefix component matching
    let matchedComp = null
    let maxPrefixLen = -1

    for (const comp of components) {
      if (!comp) continue
      const compPrefix = (comp.path || comp.cwd || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
      if (!compPrefix) continue
      if (normPath === compPrefix || normPath.startsWith(compPrefix + "/")) {
        if (compPrefix.length > maxPrefixLen) {
          maxPrefixLen = compPrefix.length
          matchedComp = comp
        }
      }
    }

    const compDir = matchedComp
      ? path.resolve(root, matchedComp.cwd || matchedComp.path || ".")
      : root
    const relToComp = matchedComp
      ? path.relative(compDir, resolvedPath).replace(/\\/g, "/")
      : normPath

    let cmdToRun = null
    if (entry.command) {
      cmdToRun = entry.command
    } else if (matchedComp && matchedComp.command) {
      if (matchedComp.command.endsWith("./...")) {
        cmdToRun = `${matchedComp.command.slice(0, -5)} ./${relToComp}`
      } else {
        cmdToRun = `${matchedComp.command} ${relToComp}`
      }
    } else if (profileRes.ok && profileRes.profile?.test?.command) {
      const tc = profileRes.profile.test.command
      if (tc.endsWith("./...")) {
        cmdToRun = `${tc.slice(0, -5)} ./${normPath}`
      } else {
        cmdToRun = `${tc} ${normPath}`
      }
    } else {
      if (/\.(ts|tsx|js|mjs|cjs)$/i.test(normPath)) {
        cmdToRun = `node --test ${normPath}`
      } else if (/\.go$/i.test(normPath)) {
        cmdToRun = `go test ./${normPath}`
      } else if (/\.py$/i.test(normPath)) {
        cmdToRun = `pytest ${normPath}`
      } else {
        cmdToRun = `node --test ${normPath}`
      }
    }

    if (entry.requireNoSkips && /\bgo\s+test\b/.test(cmdToRun) && !/\s-v(\s|$)/.test(cmdToRun)) {
      cmdToRun = cmdToRun.replace(/\bgo\s+test\b/, "go test -v")
    }

    const validation = validateRunnerCommand(cmdToRun, { root })
    if (!validation.ok) {
      failureCount += 1
      diagnostics.push(`rejected command: ${cmdToRun} (${validation.reason})`)
      continue
    }

    const tokens = parseCommandTokens(cmdToRun)
    if (tokens.length === 0) {
      failureCount += 1
      diagnostics.push(`empty tokens for command: ${cmdToRun}`)
      continue
    }

    const childEnv = { ...process.env }
    for (const k of Object.keys(childEnv)) {
      if (k.startsWith("NODE_TEST_")) {
        delete childEnv[k]
      }
    }
    if (entry.envFile) {
      const resolvedEnv = resolveInsideRoot(root, entry.envFile)
      if (resolvedEnv && fs.existsSync(resolvedEnv)) {
        try {
          const parsed = parseDotenv(fs.readFileSync(resolvedEnv, "utf8"))
          Object.assign(childEnv, parsed)
        } catch {}
      }
    }

    const [bin, ...cmdArgs] = tokens
    let runRes
    try {
      runRes = runProc(bin, cmdArgs, {
        cwd: compDir,
        env: childEnv,
        encoding: "utf8",
        timeout: 60000,
        shell: false,
      })
    } catch (err) {
      failureCount += 1
      diagnostics.push(`execution error for ${normPath}: ${err.message}`)
      continue
    }

    const outText = (runRes?.stdout || "") + "\n" + (runRes?.stderr || "")
    const exitCode = typeof runRes?.status === "number" ? runRes.status : (runRes?.error ? 1 : 0)
    if (exitCode !== 0) {
      failureCount += 1
      diagnostics.push(`test failure (${exitCode}): ${normPath}`)
    } else if (entry.requireNoSkips && hasSkippedTests(outText)) {
      failureCount += 1
      diagnostics.push(`test skipped: ${normPath}`)
      process.stderr.write(`entry ${normPath}: skipped\n`)
    }
  }

  // RLS check
  if (isRlsRequired) {
    const schema = rls.schema || "public"
    const user = rls.user || "postgres"
    const database = rls.database || "postgres"
    const via = rls.via || "psql"
    const container = rls.container || ""

    if (
      !IDENT_RE.test(schema) ||
      !IDENT_RE.test(user) ||
      !IDENT_RE.test(database) ||
      (via === "docker" && !IDENT_RE.test(container))
    ) {
      failureCount += 1
      diagnostics.push(`invalid RLS identifier: schema=${schema} user=${user} database=${database} container=${container}`)
    } else {
      let prog = "psql"
      let args = []

      if (via === "docker") {
        prog = "docker"
        args = ["exec", "-i", container, "psql", "-U", user, "-d", database, "-v", `schema=${schema}`, "-tA", "-f", "-"]
      } else {
        prog = "psql"
        args = ["-U", user, "-d", database, "-v", `schema=${schema}`, "-tA", "-f", "-"]
        if (rls.host) args.push("-h", rls.host)
        if (rls.port) args.push("-p", String(rls.port))
      }

      let procRes
      try {
        procRes = runProc(prog, args, {
          input: RLS_COUNT_QUERY,
          encoding: "utf8",
          timeout: 15000,
          shell: false,
        })
      } catch (err) {
        failureCount += 1
        diagnostics.push(`RLS check execution failed: ${err.message}`)
      }

      if (procRes) {
        if (procRes.status === 0) {
          const num = parseInt((procRes.stdout || "").trim(), 10)
          if (!isNaN(num)) {
            failureCount += num
            if (num > 0) diagnostics.push(`${num} table(s) without RLS in schema '${schema}'`)
          } else {
            failureCount += 1
            diagnostics.push(`RLS check output unparseable: ${procRes.stdout}`)
          }
        } else {
          failureCount += 1
          diagnostics.push(`RLS query exited with ${procRes.status}`)
        }
      }
    }
  }

  return {
    status: "ok",
    failureCount,
    diagnostics,
    output: String(failureCount),
    exitCode: 0,
  }
}

export function auditRls(root, { runProc = defaultRunProc } = {}) {
  const contractFile = path.join(root, CONTRACT_PATH)
  if (!fs.existsSync(contractFile)) {
    return { status: "unavailable", reason: "no security contract", tables: [], output: "no security contract" }
  }
  let contract
  try {
    contract = JSON.parse(fs.readFileSync(contractFile, "utf8"))
  } catch {
    return { status: "unavailable", reason: "unparseable contract", tables: [], output: "unparseable contract" }
  }
  const rls = contract.tenantIsolation?.rls || {}
  const schema = rls.schema || "public"
  const user = rls.user || "postgres"
  const database = rls.database || "postgres"
  const via = rls.via || "psql"
  const container = rls.container || ""

  if (
    !IDENT_RE.test(schema) ||
    !IDENT_RE.test(user) ||
    !IDENT_RE.test(database) ||
    (via === "docker" && !IDENT_RE.test(container))
  ) {
    return { status: "invalid_input", reason: "invalid RLS identifier", tables: [], output: "invalid RLS identifier" }
  }

  let prog = "psql"
  let args = []

  if (via === "docker") {
    prog = "docker"
    args = ["exec", "-i", container, "psql", "-U", user, "-d", database, "-v", `schema=${schema}`, "-tA", "-f", "-"]
  } else {
    prog = "psql"
    args = ["-U", user, "-d", database, "-v", `schema=${schema}`, "-tA", "-f", "-"]
    if (rls.host) args.push("-h", rls.host)
    if (rls.port) args.push("-p", String(rls.port))
  }

  let procRes
  try {
    procRes = runProc(prog, args, { input: RLS_AUDIT_QUERY, encoding: "utf8", timeout: 15000, shell: false })
  } catch (err) {
    return { status: "unavailable", reason: err.message, tables: [], output: `audit failed: ${err.message}` }
  }

  if (!procRes || procRes.status !== 0) {
    return { status: "unavailable", reason: `psql exited with ${procRes ? procRes.status : "error"}`, tables: [], output: "RLS query failed" }
  }

  const lines = (procRes.stdout || "").trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return {
    status: "ok",
    schema,
    tables: lines,
    output: lines.length > 0 ? lines.join("\n") : `All tables in schema '${schema}' have row security enabled.`,
  }
}

function printMetric(report) {
  if (report.status === "unavailable") {
    console.log(redactSensitiveText(`status: unavailable\nreason: ${report.reason}`))
    return
  }
  const lines = [
    `status: ${report.status}`,
    `missing evidence: ${report.missing.length}`,
    ...(report.missing.length ? ["missing:", ...report.missing.map((entry) => `  - ${entry}`)] : []),
    String(report.missing.length),
  ]
  console.log(redactSensitiveText(lines.join("\n")))
}

async function runCli() {
  const args = process.argv.slice(2)
  const valueOf = (flag) => {
    const index = args.indexOf(flag)
    return index !== -1 && args[index + 1] ? args[index + 1] : null
  }
  const root = path.resolve(valueOf("--root") ?? process.cwd())

  if (args.includes("--rls-audit")) {
    const auditRes = auditRls(root)
    console.log(auditRes.output)
    process.exitCode = 0
    return
  }
  if (args.includes("--run")) {
    const execRes = await executeSecurityContract(root)
    if (args.includes("--metric")) {
      if (execRes.diagnostics && execRes.diagnostics.length > 0) {
        for (const diag of execRes.diagnostics) {
          process.stderr.write(`${diag}\n`)
        }
      }
      console.log(execRes.output)
      process.exitCode = execRes.exitCode
    } else {
      console.log(JSON.stringify(execRes, null, 2))
      process.exitCode = execRes.exitCode
    }
    return
  }

  const report = inspectContract(root)
  if (args.includes("--metric")) {
    printMetric(report)
  } else {
    console.log(JSON.stringify({ ...report, contract: CONTRACT_PATH.replace(/\\/g, "/") }, null, 2))
  }
  if (report.status === "violation") process.exitCode = 1
  else if (report.status === "unavailable") process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli()
}
