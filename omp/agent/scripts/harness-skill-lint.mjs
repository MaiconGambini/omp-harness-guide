import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
export const FORBIDDEN_KEYS = new Set([
  "run",
  "command",
  "execute",
  "tools",
  "permissions",
  "model",
])
export const TRIGGER_PATTERN = /(?<!\b(?:do\s+not|don't)\s+)use\s+(?:when|for|to)|\btrigger\b/i
export const NEGATIVE_SCOPE_PATTERN = /do\s+not\s+use|don't\s+use|not\s+for/i
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function resolveSkillsDir({ skillsDir = null, global = false, root = process.cwd(), fs: customFs = null } = {}) {
  const fsLayer = customFs ?? fs
  if (skillsDir) {
    const candidate = path.resolve(root, skillsDir)
    try {
      const st = fsLayer.statSync(candidate)
      if (st.isDirectory()) return candidate
    } catch {}
    return null
  }

  if (global) {
    const globalPath = path.join(os.homedir(), ".omp", "agent", "skills")
    try {
      const st = fsLayer.statSync(globalPath)
      if (st.isDirectory()) return globalPath
    } catch {}
    return null
  }

  const agentSkills = path.resolve(root, "agent", "skills")
  try {
    const st = fsLayer.statSync(agentSkills)
    if (st.isDirectory()) return agentSkills
  } catch {}

  const dotOmpSkills = path.resolve(root, ".omp", "skills")
  try {
    const st = fsLayer.statSync(dotOmpSkills)
    if (st.isDirectory()) return dotOmpSkills
  } catch {}

  return null
}

export function parseFrontmatter(content) {
  if (!content.startsWith("---")) {
    return { ok: false, error: "missing_frontmatter" }
  }

  const lines = content.split(/\r?\n/)
  let closingIndex = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closingIndex = i
      break
    }
  }

  if (closingIndex === -1) {
    return { ok: false, error: "unclosed_frontmatter" }
  }

  const fmLines = lines.slice(1, closingIndex)
  const fields = {}
  const rawFields = {}
  const forbiddenFound = []

  let currentKey = null
  let currentValLines = []

  function flushKey() {
    if (!currentKey) return
    const rawVal = currentValLines.join("\n")
    rawFields[currentKey] = rawVal
    const firstLine = currentValLines[0]?.trim() ?? ""
    const isBlockScalar = /^[>|]/.test(firstLine)
    const isMultiLine = currentValLines.length > 1

    let val = rawVal.trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }

    fields[currentKey] = {
      val,
      rawVal,
      isBlockScalar,
      isMultiLine,
    }
  }

  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i]
    const keyMatch = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/)
    if (keyMatch) {
      flushKey()
      currentKey = keyMatch[1]
      currentValLines = [keyMatch[2]]
      if (FORBIDDEN_KEYS.has(currentKey)) {
        forbiddenFound.push(currentKey)
      }
    } else if (currentKey) {
      currentValLines.push(line)
    }
  }
  flushKey()

  const bodyLines = lines.slice(closingIndex + 1)
  const body = bodyLines.join("\n")

  return {
    ok: true,
    fields,
    forbiddenFound,
    closingLine: closingIndex + 1,
    totalLines: lines.length,
    body,
  }
}

export function lintSkill(skillDirPath, skillName, { root = null, fs: customFs = null } = {}) {
  const fsLayer = customFs ?? fs
  const errors = []
  const warnings = []
  try {
    const lstat = fsLayer.lstatSync(skillDirPath)
    if (lstat.isSymbolicLink()) {
      warnings.push({
        skill: skillName,
        code: "symlinked_skill",
        message: `Skill "${skillName}" is a symlinked directory`,
      })
    }
  } catch {}

  if (!SLUG_PATTERN.test(skillName)) {
    errors.push({
      skill: skillName,
      code: "invalid_slug",
      message: `Directory "${skillName}" is not a valid lowercase kebab-case slug`,
    })
  }

  const skillMdPath = path.join(skillDirPath, "SKILL.md")
  if (!fsLayer.existsSync(skillMdPath)) {
    errors.push({
      skill: skillName,
      code: "missing_skill_md",
      message: `SKILL.md not found in directory "${skillName}"`,
    })
    return {
      skill: skillName,
      errors,
      warnings,
      lineCount: 0,
      descriptionChars: 0,
      hasTrigger: false,
      hasNegativeScope: false,
      hasXml: false,
      isMultiline: false,
    }
  }

  const content = fsLayer.readFileSync(skillMdPath, "utf8")
  const totalLines = content.split(/\r?\n/).length
  if (totalLines > 500) {
    errors.push({
      skill: skillName,
      code: "body_too_long",
      message: `SKILL.md exceeds 500 lines (${totalLines} lines)`,
    })
  }

  const fm = parseFrontmatter(content)
  if (!fm.ok) {
    errors.push({
      skill: skillName,
      code: "missing_frontmatter",
      message: `SKILL.md is missing valid YAML frontmatter`,
    })
    return {
      skill: skillName,
      errors,
      warnings,
      lineCount: totalLines,
      descriptionChars: 0,
      hasTrigger: false,
      hasNegativeScope: false,
      hasXml: false,
      isMultiline: false,
    }
  }

  for (const key of fm.forbiddenFound) {
    errors.push({
      skill: skillName,
      code: "forbidden_frontmatter_key",
      message: `Forbidden executable key "${key}" found in frontmatter`,
    })
  }

  const nameField = fm.fields.name
  if (!nameField || !nameField.val) {
    errors.push({
      skill: skillName,
      code: "missing_name",
      message: "Frontmatter is missing name",
    })
  } else if (nameField.val !== skillName) {
    errors.push({
      skill: skillName,
      code: "name_mismatch",
      message: `Frontmatter name "${nameField.val}" does not match directory slug "${skillName}"`,
    })
  }

  let descriptionChars = 0
  let hasTrigger = false
  let hasNegativeScope = false
  let hasXml = false
  let isMultiline = false

  const descField = fm.fields.description
  if (!descField || !descField.val) {
    errors.push({
      skill: skillName,
      code: "missing_description",
      message: "Frontmatter is missing description",
    })
  } else {
    const desc = descField.val
    descriptionChars = desc.length
    isMultiline = descField.isBlockScalar || descField.isMultiLine || descField.rawVal.includes("\n") || descField.rawVal.includes("\r")
    hasXml = desc.includes("<") || desc.includes(">")
    hasTrigger = TRIGGER_PATTERN.test(desc)
    hasNegativeScope = NEGATIVE_SCOPE_PATTERN.test(desc)

    if (isMultiline) {
      errors.push({
        skill: skillName,
        code: "multiline_description",
        message: "Description is multi-line or uses block scalar (> or |)",
      })
    }

    if (hasXml) {
      errors.push({
        skill: skillName,
        code: "xml_in_description",
        message: "Description contains XML angle brackets (< or >)",
      })
    }

    if (!hasTrigger) {
      errors.push({
        skill: skillName,
        code: "missing_trigger",
        message: `Description is missing positive trigger guidance ("use when", "use for", "use to", or "trigger")`,
      })
    }

    if (!hasNegativeScope) {
      errors.push({
        skill: skillName,
        code: "missing_negative_scope",
        message: `Description is missing negative scope ("do not use", "don't use", or "not for")`,
      })
    }
  }

  const body = fm.body || ""
  if (!/^#+\s*.*example/im.test(body)) {
    warnings.push({
      skill: skillName,
      code: "missing_examples",
      message: `Skill "${skillName}" is missing an Examples section`,
    })
  }

  if (!/^#+\s*.*(?:error|failure|troubleshoot|handling)/im.test(body)) {
    warnings.push({
      skill: skillName,
      code: "missing_error_handling",
      message: `Skill "${skillName}" is missing an Error Handling / Failure Modes section`,
    })
  }
  // --- Check broken links & orphan references (AC-5) ---
  const refDir = path.join(skillDirPath, "references")
  const refFiles = []
  try {
    if (fsLayer.existsSync(refDir) && fsLayer.statSync(refDir).isDirectory()) {
      const entries = fsLayer.readdirSync(refDir)
      for (const f of entries) {
        try {
          const fullPath = path.join(refDir, f)
          if (fsLayer.statSync(fullPath).isFile()) {
            refFiles.push(f)
          }
        } catch {}
      }
    }
  } catch {}

  const filesToScan = [{ rel: "SKILL.md", full: skillMdPath }]
  for (const f of refFiles) {
    if (f.endsWith(".md")) {
      filesToScan.push({ rel: path.join("references", f), full: path.join(refDir, f) })
    }
  }

  const repoRoot = root || path.dirname(path.dirname(skillDirPath))

  for (const { rel, full } of filesToScan) {
    let fileContent = ""
    try {
      fileContent = fsLayer.readFileSync(full, "utf8")
    } catch {
      continue
    }

    // 1. Markdown links: [text](target) or ![alt](target)
    const mdRegex = /!?\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g
    let m
    while ((m = mdRegex.exec(fileContent)) !== null) {
      const rawTarget = m[2].trim()
      if (
        rawTarget.startsWith("http://") ||
        rawTarget.startsWith("https://") ||
        rawTarget.startsWith("mailto:") ||
        rawTarget.startsWith("skill://") ||
        rawTarget.startsWith("#") ||
        rawTarget.startsWith("javascript:")
      ) {
        continue
      }

      const [pathOnly] = rawTarget.split("#")
      if (!pathOnly) continue

      let norm = pathOnly.replace(/^\.\//, "")
      if (!norm.startsWith("references/") && !norm.startsWith("scripts/")) continue
      if (norm.includes("*") || norm.includes("?")) continue

      const inSkill = fsLayer.existsSync(path.resolve(skillDirPath, norm)) || fsLayer.existsSync(path.resolve(path.dirname(full), pathOnly))
      const inRoot = norm.startsWith("scripts/") && (
        fsLayer.existsSync(path.resolve(repoRoot, norm)) ||
        fsLayer.existsSync(path.resolve(repoRoot, "agent", norm)) ||
        fsLayer.existsSync(path.resolve(repoRoot, "scripts", norm.replace(/^scripts\//, ""))) ||
        fsLayer.existsSync(path.resolve(process.cwd(), norm)) ||
        fsLayer.existsSync(path.resolve(process.cwd(), "agent", norm))
      )

      if (!inSkill && !inRoot) {
        errors.push({
          skill: skillName,
          code: "broken_link",
          message: `Broken link "${rawTarget}" in ${rel} (target does not exist)`,
        })
      }
    }

    // 2. Backtick relative paths starting with references/ or scripts/
    const btRegex = /`([^`\n]+)`/g
    while ((m = btRegex.exec(fileContent)) !== null) {
      const code = m[1].trim()
      let norm = code.replace(/^\.\//, "")
      if (!norm.startsWith("references/") && !norm.startsWith("scripts/")) continue

      let firstToken = norm.split(/\s+/)[0]
      firstToken = firstToken.replace(/[.,:;'"\])}]+$/, "")
      const [pathOnly] = firstToken.split("#")
      if (!pathOnly || pathOnly.includes("*") || pathOnly.includes("?")) continue

      const inSkill = fsLayer.existsSync(path.resolve(skillDirPath, pathOnly)) || fsLayer.existsSync(path.resolve(path.dirname(full), pathOnly))
      const inRoot = pathOnly.startsWith("scripts/") && (
        fsLayer.existsSync(path.resolve(repoRoot, pathOnly)) ||
        fsLayer.existsSync(path.resolve(repoRoot, "agent", pathOnly)) ||
        fsLayer.existsSync(path.resolve(repoRoot, "scripts", pathOnly.replace(/^scripts\//, ""))) ||
        fsLayer.existsSync(path.resolve(process.cwd(), pathOnly)) ||
        fsLayer.existsSync(path.resolve(process.cwd(), "agent", pathOnly))
      )

      if (!inSkill && !inRoot) {
        errors.push({
          skill: skillName,
          code: "broken_link",
          message: `Broken link \`${code}\` in ${rel} (target does not exist)`,
        })
      }
    }
  }

  // 3. Orphan references check
  if (refFiles.length > 0) {
    const reachable = new Set()
    const visited = new Set()
    const queue = ["SKILL.md"]

    while (queue.length > 0) {
      const cur = queue.shift()
      if (visited.has(cur)) continue
      visited.add(cur)

      const curFull = path.join(skillDirPath, cur)
      if (!fsLayer.existsSync(curFull)) continue
      let c = ""
      try {
        c = fsLayer.readFileSync(curFull, "utf8")
      } catch {
        continue
      }

      for (const rf of refFiles) {
        if (c.includes(`references/${rf}`) || c.includes(`./references/${rf}`) || c.includes(rf)) {
          if (!reachable.has(rf)) {
            reachable.add(rf)
            queue.push(path.join("references", rf))
          }
        }
      }
    }

    for (const rf of refFiles) {
      if (!reachable.has(rf)) {
        warnings.push({
          skill: skillName,
          code: "orphan_reference",
          message: `Reference file "references/${rf}" is never mentioned in SKILL.md or another referenced file`,
        })
      }
    }
  }

  return {
    skill: skillName,
    errors,
    warnings,
    lineCount: totalLines,
    descriptionChars,
    hasTrigger,
    hasNegativeScope,
    hasXml,
    isMultiline,
  }
}

export function lintSkills({
  root = process.cwd(),
  skills = null,
  skillsDir: customSkillsDir = null,
  global = false,
  fs: customFs = null,
} = {}) {
  const fsLayer = customFs ?? fs
  const skillsDir = resolveSkillsDir({ skillsDir: customSkillsDir, global, root, fs: fsLayer })
  if (!skillsDir) {
    return {
      ok: true,
      status: "unavailable",
      reason: "no skills directory",
      skillsChecked: 0,
      errors: [],
    }
  }
  const rawEntries = fs.readdirSync(skillsDir, { withFileTypes: true })
  const validSkills = []
  const symlinkMap = new Set()

  for (const e of rawEntries) {
    const fullPath = path.join(skillsDir, e.name)
    let isDir = false
    let isSymlink = false
    try {
      const st = fs.statSync(fullPath)
      isDir = st.isDirectory()
      const lst = fs.lstatSync(fullPath)
      isSymlink = lst.isSymbolicLink()
    } catch {
      continue
    }

    if (isDir) {
      validSkills.push(e.name)
      if (isSymlink) {
        symlinkMap.add(e.name)
      }
    }
  }

  validSkills.sort()

  const availableSet = new Set(validSkills)
  const allErrors = []
  const allWarnings = []
  let selected = validSkills

  if (skills) {
    const list = Array.isArray(skills)
      ? skills
      : String(skills)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)

    selected = []
    for (const req of list) {
      if (availableSet.has(req)) {
        selected.push(req)
      } else {
        allErrors.push({
          skill: req,
          code: "unknown_skill",
          message: `Skill "${req}" does not exist in ${skillsDir}`,
        })
      }
    }
  }
  let maxSkillLines = 0
  let descriptionCharsTotal = 0
  let withTriggers = 0
  let withNegativeScope = 0
  let xmlViolations = 0
  let multilineDescriptions = 0

  for (const name of selected) {
    const skillPath = path.join(skillsDir, name)
    const res = lintSkill(skillPath, name, { root, fs: fsLayer })
    if (symlinkMap.has(name) && !res.warnings.some((w) => w.code === "symlinked_skill")) {
      res.warnings.push({
        skill: name,
        code: "symlinked_skill",
        message: `Skill "${name}" is a symlinked directory`,
      })
    }
    allErrors.push(...res.errors)
    allWarnings.push(...res.warnings)
    maxSkillLines = Math.max(maxSkillLines, res.lineCount)
    descriptionCharsTotal += res.descriptionChars
    if (res.hasTrigger) withTriggers++
    if (res.hasNegativeScope) withNegativeScope++
    if (res.hasXml) xmlViolations++
    if (res.isMultiline) multilineDescriptions++
  }

  return {
    ok: allErrors.length === 0,
    skillsChecked: selected.length,
    skillCount: selected.length,
    errors: allErrors,
    warnings: allWarnings,
    maxSkillLines,
    descriptionCharsTotal,
    totalSkills: selected.length,
    withTriggers,
    withNegativeScope,
    xmlViolations,
    multilineDescriptions,
  }
}

export function runCli(argv) {
  const isJson = argv.includes("--json")
  const isMetric = argv.includes("--metric")
  const isGlobal = argv.includes("--global")
  const isCheckDescriptions = argv.includes("--check-descriptions")
  const isCheckFrontmatter = argv.includes("--check-frontmatter")

  const rootIdx = argv.indexOf("--root")
  const root = rootIdx >= 0 && argv[rootIdx + 1] ? argv[rootIdx + 1] : process.cwd()

  const skillsIdx = argv.indexOf("--skills")
  const skills = skillsIdx >= 0 && argv[skillsIdx + 1] ? argv[skillsIdx + 1] : null

  const skillsDirIdx = argv.indexOf("--skills-dir")
  const skillsDir = skillsDirIdx >= 0 && argv[skillsDirIdx + 1] ? argv[skillsDirIdx + 1] : null

  const result = lintSkills({ root, skills, skillsDir, global: isGlobal })

  if (result.status === "unavailable") {
    if (isJson) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(`Status: unavailable (${result.reason})`)
    }
    return 0
  }

  if (isCheckDescriptions && isJson) {
    console.log(
      JSON.stringify(
        {
          ok: result.errors.length === 0,
          totalSkills: result.totalSkills,
          withTriggers: result.withTriggers,
          withNegativeScope: result.withNegativeScope,
          errors: result.errors,
        },
        null,
        2
      )
    )
    return result.ok ? 0 : 1
  }

  if (isCheckFrontmatter && isJson) {
    console.log(
      JSON.stringify(
        {
          ok: result.errors.length === 0,
          xmlViolations: result.xmlViolations,
          multilineDescriptions: result.multilineDescriptions,
          errors: result.errors,
        },
        null,
        2
      )
    )
    return result.ok ? 0 : 1
  }

  if (isJson) {
    console.log(
      JSON.stringify(
        {
          ok: result.ok,
          skillsChecked: result.skillsChecked,
          errors: result.errors,
          warnings: result.warnings,
          maxSkillLines: result.maxSkillLines,
          descriptionCharsTotal: result.descriptionCharsTotal,
        },
        null,
        2
      )
    )
  } else {
    for (const err of result.errors) {
      console.error(`${err.skill}: [${err.code}] ${err.message}`)
    }
    if (result.ok) {
      console.log(
        `PASS: All ${result.skillsChecked} skills complied (0 errors, ${result.warnings.length} warnings).`
      )
    } else {
      console.error(`FAIL: ${result.errors.length} error(s) across ${result.skillsChecked} skills.`)
    }
  }

  if (isMetric) {
    console.log(`count=${result.errors.length}`)
    return 0
  }

  return result.ok ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const code = runCli(process.argv.slice(2))
  process.exit(code)
}
