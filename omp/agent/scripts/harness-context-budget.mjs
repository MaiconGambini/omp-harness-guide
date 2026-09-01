import path from "node:path"
import { cursorRoot, globalOpenCodeRoot, listFiles, pathExists } from "./harness-common.mjs"

function countSkillDirs(root) {
  return pathExists(root) ? listFiles(root, (file) => path.basename(file) === "SKILL.md").length : 0
}

function countFiles(root, pattern) {
  return pathExists(root) ? listFiles(root, (file) => pattern.test(file)).length : 0
}

const report = {
  status: "PASS",
  projectSkills: countSkillDirs(".opencode/skills"),
  cursorSkills: countSkillDirs(".cursor/skills"),
  globalOpenCodeSkills: countSkillDirs(path.join(globalOpenCodeRoot(), "skills")),
  globalCursorSkills: countSkillDirs(path.join(cursorRoot(), "skills")),
  globalCursorPluginSkills: countSkillDirs(path.join(cursorRoot(), "plugins", "local", "harness-engineering", "skills")),
  projectPlugins: countFiles(".opencode/plugins", /\.(ts|js)$/),
  globalOpenCodePlugins: countFiles(path.join(globalOpenCodeRoot(), "plugins"), /\.(ts|js)$/),
  projectCommands: pathExists(".opencode/opencode.json") ? "configured" : "missing",
  globalCommands: pathExists(path.join(globalOpenCodeRoot(), "opencode.jsonc")) ? "configured" : "missing",
  recommendations: [
    "Load only relevant harness skills for the active PREVC phase.",
    "Prefer scripts over always-on MCPs for audits and inventory.",
    "Keep Cursor parity skills minimal and do not duplicate /goal state.",
  ],
}

if (report.projectSkills + report.globalOpenCodeSkills > 120) report.status = "WARN"
if (report.projectPlugins + report.globalOpenCodePlugins > 16) report.status = "WARN"
console.log(JSON.stringify(report, null, 2))
