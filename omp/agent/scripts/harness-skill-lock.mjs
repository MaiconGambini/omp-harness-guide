#!/usr/bin/env node
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

export function isJunkFile(name) {
  if (name === ".DS_Store" || name === "Thumbs.db" || name === "desktop.ini") return true
  if (name.endsWith(".swp") || name.endsWith("~")) return true
  return false
}

export function normalizeFileBytes(buffer) {
  if (buffer.includes(0)) return buffer
  return Buffer.from(buffer.toString("utf8").replace(/\r\n/g, "\n"), "utf8")
}

function getFs(options = {}) {
  const custom = options?.fs ?? options
  return {
    lstatSync: custom?.lstatSync ? custom.lstatSync.bind(custom) : fs.lstatSync,
    statSync: custom?.statSync ? custom.statSync.bind(custom) : fs.statSync,
    readlinkSync: custom?.readlinkSync ? custom.readlinkSync.bind(custom) : fs.readlinkSync,
    readdirSync: custom?.readdirSync ? custom.readdirSync.bind(custom) : fs.readdirSync,
    readFileSync: custom?.readFileSync ? custom.readFileSync.bind(custom) : fs.readFileSync,
    existsSync: custom?.existsSync ? custom.existsSync.bind(custom) : fs.existsSync,
    mkdirSync: custom?.mkdirSync ? custom.mkdirSync.bind(custom) : fs.mkdirSync,
    writeFileSync: custom?.writeFileSync ? custom.writeFileSync.bind(custom) : fs.writeFileSync,
  }
}

function isDirectoryWithoutFollowingLinks(directory, fsLayer) {
  try {
    const stat = fsLayer.lstatSync(directory)
    return stat.isDirectory() && !stat.isSymbolicLink()
  } catch {
    return false
  }
}

export function getSkillEntries(skillDir, base = skillDir, options = {}) {
  const fsLayer = getFs(options)
  if (!isDirectoryWithoutFollowingLinks(skillDir, fsLayer)) return []
  const entries = []
  for (const name of fsLayer.readdirSync(skillDir)) {
    if (isJunkFile(name)) continue
    const full = path.join(skillDir, name)
    let stat
    try {
      stat = fsLayer.lstatSync(full)
    } catch {
      continue
    }
    const relPath = path.relative(base, full).replace(/\\/g, "/")
    if (stat.isSymbolicLink()) {
      entries.push({ relPath, full, isSymlink: true })
    } else if (stat.isDirectory()) {
      entries.push(...getSkillEntries(full, base, options))
    } else if (stat.isFile()) {
      entries.push({ relPath, full, isSymlink: false })
    }
  }
  return entries.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0))
}

export function getSkillFiles(skillDir, base = skillDir, options = {}) {
  return getSkillEntries(skillDir, base, options).map((entry) => entry.relPath)
}

export function computeSkillHash(skillDir, options = {}) {
  const fsLayer = getFs(options)
  const stat = fsLayer.lstatSync(skillDir)
  const hash = crypto.createHash("sha256")

  if (stat.isSymbolicLink()) {
    hash.update(path.basename(skillDir).replace(/\\/g, "/"), "utf8")
    hash.update(Buffer.from([0]))
    hash.update(`symlink:${fsLayer.readlinkSync(skillDir)}`, "utf8")
    return { contentHash: hash.digest("hex"), files: 1 }
  }
  if (!stat.isDirectory()) return { contentHash: hash.digest("hex"), files: 0 }

  const entries = getSkillEntries(skillDir, skillDir, options)
  for (const entry of entries) {
    hash.update(entry.relPath, "utf8")
    hash.update(Buffer.from([0]))
    if (entry.isSymlink) {
      hash.update(`symlink:${fsLayer.readlinkSync(entry.full)}`, "utf8")
    } else {
      hash.update(normalizeFileBytes(fsLayer.readFileSync(entry.full)))
    }
  }
  return { contentHash: hash.digest("hex"), files: entries.length }
}

export function resolveSkillsDir(options = {}) {
  const fsLayer = getFs(options)
  const root = path.resolve(options.root ?? process.cwd())

  if (options.skillsDir) {
    const candidate = path.resolve(root, options.skillsDir)
    try {
      const st = fsLayer.statSync(candidate)
      if (st.isDirectory()) return candidate
    } catch {}
    return null
  }

  if (options.global) {
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

export function resolveSkillsPaths(options = {}) {
  const root = path.resolve(options.root ?? process.cwd())
  const skillsDir = resolveSkillsDir(options)
  const lockfilePath = options.lockfile
    ? path.resolve(root, options.lockfile)
    : skillsDir
      ? path.join(skillsDir, "skills-lock.json")
      : null
  return { root, skillsDir, lockfilePath }
}

export function scanSkills(skillsDir, options = {}) {
  const fsLayer = getFs(options)
  if (!isDirectoryWithoutFollowingLinks(skillsDir, fsLayer)) return {}
  const skillDirs = []
  for (const name of fsLayer.readdirSync(skillsDir)) {
    if (name === "skills-lock.json" || isJunkFile(name)) continue
    const full = path.join(skillsDir, name)
    const stat = fsLayer.lstatSync(full)
    if (stat.isDirectory() || stat.isSymbolicLink()) skillDirs.push(name)
  }
  skillDirs.sort()

  const skills = {}
  for (const slug of skillDirs) {
    skills[slug] = computeSkillHash(path.join(skillsDir, slug), options)
  }
  return skills
}

export function generateLock(options = {}) {
  const fsLayer = getFs(options)
  const { root, skillsDir, lockfilePath } = resolveSkillsPaths(options)
  if (!skillsDir) {
    return {
      ok: false,
      error: "No skills directory found",
      code: "no_skills_dir",
      skillsLocked: 0,
    }
  }
  const skills = scanSkills(skillsDir, options)
  const orderedSkills = {}
  for (const slug of Object.keys(skills).sort()) orderedSkills[slug] = skills[slug]
  const lockContent = {
    version: 1,
    algorithm: "sha256",
    skills: orderedSkills,
  }
  fsLayer.mkdirSync(path.dirname(lockfilePath), { recursive: true })
  fsLayer.writeFileSync(lockfilePath, `${JSON.stringify(lockContent, null, 2)}\n`, "utf8")

  return {
    ok: true,
    skillsLocked: Object.keys(orderedSkills).length,
    lockfile: path.relative(root, lockfilePath).replace(/\\/g, "/"),
    data: lockContent,
  }
}

export function verifyLock(options = {}) {
  const fsLayer = getFs(options)
  const { skillsDir, lockfilePath } = resolveSkillsPaths(options)
  if (!skillsDir) {
    return {
      ok: false,
      error: "No skills directory found",
      code: "no_skills_dir",
      skillsVerified: 0,
      added: [],
      removed: [],
      modified: [],
    }
  }
  if (!lockfilePath || !fsLayer.existsSync(lockfilePath)) {
    return { ok: false, error: `Lockfile not found: ${lockfilePath}`, skillsVerified: 0, added: [], removed: [], modified: [] }
  }

  let lockData
  try {
    lockData = JSON.parse(fsLayer.readFileSync(lockfilePath, "utf8"))
  } catch (error) {
    return { ok: false, error: `Failed to parse lockfile: ${error.message}`, skillsVerified: 0, added: [], removed: [], modified: [] }
  }

  const lockedSkills = lockData.skills ?? {}
  const currentSkills = scanSkills(skillsDir, options)
  const lockedSlugs = new Set(Object.keys(lockedSkills))
  const currentSlugs = new Set(Object.keys(currentSkills))
  const added = []
  const removed = []
  const modified = []

  for (const slug of currentSlugs) {
    if (!lockedSlugs.has(slug)) {
      added.push(slug)
      continue
    }
    const expected = lockedSkills[slug]
    const actual = currentSkills[slug]
    if (expected.contentHash !== actual.contentHash || expected.files !== actual.files) {
      modified.push({
        slug,
        expectedHash: expected.contentHash,
        actualHash: actual.contentHash,
        expectedFiles: expected.files,
        actualFiles: actual.files,
      })
    }
  }

  for (const slug of lockedSlugs) {
    if (!currentSlugs.has(slug)) removed.push(slug)
  }

  added.sort()
  removed.sort()
  modified.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
  return {
    ok: added.length === 0 && removed.length === 0 && modified.length === 0,
    skillsVerified: currentSlugs.size,
    added,
    removed,
    modified,
  }
}

function valueOf(argv, flag, fallback = null) {
  const index = argv.indexOf(flag)
  return index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : fallback
}

export function runCli(argv = process.argv.slice(2)) {
  const isGenerate = argv.includes("--generate")
  const isVerify = argv.includes("--verify")
  const isJson = argv.includes("--json")
  const isGlobal = argv.includes("--global")
  const root = valueOf(argv, "--root", process.cwd())
  const skillsDir = valueOf(argv, "--skills-dir", null)
  const lockfile = valueOf(argv, "--lockfile", null)

  if (!isGenerate && !isVerify) {
    console.error("Usage: harness-skill-lock.mjs [--generate | --verify] [--json] [--root <dir>] [--skills-dir <dir>] [--global] [--lockfile <file>]")
    return 2
  }

  const paths = resolveSkillsPaths({ root, skillsDir, global: isGlobal, lockfile })
  if (!paths.skillsDir) {
    console.error("No skills directory found")
    return 2
  }

  if (isGenerate) {
    const result = generateLock({ root, skillsDir, global: isGlobal, lockfile })
    if (isJson) console.log(JSON.stringify({ ok: result.ok, skillsLocked: result.skillsLocked, lockfile: result.lockfile }, null, 2))
    else console.log(`Generated ${result.lockfile} (${result.skillsLocked} skills locked)`)
    return result.ok ? 0 : 1
  }

  const result = verifyLock({ root, skillsDir, global: isGlobal, lockfile })
  if (isJson) {
    console.log(JSON.stringify(result, null, 2))
  } else if (result.ok) {
    console.log(`Skill lock verification passed (${result.skillsVerified} skills verified)`)
  } else if (result.error) {
    console.error(`Skill lock verification error: ${result.error}`)
  } else {
    console.error(`Skill lock verification failed (${result.skillsVerified} skills checked):`)
    for (const item of result.added) console.error(`  + added: ${item}`)
    for (const item of result.removed) console.error(`  - removed: ${item}`)
    for (const item of result.modified) {
      console.error(`  * modified: ${item.slug} (hash: ${item.expectedHash.slice(0, 8)}... -> ${item.actualHash.slice(0, 8)}..., files: ${item.expectedFiles} -> ${item.actualFiles})`)
    }
  }
  return result.ok ? 0 : 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = runCli()
}
