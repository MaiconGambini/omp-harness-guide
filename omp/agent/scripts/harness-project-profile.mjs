// harness-project-profile.mjs — detects project tech stack, test runners, Docker, CI, and deploy signals.
// Emits and persists agent-os/project-profile.json with idempotent merge semantics per amendment R6.1.
// Publishes profile to Obsidian cérebro with staging, secret scanning, and lint self-correction per amendment R7.

import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync as runProc } from "node:child_process"
import { validateRunnerCommand } from "./harness-eval-runner.mjs"

/**
 * Closed list of conditions where the fix loop must escalate to operator instead of continuing.
 */
export const DEFAULT_FIX_LOOP = Object.freeze({
  maxAttempts: 3,
  escalateOn: Object.freeze([
    "attempts_exhausted",
    "secret_or_credential",
    "production_deploy",
    "scope_change",
    "dependency_cooldown",
  ]),
})

const IGNORED_DIRS = new Set([
  "node_modules",
  "vendor",
  ".git",
  "dist",
  "build",
  ".venv",
  "target",
  ".idea",
  ".vscode",
  "coverage",
  ".turbo",
  ".cache",
])

/**
 * Deterministic JSON stringify for reproducible hashes.
 */
function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj)
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]"
  }
  const keys = Object.keys(obj).sort()
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}"
}

/**
 * Recursively scans directories up to depth 2, skipping ignored directories.
 */
function findDirectoriesUpToDepth(root, maxDepth = 2) {
  const dirs = ["."]
  const queue = [{ rel: "", depth: 0 }]

  while (queue.length > 0) {
    const { rel, depth } = queue.shift()
    if (depth >= maxDepth) continue

    const currentAbs = rel ? path.resolve(root, rel) : path.resolve(root)
    let entries = []
    try {
      entries = fs.readdirSync(currentAbs, { withFileTypes: true })
    } catch {
      continue
    }

    for (const ent of entries) {
      if (ent.isDirectory()) {
        const name = ent.name
        if (IGNORED_DIRS.has(name) || name.startsWith(".")) {
          continue
        }
        const childRel = rel ? `${rel}/${name}` : name
        dirs.push(childRel)
        queue.push({ rel: childRel, depth: depth + 1 })
      }
    }
  }

  return dirs
}

/**
 * Detects project capabilities and settings from filesystem markers (read-only).
 */
export function detectProjectProfile(root) {
  const absRoot = path.resolve(root)
  const stack = new Set()
  const components = []
  const runnerAllowlist = []
  const dockerFiles = []
  const deployMarkers = []
  const ciEvidence = []

  const scannedDirs = findDirectoriesUpToDepth(absRoot, 2)

  // 1. Scan components and files across scanned directories
  for (const dirRel of scannedDirs) {
    const dirAbs = dirRel === "." ? absRoot : path.resolve(absRoot, dirRel)
    let entries = []
    try {
      entries = fs.readdirSync(dirAbs, { withFileTypes: true })
    } catch {
      continue
    }

    const fileNames = entries.filter((e) => e.isFile()).map((e) => e.name)
    const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name)

    // Docker / compose markers at any scanned depth
    for (const f of fileNames) {
      if (
        f === "Dockerfile" ||
        f.startsWith("Dockerfile.") ||
        /^docker-compose.*\.ya?ml$/i.test(f) ||
        /^compose.*\.ya?ml$/i.test(f)
      ) {
        dockerFiles.push(dirRel === "." ? f : `${dirRel}/${f}`)
      }
    }

    // Deploy markers
    for (const f of fileNames) {
      if (["vercel.json", "fly.toml", "render.yaml", "Procfile"].includes(f)) {
        deployMarkers.push(dirRel === "." ? f : `${dirRel}/${f}`)
      }
    }
    for (const d of dirNames) {
      if (d === "k8s" || d === "helm") {
        deployMarkers.push(dirRel === "." ? d : `${dirRel}/${d}`)
      }
    }

    // Go component
    if (fileNames.includes("go.mod")) {
      stack.add("go")
      components.push({
        path: dirRel,
        stack: "go",
        command: "go test ./...",
        cwd: dirRel,
      })
      runnerAllowlist.push("go test")
    }

    // Python component
    const hasPyProject = fileNames.includes("pyproject.toml")
    const hasReqs = fileNames.some((f) => /^requirements.*\.txt$/i.test(f))
    const hasSetupPy = fileNames.includes("setup.py")
    const hasUvLock = fileNames.includes("uv.lock") || (dirRel === "." && fs.existsSync(path.resolve(absRoot, "uv.lock")))

    if (hasPyProject || hasReqs || hasSetupPy || hasUvLock) {
      stack.add("python")
      let usesPytest = false
      if (hasPyProject) {
        try {
          const content = fs.readFileSync(path.resolve(dirAbs, "pyproject.toml"), "utf8")
          if (content.includes("pytest")) usesPytest = true
        } catch {}
      }
      for (const f of fileNames.filter((x) => /^requirements.*\.txt$/i.test(x))) {
        try {
          const content = fs.readFileSync(path.resolve(dirAbs, f), "utf8")
          if (content.includes("pytest")) usesPytest = true
        } catch {}
      }
      if (!usesPytest && dirNames.includes("tests")) {
        usesPytest = true
      }

      let pyCmd
      if (hasUvLock) {
        pyCmd = usesPytest ? "uv run pytest -q" : "uv run python -m unittest"
        runnerAllowlist.push(usesPytest ? "uv run pytest" : "uv run python -m unittest")
        if (usesPytest) {
          runnerAllowlist.push("uv run python -m pytest")
        }
      } else {
        pyCmd = usesPytest ? "pytest -q" : "python -m unittest"
        runnerAllowlist.push(usesPytest ? "pytest" : "python -m unittest")
      }

      components.push({
        path: dirRel,
        stack: "python",
        command: pyCmd,
        cwd: dirRel,
      })
    }
    // Node / TypeScript component
    if (fileNames.includes("package.json")) {
      stack.add("node")
      if (fileNames.includes("tsconfig.json") || fs.existsSync(path.resolve(absRoot, "tsconfig.json"))) {
        stack.add("typescript")
      }
      let testCmd = null
      let reason = undefined
      try {
        const pkg = JSON.parse(fs.readFileSync(path.resolve(dirAbs, "package.json"), "utf8"))
        if (pkg.scripts && typeof pkg.scripts.test === "string" && pkg.scripts.test.trim().length > 0) {
          testCmd = "npm test"
          runnerAllowlist.push("npm test", "node --test", "npm run test")
        } else if (pkg.scripts && typeof pkg.scripts["test:unit"] === "string" && pkg.scripts["test:unit"].trim().length > 0) {
          testCmd = "npm run test:unit"
          runnerAllowlist.push("npm run test:unit")
        } else {
          reason = "no_test_script"
        }
      } catch {
        reason = "unparseable_package_json"
      }

      components.push({
        path: dirRel,
        stack: "node",
        command: testCmd,
        ...(reason ? { reason } : {}),
        cwd: dirRel,
      })
    }

    // Rust component
    if (fileNames.includes("Cargo.toml")) {
      stack.add("rust")
      components.push({
        path: dirRel,
        stack: "rust",
        command: "cargo test",
        cwd: dirRel,
      })
      runnerAllowlist.push("cargo test")
    }

    // .NET component
    if (fileNames.some((f) => f.endsWith(".csproj") || f.endsWith(".sln"))) {
      stack.add("dotnet")
      components.push({
        path: dirRel,
        stack: "dotnet",
        command: "dotnet test",
        cwd: dirRel,
      })
      runnerAllowlist.push("dotnet test")
    }
  }

  // 2. CI Workflows detection
  const workflowsDir = path.resolve(absRoot, ".github", "workflows")
  if (fs.existsSync(workflowsDir)) {
    try {
      const wfFiles = fs.readdirSync(workflowsDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
      for (const wf of wfFiles) {
        ciEvidence.push(`.github/workflows/${wf}`)
      }
    } catch {}
  }
  const ciProvider = ciEvidence.length > 0 ? "github" : "none"

  // 3. Docker / Isolation detection
  const hasDocker = dockerFiles.length > 0
  const isolation = hasDocker ? "docker" : "process"

  // 4. Delivery signals & evidence
  const hasDeployWorkflow = ciEvidence.some((f) => /deploy/i.test(f))
  const deliveryEvidence = [...deployMarkers]
  if (hasDeployWorkflow || deployMarkers.length > 0) {
    for (const df of dockerFiles) {
      if (!deliveryEvidence.includes(df)) {
        deliveryEvidence.push(df)
      }
    }
  }
  const deliveryMode = deliveryEvidence.length > 0 ? "platform" : "none"

  // 5. Test root command and components
  const rootComponent = components.find((c) => c.path === ".")
  const rootTestCommand = rootComponent?.command ?? null
  const testDetected = Boolean(rootTestCommand || components.some((c) => c.command !== null))

  return {
    schemaVersion: 1,
    stack: [...stack],
    test: {
      command: rootTestCommand,
      components,
      detected: testDetected,
    },
    evals: {
      isolation,
      runnerAllowlist: [...new Set(runnerAllowlist)],
      dataset: fs.existsSync(path.resolve(absRoot, "evals", "dataset.json")) ? "evals/dataset.json" : null,
      detected: true,
    },
    ci: {
      provider: ciProvider,
      evidence: [...new Set(ciEvidence)].sort(),
      detected: true,
    },
    delivery: {
      mode: deliveryMode,
      evidence: [...new Set(deliveryEvidence)].sort(),
      detected: true,
    },
    fixLoop: {
      maxAttempts: DEFAULT_FIX_LOOP.maxAttempts,
      escalateOn: [...DEFAULT_FIX_LOOP.escalateOn],
      detected: true,
    },
  }
}

/**
 * Reads project profile from agent-os/project-profile.json. Never throws.
 */
export function readProjectProfile(root) {
  try {
    const profilePath = path.resolve(root, "agent-os", "project-profile.json")
    if (!fs.existsSync(profilePath)) {
      return { ok: true, profile: null, reason: "not_found" }
    }
    const content = fs.readFileSync(profilePath, "utf8")
    const profile = JSON.parse(content)
    return { ok: true, profile, reason: "loaded" }
  } catch (err) {
    return { ok: false, profile: null, reason: `failed_to_read: ${err.message}` }
  }
}

/**
 * Writes project profile to agent-os/project-profile.json atomically and idempotently.
 * Preserves operator overrides (sections with detected === false).
 */
export function writeProjectProfile(root, profile, { merge = true } = {}) {
  const dir = path.resolve(root, "agent-os")
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  let finalProfile = { ...profile }

  if (merge) {
    const existingRes = readProjectProfile(root)
    if (existingRes.ok && existingRes.profile) {
      const existing = existingRes.profile
      finalProfile = {
        schemaVersion: 1,
        stack: existing.stack && existing.stackDetected === false ? existing.stack : (profile.stack ?? existing.stack),
        test: existing.test?.detected === false ? existing.test : (profile.test ?? existing.test),
        evals: existing.evals?.detected === false ? existing.evals : (profile.evals ?? existing.evals),
        ci: existing.ci?.detected === false ? existing.ci : (profile.ci ?? existing.ci),
        delivery: existing.delivery?.detected === false ? existing.delivery : (profile.delivery ?? existing.delivery),
        fixLoop: existing.fixLoop?.detected === false ? existing.fixLoop : (profile.fixLoop ?? existing.fixLoop),
      }
    }
  }

  // Ensure fixLoop maxAttempts is clamped between 1 and 10
  if (finalProfile.fixLoop) {
    const rawAttempts = Number(finalProfile.fixLoop.maxAttempts)
    const attempts = Number.isFinite(rawAttempts) ? rawAttempts : DEFAULT_FIX_LOOP.maxAttempts
    finalProfile.fixLoop.maxAttempts = Math.max(1, Math.min(10, attempts))
    if (!Array.isArray(finalProfile.fixLoop.escalateOn)) {
      finalProfile.fixLoop.escalateOn = [...DEFAULT_FIX_LOOP.escalateOn]
    }
  }

  const targetPath = path.resolve(dir, "project-profile.json")
  const tempPath = path.resolve(dir, `.project-profile.${process.pid}.${Date.now()}.tmp`)

  fs.writeFileSync(tempPath, JSON.stringify(finalProfile, null, 2) + "\n", "utf8")
  fs.renameSync(tempPath, targetPath)

  return finalProfile
}

// -----------------------------------------------------------------------------
// Publication to Obsidian Cérebro (Amendment 02 / R7)
// -----------------------------------------------------------------------------

function resolveProjectFromRegistry(root, registryPath) {
  if (!fs.existsSync(registryPath)) return { ok: false, reason: "not_registered" }
  let reg
  try {
    reg = JSON.parse(fs.readFileSync(registryPath, "utf8"))
  } catch {
    return { ok: false, reason: "not_registered" }
  }
  const normRoot = path.resolve(root).replace(/\\/g, "/").toLowerCase()
  const projects = reg.projects || {}

  for (const [key, p] of Object.entries(projects)) {
    if (!p.repo) continue
    const normRepo = path.resolve(p.repo).replace(/\\/g, "/").toLowerCase()
    if (normRoot === normRepo || normRoot.startsWith(normRepo + "/")) {
      const ctx = reg.contexts?.[p.context]
      if (!ctx || !ctx.vaultPath) continue

      // Validate project key/name: allow only [A-Za-z0-9._ -]
      const projectName = p.name || key
      if (!/^[A-Za-z0-9._ -]+$/.test(key) || !/^[A-Za-z0-9._ -]+$/.test(projectName)) {
        return { ok: false, reason: "invalid_registry_path" }
      }

      // Validate obsidianFolder:
      // must not be absolute, must not contain '..' segment, must resolve inside vaultPath
      const folder = p.obsidianFolder
      if (
        typeof folder !== "string" ||
        !folder.trim() ||
        path.isAbsolute(folder) ||
        folder.startsWith("/") ||
        folder.startsWith("\\") ||
        /(^|[\\/])\.\.([\\/]|$)/.test(folder)
      ) {
        return { ok: false, reason: "invalid_registry_path" }
      }

      // Check containment inside vaultPath via realpath of vaultPath and nearest existing ancestor
      try {
        const vaultResolved = path.resolve(ctx.vaultPath)
        if (!fs.existsSync(vaultResolved)) {
          return { ok: false, reason: "invalid_registry_path" }
        }
        const realVault = fs.realpathSync(vaultResolved)
        const cerebroFolder = path.resolve(vaultResolved, folder)

        // Find nearest existing ancestor of cerebroFolder
        let ancestor = cerebroFolder
        while (!fs.existsSync(ancestor)) {
          const parent = path.dirname(ancestor)
          if (parent === ancestor) break
          ancestor = parent
        }
        const realAncestor = fs.realpathSync(ancestor)
        const rel = path.relative(realVault, realAncestor)
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
          return { ok: false, reason: "invalid_registry_path" }
        }

        return {
          ok: true,
          info: {
            key,
            name: projectName,
            project: p,
            context: ctx,
            vaultPath: vaultResolved,
            obsidianFolder: folder,
            cerebroFolder,
          },
        }
      } catch {
        return { ok: false, reason: "invalid_registry_path" }
      }
    }
  }
  return { ok: false, reason: "not_registered" }
}

function hasSymlinkInPath(targetPath, baseDir) {
  let cur = path.resolve(targetPath)
  const base = path.resolve(baseDir)
  while (cur.startsWith(base)) {
    if (fs.existsSync(cur)) {
      try {
        const stat = fs.lstatSync(cur)
        if (stat.isSymbolicLink()) {
          return true
        }
      } catch {
        return true
      }
    }
    if (cur === base) break
    cur = path.dirname(cur)
  }
  return false
}

function sanitizeInline(val) {
  if (val === null || val === undefined) return ""
  return String(val)
    .replace(/[`<>|]/g, "")
    .replace(/[\r\n]/g, " ")
    .trim()
}

function validatePathSafe(p) {
  if (typeof p !== "string") return false
  const trimmed = p.trim().replace(/\\/g, "/")
  if (!/^[A-Za-z0-9._/-]{1,120}$/.test(trimmed)) return false
  if (/(^|[\\/])\.\.([\\/]|$)/.test(trimmed)) return false
  return true
}

function formatCommandSafe(cmd) {
  if (!cmd || typeof cmd !== "string") return null
  const v = validateRunnerCommand(cmd)
  if (!v.ok) {
    return "comando rejeitado"
  }
  return sanitizeInline(cmd)
}

function formatTestsRule(testConfig) {
  if (!testConfig) return "nenhum comando de teste configurado."
  const components = testConfig.components || []
  if (components.length > 0) {
    const parts = components.map((c) => {
      const p = validatePathSafe(c.path) ? sanitizeInline(c.path) : "caminho rejeitado"
      if (c.command) {
        const safeCmd = formatCommandSafe(c.command)
        const safeCwd = c.cwd && c.cwd !== "." && validatePathSafe(c.cwd) ? `cd ${sanitizeInline(c.cwd)} && ` : ""
        return `${p} \`${safeCwd}${safeCmd}\``
      }
      return `o ${p} não tem script de teste (\`npm test\` não existe)`
    })
    return parts.join("; ") + "."
  }
  if (testConfig.command) {
    const safeCmd = formatCommandSafe(testConfig.command)
    return `\`${safeCmd}\`.`
  }
  return "nenhum comando de teste detectado."
}

function formatDeliveryRule(deliveryConfig) {
  const mode = ["none", "manual", "platform"].includes(deliveryConfig?.mode) ? deliveryConfig.mode : "none"
  if (!deliveryConfig || mode === "none" || mode === "manual") {
    return `: sem deploy (\`delivery.mode: ${mode}\`).`
  }
  const evidenceList = deliveryConfig.evidence && Array.isArray(deliveryConfig.evidence)
    ? deliveryConfig.evidence
        .filter((p) => validatePathSafe(p))
        .map((p) => sanitizeInline(String(p).replace(/\\/g, "/")))
        .join(", ")
    : "platform"
  return `\`delivery.mode: platform\`: ${evidenceList || "platform"}) só com autorização explícita por ambiente.`
}

function validateGeneratedBlock(block) {
  const lines = block.split(/\r?\n/)
  if (lines.length < 2) return false
  if (lines[0].trim() !== "<!-- harness-profile:inicio -->") return false
  if (lines[lines.length - 1].trim() !== "<!-- harness-profile:fim -->") return false

  for (let i = 1; i < lines.length - 1; i++) {
    const l = lines[i]
    if (l.includes("<!--") || l.includes("-->")) {
      return false
    }
  }
  return true
}

function hasRawNewlines(profile) {
  if (!profile) return false
  const checkVal = (v) => {
    if (typeof v === "string" && /[\r\n]/.test(v)) return true
    if (Array.isArray(v)) return v.some(checkVal)
    if (v && typeof v === "object") return Object.values(v).some(checkVal)
    return false
  }
  return checkVal(profile)
}

function generateHubBlock({ profile, decisionSlug }) {
  const testsRule = formatTestsRule(profile.test)
  const maxAttempts = profile.fixLoop?.maxAttempts ?? DEFAULT_FIX_LOOP.maxAttempts
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    return null
  }
  const deliveryRule = formatDeliveryRule(profile.delivery)

  const block = `<!-- harness-profile:inicio -->\n` +
    `- Perfil do harness em \`agent-os/project-profile.json\` (gerado pela skill \`harness-project-setup\`). Mude o perfil, não os scripts. Ver [[decisoes/${decisionSlug}]].\n` +
    `- Testes: ${testsRule}\n` +
    `- Gate, eval ou CI vermelho: corrigir e rodar de novo, até ${maxAttempts} tentativas (\`fixLoop.maxAttempts\`), sem devolver ao operador. Escala só em: tentativas esgotadas, segredo, deploy em produção, mudança de escopo ou dependência fora do cooldown.\n` +
    `- Deploy (${deliveryRule}\n` +
    `<!-- harness-profile:fim -->`

  if (!validateGeneratedBlock(block)) {
    return null
  }

  return block
}

function updateHubContent(originalContent, { profile, decisionSlug }) {
  const lines = originalContent.split(/\r?\n/)
  const managedBlock = generateHubBlock({ profile, decisionSlug })
  if (!managedBlock) {
    return null
  }

  // Find ## Regras para agentes
  const headerIdx = lines.findIndex((l) => /^##\s+Regras para agentes/i.test(l))
  if (headerIdx === -1) {
    return originalContent.trimEnd() + "\n\n## Regras para agentes\n<!-- Preferências deste projeto -->\n" + managedBlock + "\n"
  }

  // Find the comment line immediately following header
  let commentIdx = -1
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (lines[i].trim().startsWith("<!--") && lines[i].trim().endsWith("-->")) {
      commentIdx = i
      break
    }
    if (lines[i].startsWith("## ")) break
  }

  const insertAfterIdx = commentIdx !== -1 ? commentIdx : headerIdx

  // Check if managed block already exists
  const startTagIdx = lines.findIndex((l) => l.trim() === "<!-- harness-profile:inicio -->")
  const endTagIdx = lines.findIndex((l) => l.trim() === "<!-- harness-profile:fim -->")

  if (startTagIdx !== -1 && endTagIdx !== -1 && endTagIdx >= startTagIdx) {
    const before = lines.slice(0, startTagIdx)
    const after = lines.slice(endTagIdx + 1)
    return before.join("\n") + (before.length ? "\n" : "") + managedBlock + (after.length ? "\n" + after.join("\n") : "\n")
  }

  // One-time migration: check if 4 legacy lines exist right below comment
  let searchIdx = insertAfterIdx + 1
  while (searchIdx < lines.length && lines[searchIdx].trim() === "") {
    searchIdx++
  }

  if (
    searchIdx < lines.length &&
    lines[searchIdx].trim().startsWith("- Perfil do harness em `agent-os/project-profile.json`") &&
    searchIdx + 1 < lines.length &&
    lines[searchIdx + 1].trim().startsWith("- Testes:") &&
    searchIdx + 2 < lines.length &&
    lines[searchIdx + 2].trim().startsWith("- Gate, eval ou CI vermelho:") &&
    searchIdx + 3 < lines.length &&
    lines[searchIdx + 3].trim().startsWith("- Deploy (")
  ) {
    const before = lines.slice(0, searchIdx)
    const after = lines.slice(searchIdx + 4)
    return before.join("\n") + "\n" + managedBlock + (after.length ? "\n" + after.join("\n") : "\n")
  }

  // Default insertion right after the comment line
  const before = lines.slice(0, insertAfterIdx + 1)
  const after = lines.slice(insertAfterIdx + 1)
  return before.join("\n") + "\n" + managedBlock + (after.length ? "\n" + after.join("\n") : "\n")
}

function generateDecisionNoteContent({ profile, projectInfo, dateStr, profileHash }) {
  const stackText = profile.stack?.map(sanitizeInline).join(" + ") || "não detectada"
  const components = profile.test?.components || []
  const compText = components.length > 0
    ? components.map((c) => {
        const p = validatePathSafe(c.path) ? sanitizeInline(c.path) : "caminho rejeitado"
        return c.command ? `componente \`${p}\` → \`${formatCommandSafe(c.command)}\`` : `\`${p}\` sem script de teste`
      }).join("; ")
    : (profile.test?.command ? `\`${formatCommandSafe(profile.test.command)}\`` : "nenhum comando de teste")

  const evalsIso = sanitizeInline(profile.evals?.isolation || "process")
  const allowlist = profile.evals?.runnerAllowlist?.map(sanitizeInline).join(", ") || "nenhuma"
  const ciProv = sanitizeInline(profile.ci?.provider || "none")
  const ciEv = profile.ci?.evidence?.map((e) => sanitizeInline(String(e).replace(/\\/g, "/"))).join(", ") || "nenhum"
  const delMode = ["none", "manual", "platform"].includes(profile.delivery?.mode) ? profile.delivery.mode : "none"
  const delEv = profile.delivery?.evidence?.map((e) => sanitizeInline(String(e).replace(/\\/g, "/"))).join(", ") || "nenhuma"
  const maxAtt = Math.max(1, Math.min(10, Number(profile.fixLoop?.maxAttempts) || DEFAULT_FIX_LOOP.maxAttempts))

  return `---
tipo: decisao
status: aceita
modulos: [AGENTS]
fonte: agent-os/project-profile.json (repo ${projectInfo.name}); spec ~/.omp/agent-os/specs/2026-10-15-1513-omp-evals-entrega-confiavel/amendment-01-perfil-e-autocorrecao.md
data: ${dateStr}
profileHash: ${profileHash}
---
# Perfil do harness para o ${projectInfo.name}

## Contexto
O harness OMP presumia Docker e plataforma de deploy, e parava ao primeiro gate vermelho. Agora cada projeto declara o próprio perfil.

## Decisão
\`agent-os/project-profile.json\` gerado por \`harness-project-profile.mjs --detect\` e gravado com confirmação do operador:
- stack ${stackText}; ${compText}.
- evals.isolation \`${evalsIso}\`; runnerAllowlist ${allowlist}.
- ci.provider \`${ciProv}\` (${ciEv}).
- delivery.mode \`${delMode}\` (${delEv}).
- fixLoop.maxAttempts ${maxAtt}.

## Alternativas
- \`delivery.mode: none\` até a plataforma ser homologada.

## Módulos afetados
Todos, pelo índice [[modulos/AGENTS]]. O perfil vale para o repositório inteiro.

## Consequências
- Gate vermelho volta para execute automaticamente (PREVC \`validate -> execute\`) até ${maxAtt} vezes; depois vira \`blocked\` com o diagnóstico.
- Deploy continua exigindo binding aprovado e confirmação por ambiente (\`harness-delivery-preflight.mjs\`).
- Alterações de teste no perfil exigem rodar \`--detect --write\` de novo.
`
}

function updateDecisionsIndex(originalContent, { decisionSlug, dateStr }) {
  const lines = originalContent.split(/\r?\n/)
  const noteWikilink = `[[decisoes/${decisionSlug}]]`
  const targetRow = `| ${noteWikilink} | Perfil do harness (agent-os/project-profile.json): testes, isolamento, CI, deploy e limite de autocorreção | ${dateStr} |`
  const targetBullet = `- ${noteWikilink}: a tarefa envolve rodar testes, evals, CI, deploy, ou entender por que o agente tenta corrigir de novo em vez de parar.`

  let updatedLines = [...lines]

  // 1. Table row
  const existingRowIdx = updatedLines.findIndex((l) => l.includes(noteWikilink) && l.trim().startsWith("|"))
  if (existingRowIdx !== -1) {
    updatedLines[existingRowIdx] = targetRow
  } else {
    let lastTableIdx = -1
    for (let i = 0; i < updatedLines.length; i++) {
      if (updatedLines[i].trim().startsWith("|")) {
        lastTableIdx = i
      }
    }
    if (lastTableIdx !== -1) {
      updatedLines.splice(lastTableIdx + 1, 0, targetRow)
    } else {
      updatedLines.push("", "| Nota | Do que trata | Atualizada |", "|---|---|---|", targetRow)
    }
  }

  // 2. Abra quando bullet
  const existingBulletIdx = updatedLines.findIndex((l) => l.includes(noteWikilink) && l.trim().startsWith("-"))
  if (existingBulletIdx !== -1) {
    updatedLines[existingBulletIdx] = targetBullet
  } else {
    const abraIdx = updatedLines.findIndex((l) => /^Abra quando:/i.test(l.trim()))
    if (abraIdx !== -1) {
      let insertIdx = abraIdx + 1
      while (insertIdx < updatedLines.length && (updatedLines[insertIdx].trim().startsWith("-") || updatedLines[insertIdx].trim() === "")) {
        insertIdx++
      }
      updatedLines.splice(insertIdx, 0, targetBullet)
    } else {
      updatedLines.push("", "Abra quando:", targetBullet)
    }
  }

  return updatedLines.join("\n")
}

function parseLintOutput(output) {
  const findings = []
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("Cérebro ok") || trimmed.startsWith("Total:")) continue
    const match = /^([^:]+):\s*([a-zA-Z0-9_\-]+):\s*(.*)$/.exec(trimmed)
    if (match) {
      findings.push({
        file: match[1].trim(),
        type: match[2].trim(),
        detail: match[3].trim(),
      })
    }
  }
  return findings
}

/**
 * Publishes project profile to Obsidian cérebro following amendment R7.
 */
export function publishProfileToCerebro(root, profile, options = {}) {
  try {
    const registryPath = options.registryPath || path.resolve(os.homedir(), ".task-pipeline", "projects.json")
    const stagingRoot = options.stagingRoot || path.resolve(os.homedir(), ".task-pipeline", "staging")
    const secretScannerPath = options.secretScannerPath || path.resolve(os.homedir(), ".agents", "skills", "cerebro-projeto", "scripts", "checar-segredos.mjs")
    const lintScriptPath = options.lintScriptPath || path.resolve(os.homedir(), ".agents", "skills", "cerebro-projeto", "scripts", "lint.mjs")
    const procRunner = options.runProc ?? runProc

    const now = options.now instanceof Date ? options.now : new Date()
    const dateStr = now.toISOString().slice(0, 10)

    const projectRes = resolveProjectFromRegistry(root, registryPath)
    if (!projectRes.ok) {
      return { status: projectRes.reason, files: [], lintFindings: [], attempts: 0 }
    }
    const projectInfo = projectRes.info

    // Defense against prompt injection and newline breakouts
    if (hasRawNewlines(profile)) {
      return { status: "invalid_profile_content", files: [], lintFindings: [], attempts: 0 }
    }

    const cerebroFolder = projectInfo.cerebroFolder
    const profileHash = crypto
      .createHash("sha256")
      .update(stableStringify(profile))
      .digest("hex")
      .slice(0, 16)

    // 1. Locate or create decision note slug
    const decisoesDir = path.resolve(cerebroFolder, "decisoes")
    let decisionFileName = `${dateStr}-perfil-do-harness.md`
    let decisionSlug = `${dateStr}-perfil-do-harness`

    if (fs.existsSync(decisoesDir)) {
      try {
        const files = fs.readdirSync(decisoesDir)
        for (const f of files) {
          if (f.endsWith("-perfil-do-harness.md") || f === "perfil-do-harness.md") {
            decisionFileName = f
            decisionSlug = f.replace(/\.md$/i, "")
            break
          }
        }
      } catch {}
    }

    // 2. Locate hub file
    let hubFileName = `${projectInfo.key}.md`
    if (!fs.existsSync(path.resolve(cerebroFolder, hubFileName))) {
      if (fs.existsSync(path.resolve(cerebroFolder, `${projectInfo.name}.md`))) {
        hubFileName = `${projectInfo.name}.md`
      }
    }

    const hubSrcPath = path.resolve(cerebroFolder, hubFileName)
    const hubOriginalContent = fs.existsSync(hubSrcPath) ? fs.readFileSync(hubSrcPath, "utf8") : `# ${projectInfo.name}\n`
    const hubNewContent = updateHubContent(hubOriginalContent, { profile, decisionSlug })
    if (!hubNewContent) {
      return { status: "invalid_profile_content", files: [], lintFindings: [], attempts: 0 }
    }

    // 3. Generate decision note
    const decisionNewContent = generateDecisionNoteContent({ profile, projectInfo, dateStr, profileHash })

    // 4. Update decisions index
    const indexSrcPath = path.resolve(cerebroFolder, "decisoes", "AGENTS.md")
    const indexOriginalContent = fs.existsSync(indexSrcPath)
      ? fs.readFileSync(indexSrcPath, "utf8")
      : "---\ntipo: indice\npasta: decisoes\n---\n# Decisões\n\n| Nota | Do que trata | Atualizada |\n|---|---|---|\n\nAbra quando:\n"
    const indexNewContent = updateDecisionsIndex(indexOriginalContent, { decisionSlug, dateStr })

    // 5. Staging preparation wrapped in try/finally
    const stagingDir = path.resolve(stagingRoot, projectInfo.key)
    let stagedFiles = []
    const publishedFiles = [hubFileName, `decisoes/${decisionFileName}`, "decisoes/AGENTS.md"]

    try {
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true })
      }
      fs.mkdirSync(path.resolve(stagingDir, "decisoes"), { recursive: true })

      const stagedHubPath = path.resolve(stagingDir, hubFileName)
      const stagedDecPath = path.resolve(stagingDir, "decisoes", decisionFileName)
      const stagedIndexPath = path.resolve(stagingDir, "decisoes", "AGENTS.md")

      fs.writeFileSync(stagedHubPath, hubNewContent, "utf8")
      fs.writeFileSync(stagedDecPath, decisionNewContent, "utf8")
      fs.writeFileSync(stagedIndexPath, indexNewContent, "utf8")

      stagedFiles = [stagedHubPath, stagedDecPath, stagedIndexPath]

      // 6. Secret scanning check (Fail-closed)
      if (!fs.existsSync(secretScannerPath)) {
        return {
          status: "blocked_secret",
          reason: "scanner_unavailable",
          files: [],
          lintFindings: [],
          attempts: 0,
        }
      }

      const scanRes = procRunner("node", [secretScannerPath, ...stagedFiles], { encoding: "utf8" })
      if (scanRes.error || scanRes.status === null || (scanRes.status !== 0 && scanRes.status !== 1)) {
        return {
          status: "blocked_secret",
          reason: "scanner_error",
          files: stagedFiles,
          lintFindings: [],
          attempts: 0,
        }
      }

      if (scanRes.status === 1) {
        return {
          status: "blocked_secret",
          reason: "secret_detected",
          files: stagedFiles,
          lintFindings: [],
          attempts: 0,
        }
      }

      // 7. Check for symlinks/junctions in destination paths before writing
      const destFiles = [
        path.resolve(cerebroFolder, hubFileName),
        path.resolve(cerebroFolder, "decisoes", decisionFileName),
        path.resolve(cerebroFolder, "decisoes", "AGENTS.md"),
      ]

      for (const df of destFiles) {
        if (hasSymlinkInPath(df, cerebroFolder)) {
          return {
            status: "invalid_registry_path",
            files: [],
            lintFindings: [{ error: `symlink_detected_in_${path.relative(cerebroFolder, df)}` }],
            attempts: 0,
          }
        }
      }

      // Testing hook for injecting writer failure
      if (typeof options.writeVaultHook === "function") {
        options.writeVaultHook({ cerebroFolder, stagingDir })
      }

      // Commit from staging to vault
      fs.mkdirSync(path.resolve(cerebroFolder, "decisoes"), { recursive: true })
      fs.writeFileSync(path.resolve(cerebroFolder, hubFileName), hubNewContent, "utf8")
      fs.writeFileSync(path.resolve(cerebroFolder, "decisoes", decisionFileName), decisionNewContent, "utf8")
      fs.writeFileSync(path.resolve(cerebroFolder, "decisoes", "AGENTS.md"), indexNewContent, "utf8")
    } finally {
      if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true })
      }
    }

    // 8. Lint and self-correction loop
    if (!fs.existsSync(lintScriptPath)) {
      return { status: "published", files: publishedFiles, lintFindings: [], attempts: 1 }
    }

    let attempts = 0
    let lintFindings = []

    while (attempts < 3) {
      attempts++
      const lintRes = procRunner("node", [lintScriptPath, "--projeto", projectInfo.key], {
        cwd: root,
        encoding: "utf8",
        env: options.env ? { ...process.env, ...options.env } : process.env,
      })

      lintFindings = parseLintOutput(lintRes.stdout + "\n" + lintRes.stderr)
      if (lintRes.status === 0 && lintFindings.length === 0) {
        return { status: "published", files: publishedFiles, lintFindings: [], attempts }
      }

      // Check if any finding is in files published by us and can be fixed
      let canAutofix = false
      const decRelPath = `decisoes/${decisionFileName}`

      for (const finding of lintFindings) {
        if (finding.type === "decisao-sem-modulo" && (finding.file === decRelPath || finding.file.endsWith(decisionFileName))) {
          const decPath = path.resolve(cerebroFolder, "decisoes", decisionFileName)
          const cur = fs.readFileSync(decPath, "utf8")
          if (!cur.includes("[[modulos/AGENTS]]")) {
            fs.writeFileSync(decPath, cur + "\n\n## Módulos afetados\nTodos, pelo índice [[modulos/AGENTS]].\n", "utf8")
            canAutofix = true
          }
        } else if (finding.type === "indice-desatualizado" && finding.file.includes("AGENTS.md")) {
          const idxPath = path.resolve(cerebroFolder, "decisoes", "AGENTS.md")
          const cur = fs.readFileSync(idxPath, "utf8")
          const updated = updateDecisionsIndex(cur, { decisionSlug, dateStr })
          if (updated !== cur) {
            fs.writeFileSync(idxPath, updated, "utf8")
            canAutofix = true
          }
        }
      }

      if (!canAutofix) {
        break
      }
    }

    if (lintFindings.length > 0) {
      return { status: "needs_agent_fix", files: publishedFiles, lintFindings, attempts }
    }

    return { status: "published", files: publishedFiles, lintFindings: [], attempts }
  } catch (err) {
    return { status: "needs_agent_fix", files: [], lintFindings: [{ error: err.message }], attempts: 0 }
  }
}

// CLI Execution support
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, "$1"))) {
  const args = process.argv.slice(2)
  let root = process.cwd()
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--root" && args[i + 1]) {
      root = args[i + 1]
      i++
    }
  }

  const isDetect = args.includes("--detect")
  const isJson = args.includes("--json")
  const isWrite = args.includes("--write")
  const isPublishCerebro = args.includes("--publish-cerebro")

  let profile = null

  if (isDetect) {
    profile = detectProjectProfile(root)
  } else if (isWrite) {
    profile = writeProjectProfile(root, detectProjectProfile(root))
  } else if (isPublishCerebro) {
    const existing = readProjectProfile(root)
    profile = existing.ok && existing.profile ? existing.profile : writeProjectProfile(root, detectProjectProfile(root))
  } else {
    profile = detectProjectProfile(root)
  }

  if (isWrite && !isPublishCerebro) {
    console.log(`Wrote project profile to ${path.resolve(root, "agent-os", "project-profile.json")}`)
  }

  if (isPublishCerebro) {
    const pubResult = publishProfileToCerebro(root, profile)
    console.log(JSON.stringify(pubResult, null, 2))
    process.exit(0)
  }

  if (isJson || isDetect || (!isWrite && !isPublishCerebro)) {
    console.log(JSON.stringify(profile, null, 2))
    process.exit(0)
  }

  process.exit(0)
}
