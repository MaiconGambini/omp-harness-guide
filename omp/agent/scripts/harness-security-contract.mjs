// harness-security-contract — generic RLS/IDOR controls presence check (R2).
//
// The harness ships the contract template and enforces CONTRACT PRESENCE +
// DECLARED-EVIDENCE EXISTENCE only. It never invents application-specific tenant
// isolation, RLS, or IDOR semantics: a project fills `agent-os/security-contract.json`
// with its own evidence paths (tenant-isolation / RLS policy files, protected-route
// authorization tests, IDOR regression cases) and this script verifies each declared
// path exists inside the repository. Projects without the contract — or with the
// contract declaring zero evidence paths (the unfilled template) — get a named
// `unavailable` gap, never a pass.

// Three-way result (gate metric `authz_controls` via commands.authz):
//   ok          — contract present, >=1 declared evidence path, all exist   → value 0
//   violation   — contract present, >=1 declared evidence path missing      → value = count
//   unavailable — no contract file, or a contract declaring zero evidence paths
//                 (named gap, observe-mode: never green by itself)
//   malformed   — contract exists but is not structurally valid            → unavailable
//                 (a broken declaration is a gap, not a measured violation)

//
// --metric output contract (commands.authz): the LAST non-empty line is the
// missing-evidence count. The unavailable/malformed states print lines with NO digits
// so the gate's lastNumber adapter reports the named gap, never a forged number.
//
// Read-only: never writes, never executes declared paths, never resolves them outside
// the repo root (a declared path that escapes the root is a violation, not a read).

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { redactSensitiveText } from "./harness-common.mjs"

const CONTRACT_PATH = path.join("agent-os", "security-contract.json")

// Evidence-bearing fields of the contract. The harness checks EXISTENCE of each
// declared path; it deliberately has no knowledge of what RLS/IDOR semantics are.
const EVIDENCE_FIELDS = ["policyFiles", "rlsPolicies", "authzTests", "regressionCases"]

const safePath = (value) => redactSensitiveText(String(value ?? ""))

function resolveInsideRoot(root, declared) {
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
    return { status: "unavailable", reason: `${CONTRACT_PATH.replace(/\\/g, "/")} is not parseable JSON — a malformed contract is a gap, never a measured violation`, missing: [] }
  }
  if (contract === null || typeof contract !== "object" || contract.schemaVersion !== 1) {
    return { status: "unavailable", reason: `${CONTRACT_PATH.replace(/\\/g, "/")} is not a schemaVersion:1 contract — a malformed declaration is a gap, never a measured violation`, missing: [] }
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
        return { status: "unavailable", reason: `${CONTRACT_PATH.replace(/\\/g, "/")}#${section}.${field} is not an array — a malformed declaration is a gap, never a measured violation`, missing: [] }
      }
      declaredCount += declared.length
      for (const entry of declared) {
        if (typeof entry !== "string" || !entry.trim()) {
          missing.push(`${section}.${field}: <empty declared path>`)
          continue
        }
        const resolved = resolveInsideRoot(root, entry)
        if (resolved === null || !fs.existsSync(resolved)) {
          missing.push(`${section}.${field}: ${entry}`)
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

function printMetric(report) {
  if (report.status === "unavailable") {
    // No digits anywhere: the gate's lastNumber adapter reports the named gap.
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

function runCli() {
  const args = process.argv.slice(2)
  const valueOf = (flag) => {
    const index = args.indexOf(flag)
    return index !== -1 && args[index + 1] ? args[index + 1] : null
  }
  const root = path.resolve(valueOf("--root") ?? process.cwd())
  const report = inspectContract(root)
  if (args.includes("--metric")) {
    printMetric(report)
  } else {
    console.log(JSON.stringify({ ...report, contract: CONTRACT_PATH.replace(/\\/g, "/") }, null, 2))
  }
  if (report.status === "violation") process.exitCode = 1
  else if (report.status === "unavailable") process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli()
