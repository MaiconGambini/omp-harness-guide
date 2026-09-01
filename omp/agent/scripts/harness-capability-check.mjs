// harness-capability-check — multimodal capability detection (R6).
//
// Reads runtime model catalogs when reachable (~/.omp/agent/models.db, table
// `model_cache`, provider prefix `opencode-go%`) and otherwise falls back to the frozen
// operator matrix from research.md. Catalog facts verified
// 2026-08-31:
//
//   deepseek-v4-flash input: ["text"]          catalog efforts: [low, high, max]
//   glm-5.3-flash    input: ["text","image"]  catalog efforts: [minimal, low, medium, high, xhigh]
//   gpt-5.6-luna     input: ["text","image"]  catalog efforts: [low, medium, high, xhigh, max]
//
// The operator-approved GLM Flash effort is max; the installed runtime accepted it
// in a live probe even though the catalog row omitted it. Runtime/catalog differences
// are persisted separately and never silently rewritten.
//
// Persists docs/harness/capabilities.json ({schemaVersion:1, updatedAt, source:
// runtime|static, models:[{id, input, efforts}]}) with a 24 h cache. READ-ONLY: never
// modifies catalogs, never probes models live (runtime acceptance of image input is the
// T14 probe, not this check).
//
// Dispatch contract (agent/scheduler.md + harness-omp skills): images belong in the
// main (spec-lead/scheduler-equivalent, image-capable) session by default; a dispatched
// glm-5.3-flash lane may receive an image only when its role explicitly permits it and
// the capability probe passes; a text-only subagent returns
// `blocked: multimodal-unsupported` — never strip, silently convert, or send an
// image-bearing payload through a text-only provider fallback.

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import { readJsonIfExists } from "./harness-quality-core.mjs"

const require = createRequire(import.meta.url)
export const CAPABILITIES_PATH = path.join("docs", "harness", "capabilities.json")
export const CACHE_HOURS = 24

// Frozen catalog facts (research.md, 2026-08-31). The static table is the offline
// contract; the runtime probe confirms or reports a contradiction, never invents facts.
export const STATIC_TABLE = [
  { id: "deepseek-v4-flash", input: ["text"], efforts: ["low", "high", "max"] },
  // D13 (operator-final) pins every GLM Flash assignment at `max`, superseding the
  // 2026-08-31 catalog snapshot that listed efforts without it.
  { id: "glm-5.3-flash", input: ["text", "image"], efforts: ["minimal", "low", "medium", "high", "xhigh", "max"], runtimeVerifiedEfforts: ["max"] },
  { id: "gpt-5.6-luna", input: ["text", "image"], efforts: ["low", "medium", "high", "xhigh", "max"] },
]

export function probeRuntimeCatalog(modelsDb = path.join(os.homedir(), ".omp", "agent", "models.db")) {
  if (!fs.existsSync(modelsDb)) return null
  let DatabaseSync
  try {
    ;({ DatabaseSync } = require("node:sqlite"))
  } catch {
    return null
  }
  try {
    const db = new DatabaseSync(modelsDb, { readOnly: true })
    const rows = db.prepare("SELECT models FROM model_cache WHERE provider_id LIKE 'opencode-go%'").all()
    db.close()
    const wanted = new Set(STATIC_TABLE.map((model) => model.id))
    const found = new Map()
    const duplicateContradictions = []
    for (const row of rows) {
      for (const model of JSON.parse(row.models ?? "[]")) {
        if (!wanted.has(model?.id)) continue
        const candidate = { id: model.id, input: model.input ?? null, efforts: model.thinking?.efforts ?? null }
        const previous = found.get(model.id)
        if (previous && JSON.stringify(previous.input) !== JSON.stringify(candidate.input)) {
          duplicateContradictions.push({ id: model.id, kind: "duplicate-input", previous: previous.input, runtime: candidate.input })
        }
        if (previous && JSON.stringify(previous.efforts) !== JSON.stringify(candidate.efforts)) {
          duplicateContradictions.push({ id: model.id, kind: "duplicate-effort", previous: previous.efforts, runtime: candidate.efforts })
        }
        found.set(model.id, candidate)
      }
    }
    if (found.size < wanted.size) return null
    const result = [...found.values()]
    Object.defineProperty(result, "contradictions", { value: duplicateContradictions, enumerable: false })
    return result
  } catch {
    return null
  }
}

// A runtime row CONTRADICTING the frozen table is a real signal: report it with the
// table (contradictions are surfaced, never silently resolved).
// A runtime row contradicting the operator table is reported without replacing the
// operator-approved effort contract. This keeps catalog facts and live policy distinct.
export function mergeWithStatic(runtime) {
  const byId = new Map(runtime.map((model) => [model.id, model]))
  const contradictions = [...(runtime?.contradictions ?? [])]
  const models = STATIC_TABLE.map((model) => {
    const live = byId.get(model.id)
    if (!live) return model
    if (JSON.stringify(live.input) !== JSON.stringify(model.input)) {
      contradictions.push({ id: model.id, kind: "input", static: model.input, runtime: live.input })
    }
    if (live.efforts && !model.efforts.every((effort) => live.efforts.includes(effort))) {
      contradictions.push({ id: model.id, kind: "effort", static: model.efforts, runtime: live.efforts })
    }
    return { ...model, catalogInput: live.input ?? null, catalogEfforts: live.efforts ?? null }
  })
  return { models, contradictions }
}

export function readCached(root, now = new Date()) {
  const data = readJsonIfExists(path.join(root, CAPABILITIES_PATH))
  if (!data?.updatedAt) return null
  const ageMs = now.getTime() - new Date(data.updatedAt).getTime()
  if (Number.isNaN(ageMs) || ageMs < 0 || ageMs > CACHE_HOURS * 3_600_000) return null
  return data
}

export function writeCapabilities(root, { source, models, contradictions, cached, now = new Date() }) {
  const target = path.join(root, CAPABILITIES_PATH)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const data = {
    schemaVersion: 1,
    updatedAt: now.toISOString(),
    source,
    cached: Boolean(cached),
    contradictions,
    models,
  }
  fs.writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`, "utf8")
  return data
}

export function runCapabilityCheck(root, { source: forced = null, now = new Date() } = {}) {
  if (forced === "static") {
    const data = writeCapabilities(root, { source: "static", models: STATIC_TABLE, contradictions: [], cached: false, now })
    return data
  }
  const cached = forced === "runtime" ? null : readCached(root, now)
  if (cached) return { ...cached, cached: true }

  const runtime = probeRuntimeCatalog()
  if (runtime) {
    const merged = mergeWithStatic(runtime)
    const data = writeCapabilities(root, { source: "runtime", ...merged, cached: false, now })
    return data
  }
  const data = writeCapabilities(root, { source: "static", models: STATIC_TABLE, contradictions: [], cached: false, now })
  return data
}

function runCli() {
  const args = process.argv.slice(2)
  const valueOf = (flag) => {
    const index = args.indexOf(flag)
    return index !== -1 && args[index + 1] ? args[index + 1] : null
  }
  const root = path.resolve(valueOf("--root") ?? process.cwd())
  const forced = valueOf("--source")
  if (forced && !["static", "runtime"].includes(forced)) {
    console.error('harness-capability-check: --source must be "static" or "runtime"')
    process.exitCode = 1
    return
  }
  try {
    const data = runCapabilityCheck(root, { source: forced })
    console.log(JSON.stringify(data, null, 2))
  } catch (error) {
    console.error(`harness-capability-check: ${error.message}`)
    process.exitCode = 2
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli()
