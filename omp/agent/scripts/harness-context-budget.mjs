import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { cursorRoot, globalOpenCodeRoot, listFiles, pathExists } from "./harness-common.mjs"

const MAX_REJECTED_RULES = 50
const PROMOTED_ENFORCEMENTS = new Set(["lint", "test", "gate_metric"])

function valueOf(argv, flag, fallback = null) {
  const index = argv.indexOf(flag)
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : fallback
}

function countSkillDirs(root) {
  return pathExists(root) ? listFiles(root, (file) => path.basename(file) === "SKILL.md").length : 0
}

function countFiles(root, pattern) {
  return pathExists(root) ? listFiles(root, (file) => pattern.test(file)).length : 0
}

function readJson(root, relativePath) {
  const file = path.join(root, relativePath)
  if (!pathExists(file)) return { value: null, file }
  try {
    return { value: JSON.parse(fs.readFileSync(file, "utf8")), file }
  } catch (error) {
    return { value: null, file, error: error.code ?? "INVALID_JSON" }
  }
}

function countPromotedInstructionSlots(root) {
  const { value, file, error } = readJson(root, path.join("agent-os", "learned-rules.json"))
  if (error) return { count: 0, file, error }
  const rules = Array.isArray(value?.rules) ? value.rules : []
  const count = rules.filter((rule) => rule?.status === "active" && PROMOTED_ENFORCEMENTS.has(rule?.enforcement)).length
  return { count, file }
}

function rejectedRuleCount(root) {
  const { value, file, error } = readJson(root, path.join("agent-os", "rejected-rules.json"))
  if (error) return { count: 0, file, error }
  const entries = Array.isArray(value?.entries) ? value.entries : []
  return { count: entries.length, file }
}

function configuredSlotCeiling(root) {
  const { value, file, error } = readJson(root, path.join("agent-os", "quality-thresholds.json"))
  const ceiling = value?.learned_rules?.max_active_rules_per_target
  if (error) return { ceiling: null, file, error }
  if (!Number.isInteger(ceiling) || ceiling < 1) return { ceiling: null, file, error: "INVALID_SLOT_CEILING" }
  return { ceiling, file }
}

export function buildReport(root = process.cwd()) {
  const projectRoot = path.resolve(root)
  const slots = countPromotedInstructionSlots(projectRoot)
  const rejected = rejectedRuleCount(projectRoot)
  const ceiling = configuredSlotCeiling(projectRoot)
  const errors = [slots, rejected, ceiling].filter((reading) => reading.error).map((reading) => `${reading.file}:${reading.error}`)
  const slotBudgetWithinCeiling = ceiling.ceiling !== null && slots.count <= ceiling.ceiling
  const rejectionBudgetWithinCeiling = rejected.count <= MAX_REJECTED_RULES

  const report = {
    status: errors.length > 0 ? "WARN" : slotBudgetWithinCeiling && rejectionBudgetWithinCeiling ? "PASS" : "FAIL",
    root: projectRoot,
    projectSkills: countSkillDirs(path.join(projectRoot, ".opencode", "skills")),
    cursorSkills: countSkillDirs(path.join(projectRoot, ".cursor", "skills")),
    globalOpenCodeSkills: countSkillDirs(path.join(globalOpenCodeRoot(), "skills")),
    globalCursorSkills: countSkillDirs(path.join(cursorRoot(), "skills")),
    globalCursorPluginSkills: countSkillDirs(path.join(cursorRoot(), "plugins", "local", "harness-engineering", "skills")),
    projectPlugins: countFiles(path.join(projectRoot, ".opencode", "plugins"), /\.(ts|js)$/),
    globalOpenCodePlugins: countFiles(path.join(globalOpenCodeRoot(), "plugins"), /\.(ts|js)$/),
    projectCommands: pathExists(path.join(projectRoot, ".opencode", "opencode.json")) ? "configured" : "missing",
    globalCommands: pathExists(path.join(globalOpenCodeRoot(), "opencode.jsonc")) ? "configured" : "missing",
    promotedInstructionSlots: slots.count,
    promotedInstructionSlotCeiling: ceiling.ceiling,
    slotBudgetWithinCeiling,
    rejectedProposalCount: rejected.count,
    rejectedProposalCeiling: MAX_REJECTED_RULES,
    rejectionBudgetWithinCeiling,
    errors,
    recommendations: [
      "Load only relevant harness skills for the active PREVC phase.",
      "Prefer scripts over always-on MCPs for audits and inventory.",
      "Keep Cursor parity skills minimal and do not duplicate /goal state.",
    ],
  }
  if (report.status !== "FAIL") {
    if (report.projectSkills + report.globalOpenCodeSkills > 120) report.status = "WARN"
    if (report.projectPlugins + report.globalOpenCodePlugins > 16) report.status = "WARN"
  }
  return report
}

export function runCli(argv = process.argv.slice(2)) {
  const root = valueOf(argv, "--root", process.cwd())
  const report = buildReport(root)
  console.log(JSON.stringify(report, null, 2))
  return report.status === "FAIL" ? 1 : 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = runCli()
}
