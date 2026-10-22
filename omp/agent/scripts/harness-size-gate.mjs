// Classify work before ceremony. Output is consumed by planner/PREVC routing.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export const ROUTES = ["fast-path", "prevc"]
export function routingPrompt(result) {
  if (result.route === "fast-path") {
    return `size_gate=${result.route}; execute focused work directly; skip PREVC, planner, scheduler, and panel ceremony.`
  }
  return `size_gate=${result.route}; retain PREVC lifecycle and planner/scheduler ceremony for ${result.size} work.`
}

export const HIGH_RISK_PATTERNS = [
  /quality-thresholds\.json/i,
  /(^|[\\/._\-\s])(auth|authenticate|authentication|authorization|jwt|crypto|credentials?|migrations?|thresholds?)(?:[\\/._\-\s]|$)/i,
]

export function isHighRiskFile(file) {
  const normalized = String(file).replace(/\\/g, "/")
  return HIGH_RISK_PATTERNS.some((pattern) => pattern.test(normalized))
}

export const COMPLEXITY_KEYWORDS =
  /(?:^|\P{L})(?:full|large|cross[- ]subsystem|multi[- ]agent|migration|migrations|migracao|migração|migrações|refactor|refactoring|refatorar|refatoração|refatoracao|rewrite|rewriting|reescrever)(?:\P{L}|$)/iu

export function classifySize({ files = [], objective = "", risk = "low", tasks = 0 } = {}) {
  const fileList = Array.isArray(files)
    ? files
    : typeof files === "string" && files.trim()
      ? files.split(",").map((v) => v.trim()).filter(Boolean)
      : []
  const count = fileList.length
  const normalizedRisk = String(risk ?? "low").toLowerCase()
  const isHighRisk = ["high", "untrusted"].includes(normalizedRisk)
  const hasHighRiskFiles = fileList.some((f) => isHighRiskFile(f))
  const hasComplexityKeyword = COMPLEXITY_KEYWORDS.test(String(objective ?? ""))
  const taskCount = Number.isFinite(Number(tasks)) ? Number(tasks) : 0
  const hasTooManyTasks = taskCount > 5

  const isFull =
    count > 5 ||
    isHighRisk ||
    hasHighRiskFiles ||
    hasComplexityKeyword ||
    hasTooManyTasks

  const isMedium =
    !isFull &&
    (count >= 4 ||
      normalizedRisk !== "low" ||
      /\b(medium|complex)\b/i.test(String(objective ?? "")))

  const size = isFull ? "full" : isMedium ? "medium" : "simple"
  const route = size === "simple" ? "fast-path" : "prevc"

  return { size, route, files: count, risk }
}

function parseFiles(args) {
  const values = []
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--file" && args[i + 1]) {
      values.push(args[++i])
    } else if (args[i] === "--files" && args[i + 1]) {
      values.push(...args[++i].split(",").map((v) => v.trim()).filter(Boolean))
    }
  }
  return values
}

function parseTasks(args) {
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--tasks" && args[i + 1]) {
      const parsed = parseInt(args[i + 1], 10)
      return Number.isFinite(parsed) ? parsed : 0
    }
  }
  return 0
}

function parseOption(args, flag, fallback = "") {
  const idx = args.indexOf(flag)
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback
}

export function routeFromArgs(args) {
  return classifySize({
    files: parseFiles(args),
    objective: parseOption(args, "--objective", ""),
    risk: parseOption(args, "--risk", "low"),
    tasks: parseTasks(args),
  })
}

export function runCli(argv = process.argv.slice(2)) {
  const result = routeFromArgs(argv)
  if (argv.includes("--prompt")) {
    console.log(routingPrompt(result))
  } else if (argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`${result.route}: ${result.size} (${result.files} file${result.files === 1 ? "" : "s"})`)
  }
  return result
}

export { runCli as cli }

const isEntrypoint = Boolean(
  process.argv[1] &&
    (path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase() ||
      import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
)

if (isEntrypoint) {
  runCli()
}
