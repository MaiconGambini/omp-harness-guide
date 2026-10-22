#!/usr/bin/env node
/**
 * harness-maestri-team.mjs
 *
 * Idempotent recruiter for the standard ten-role OMP team in a Maestri workspace.
 * CLI contract:
 *   node harness-maestri-team.mjs --dry-run [--root <dir>] | --apply --root <dir> [--specialist backend-infra|vue] [--model <provider/model>] [--thinking <level>] [--json]
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const BASE_REQUIRED_ROLES = [
  'OMP Explorer',
  'OMP Architecture Advisor',
  'OMP Implementer',
  'OMP Test Automation Engineer',
  'OMP Code Reviewer',
  'OMP Security Analyst',
  'OMP Refiner',
  'OMP Judge',
]

export const SPECIALIST_ROLES = {
  'backend-infra': 'OMP Backend Infra Engineer',
  vue: 'OMP Vue Engineer',
}

export const READ_ONLY_ROLES = new Set([
  'OMP Explorer',
  'OMP Architecture Advisor',
  'OMP Code Reviewer',
  'OMP Security Analyst',
  'OMP Refiner',
  'OMP Judge',
])

export const ROLE_TO_BASE_NAME = {
  'OMP Explorer': 'Explorer',
  'OMP Architecture Advisor': 'Architecture Advisor',
  'OMP Implementer': 'Implementer',
  'OMP Backend Infra Engineer': 'Backend Infra Engineer',
  'OMP Vue Engineer': 'Vue Engineer',
  'OMP Test Automation Engineer': 'Test Automation Engineer',
  'OMP Code Reviewer': 'Code Reviewer',
  'OMP Security Analyst': 'Security Analyst',
  'OMP Refiner': 'Refiner',
  'OMP Judge': 'Judge',
}

export function getRequiredRoles(specialist = 'backend-infra') {
  const specialistRole = SPECIALIST_ROLES[specialist]
  if (!specialistRole) {
    throw new Error(`Invalid specialist: "${specialist}". Expected "backend-infra" or "vue".`)
  }
  return [
    'OMP Explorer',
    'OMP Architecture Advisor',
    'OMP Implementer',
    specialistRole,
    'OMP Test Automation Engineer',
    'OMP Code Reviewer',
    'OMP Security Analyst',
    'OMP Refiner',
    'OMP Judge',
  ]
}

export function runMaestriList({ bin } = {}) {
  const binPath = bin || process.env.HARNESS_MAESTRI_BIN || process.env.MAESTRI_CLI || 'maestri'
  const isScript = binPath.endsWith('.js') || binPath.endsWith('.mjs')
  const res = isScript
    ? spawnSync(process.execPath, [binPath, 'list'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000,
        shell: false,
      })
    : spawnSync(binPath, ['list'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000,
        shell: false,
      })

  if (res.error) {
    if (res.error.code === 'ETIMEDOUT') {
      throw new Error(`Command "${binPath} list" timed out after 30000ms`)
    }
    throw new Error(`Failed to execute "${binPath} list": ${res.error.message}`)
  }
  return { status: res.status ?? 1, stdout: res.stdout || '', stderr: res.stderr || '' }
}

export function runMaestriWorkspaceList({ bin } = {}) {
  const binPath = bin || process.env.HARNESS_MAESTRI_BIN || process.env.MAESTRI_CLI || 'maestri'
  const isScript = binPath.endsWith('.js') || binPath.endsWith('.mjs')
  const res = isScript
    ? spawnSync(process.execPath, [binPath, 'workspace', 'list'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000,
        shell: false,
      })
    : spawnSync(binPath, ['workspace', 'list'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000,
        shell: false,
      })

  if (res.error) {
    if (res.error.code === 'ETIMEDOUT') {
      throw new Error(`Command "${binPath} workspace list" timed out after 30000ms`)
    }
    throw new Error(`Failed to execute "${binPath} workspace list": ${res.error.message}`)
  }
  return { status: res.status ?? 1, stdout: res.stdout || '', stderr: res.stderr || '' }
}

export function runMaestriPresetList({ bin } = {}) {
  const binPath = bin || process.env.HARNESS_MAESTRI_BIN || process.env.MAESTRI_CLI || 'maestri'
  const isScript = binPath.endsWith('.js') || binPath.endsWith('.mjs')
  const res = isScript
    ? spawnSync(process.execPath, [binPath, 'preset', 'list'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000,
        shell: false,
      })
    : spawnSync(binPath, ['preset', 'list'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000,
        shell: false,
      })

  if (res.error) {
    if (res.error.code === 'ETIMEDOUT') {
      throw new Error(`Command "${binPath} preset list" timed out after 30000ms`)
    }
    throw new Error(`Failed to execute "${binPath} preset list": ${res.error.message}`)
  }
  return { status: res.status ?? 1, stdout: res.stdout || '', stderr: res.stderr || '' }
}

export function runMaestriRoleList({ bin } = {}) {
  const binPath = bin || process.env.HARNESS_MAESTRI_BIN || process.env.MAESTRI_CLI || 'maestri'
  const isScript = binPath.endsWith('.js') || binPath.endsWith('.mjs')
  const res = isScript
    ? spawnSync(process.execPath, [binPath, 'role', 'list'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000,
        shell: false,
      })
    : spawnSync(binPath, ['role', 'list'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000,
        shell: false,
      })

  if (res.error) {
    if (res.error.code === 'ETIMEDOUT') {
      throw new Error(`Command "${binPath} role list" timed out after 30000ms`)
    }
    throw new Error(`Failed to execute "${binPath} role list": ${res.error.message}`)
  }
  return { status: res.status ?? 1, stdout: res.stdout || '', stderr: res.stderr || '' }
}

const MODEL_PATTERN = /^[A-Za-z0-9._:/-]+$/
const THINKING_LEVELS = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'auto'])

/**
 * Builds the `omp` launch command for a recruit, or null when the preset default suffices.
 * Example: buildRecruitCommand({ isReadOnly: true, model: 'google-antigravity/gemini-3.8-flash', thinking: 'high' })
 *   → 'omp --model=google-antigravity/gemini-3.8-flash --thinking=high --tools=read,grep,glob'
 */
export function buildRecruitCommand({ isReadOnly = false, model = null, thinking = null } = {}) {
  const parts = ['omp']
  if (model) parts.push(`--model=${model}`)
  if (thinking) parts.push(`--thinking=${thinking}`)
  if (isReadOnly) parts.push('--tools=read,grep,glob')
  return parts.length === 1 ? null : parts.join(' ')
}

export function runMaestriRecruit({
  name,
  role,
  activeRoot,
  isReadOnly = false,
  model = null,
  thinking = null,
  bin,
} = {}) {
  const binPath = bin || process.env.HARNESS_MAESTRI_BIN || process.env.MAESTRI_CLI || 'maestri'
  const isScript = binPath.endsWith('.js') || binPath.endsWith('.mjs')
  const args = ['recruit', name, '--preset', 'omp', '--role', role, '--dir', activeRoot]
  const command = buildRecruitCommand({ isReadOnly, model, thinking })
  if (command) args.push('--command', command)
  const runProc = spawnSync
  const res = runProc(isScript ? process.execPath : binPath, isScript ? [binPath, ...args] : args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
    shell: false,
  })

  if (res.error) {
    if (res.error.code === 'ETIMEDOUT') {
      throw new Error(`Command "${binPath} recruit ${name}" timed out after 30000ms`)
    }
    throw new Error(`Failed to execute "${binPath} recruit ${name}": ${res.error.message}`)
  }
  return { status: res.status ?? 1, stdout: res.stdout || '', stderr: res.stderr || '' }
}

export function runMaestriAsk({ name, message = '/new\n', bin } = {}) {
  if (
    typeof name !== 'string' ||
    name.length === 0 ||
    name.trim().length === 0 ||
    name.startsWith('-') ||
    /[\x00-\x1f\x7f]/.test(name)
  ) {
    const detail = `Invalid agent name "${name}": name cannot be empty, start with "-", or contain control characters.`
    return {
      status: 'failed',
      detail,
      stdout: '',
      stderr: detail,
    }
  }

  const binPath = bin || process.env.HARNESS_MAESTRI_BIN || process.env.MAESTRI_CLI || 'maestri'
  const isScript = binPath.endsWith('.js') || binPath.endsWith('.mjs')
  const args = ['ask', name, '--raw', message]
  const runProc = spawnSync
  const res = runProc(isScript ? process.execPath : binPath, isScript ? [binPath, ...args] : args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5000,
    shell: false,
  })

  if (res.error) {
    if (res.error.code === 'ETIMEDOUT') {
      const detail = `Command "${binPath} ask ${name}" timed out after 5000ms`
      return { status: 'failed', detail, stdout: '', stderr: detail }
    }
    return { status: 'failed', detail: res.error.message, stdout: '', stderr: res.error.message }
  }
  const status = res.status === 0 ? 'ok' : 'failed'
  const detail = (res.stdout || res.stderr || '').trim()
  return { status, detail, stdout: res.stdout || '', stderr: res.stderr || '' }
}

export function runMaestri(action, options = {}) {
  if (action === 'list') {
    return runMaestriList(options)
  }
  if (action === 'workspace' || action === 'workspace-list') {
    return runMaestriWorkspaceList(options)
  }
  if (action === 'preset' || action === 'preset-list') {
    return runMaestriPresetList(options)
  }
  if (action === 'role' || action === 'role-list') {
    return runMaestriRoleList(options)
  }
  if (action === 'recruit') {
    return runMaestriRecruit(options)
  }
  if (action === 'ask') {
    return runMaestriAsk(options)
  }
  throw new Error(`Unsupported action: ${action}`)
}

export function parseMaestriList(output) {
  const lines = output.split(/\r?\n/)
  let inYouSection = false
  let inAgentsSection = false
  let isMaestro = false
  let maestroName = null
  const localAgents = []
  const crossWorkspaceAgents = []
  const allNames = []

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (/^You:\s*$/i.test(line.trim())) {
      inYouSection = true
      inAgentsSection = false
      continue
    }
    if (/^Connected agents:\s*$/i.test(line.trim())) {
      inYouSection = false
      inAgentsSection = true
      continue
    }
    if (/^[A-Za-z0-9].*:\s*$/.test(line) || /^No connected/i.test(line.trim())) {
      inYouSection = false
      inAgentsSection = false
      continue
    }

    if (inYouSection) {
      if (/maestro:\s*true\b/i.test(line)) {
        isMaestro = true
      }
      const nameMatch = line.match(/name:\s*"([^"]+)"/) || line.match(/name:\s*([^,\n]+)/)
      if (nameMatch && !maestroName) {
        maestroName = nameMatch[1].trim()
        allNames.push(maestroName)
      }
    }

    if (inAgentsSection) {
      const agentMatch = line.match(/^\s*-\s*name:\s*"([^"]+)"(?:,\s*role:\s*"([^"]+)")?/)
      if (agentMatch) {
        const name = agentMatch[1].trim()
        const role = agentMatch[2] ? agentMatch[2].trim() : null
        allNames.push(name)

        const isCross = /@/.test(name)
        const agentEntry = { name, role }
        if (isCross) {
          crossWorkspaceAgents.push(agentEntry)
        } else {
          localAgents.push(agentEntry)
        }
      }
    }
  }

  return {
    isMaestro,
    maestroName: maestroName || 'Maestro',
    localAgents,
    crossWorkspaceAgents,
    allNames,
  }
}

export function parseActiveWorkspaceRoot(output) {
  const lines = output.split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!/\s+[·•]\s+\(you are here\)\s*$/i.test(line)) {
      continue
    }

    const match = line.match(/^\s*"((?:[^"\\]|\\.)*)"\s*(?:—|–|--|-)\s*(.+)$/)
    if (!match) {
      continue
    }

    let rest = match[2]
    rest = rest.replace(/\s+[·•]\s+\(you are here\)\s*$/i, '')
    rest = rest.replace(/\s*\(\d+\s*floors?\)/gi, '')
    rest = rest.replace(/\s*[·•]\s*$/, '')
    const activePath = rest.trim()
    if (activePath) {
      return activePath
    }
  }
  return null
}

export function pathsMatch(p1, p2) {
  if (!p1 || !p2) return false
  const r1 = path.resolve(p1)
  const r2 = path.resolve(p2)
  if (process.platform === 'win32') {
    return r1.toLowerCase() === r2.toLowerCase()
  }
  return r1 === r2
}

export function parsePresets(output) {
  const presets = new Set()
  const lines = output.split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/^\s*-\s*"([^"]+)"/) || line.match(/^\s*-\s*(\S+)/)
    if (match) {
      presets.add(match[1].trim())
    }
  }
  return presets
}

export function parseRoles(output) {
  const roles = new Set()
  const lines = output.split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/^\s*-\s*"([^"]+)"/)
    if (match) {
      roles.add(match[1].trim())
    }
  }
  return roles
}

export function getUniqueAgentName(baseName, existingNames) {
  let candidate = baseName
  let counter = 2
  while (existingNames.has(candidate)) {
    candidate = `${baseName} ${counter}`
    counter++
  }
  return candidate
}

export function planTeam({
  maestriList,
  workspaceList,
  presetList,
  roleList,
  requestedRoot,
  specialist = 'backend-infra',
}) {
  const listData = parseMaestriList(maestriList)
  if (!listData.isMaestro) {
    return {
      ok: false,
      error: 'Current terminal is not Maestro (required for team recruitment)',
    }
  }

  const activeRoot = parseActiveWorkspaceRoot(workspaceList)
  if (!activeRoot) {
    return {
      ok: false,
      error: 'Unable to detect active workspace root from maestri workspace list',
    }
  }

  if (!fs.existsSync(activeRoot)) {
    return {
      ok: false,
      error: `Active workspace root does not exist on disk: ${activeRoot}`,
    }
  }

  if (requestedRoot) {
    if (!fs.existsSync(requestedRoot)) {
      return {
        ok: false,
        error: `Specified root directory does not exist on disk: ${requestedRoot}`,
      }
    }
    if (!pathsMatch(requestedRoot, activeRoot)) {
      return {
        ok: false,
        error: `Active workspace root mismatch: expected "${requestedRoot}", but active workspace is "${activeRoot}"`,
      }
    }
  }

  const presets = parsePresets(presetList)
  if (!presets.has('omp')) {
    return {
      ok: false,
      error: "Required preset 'omp' is not available in maestri preset list",
    }
  }

  let requiredRoles
  try {
    requiredRoles = getRequiredRoles(specialist)
  } catch (err) {
    return {
      ok: false,
      error: err.message,
    }
  }

  const availableRoles = parseRoles(roleList)
  const missingAvailable = requiredRoles.filter((r) => !availableRoles.has(r))
  if (missingAvailable.length > 0) {
    return {
      ok: false,
      error: `Missing required role(s) in maestri role list: ${missingAvailable.join(', ')}`,
    }
  }

  const reused = []
  const unverifiedReadOnlyReuse = []
  const warnings = []
  const missing = []
  const fulfilledRoles = new Set()

  for (const agent of listData.localAgents) {
    if (agent.role && requiredRoles.includes(agent.role) && !fulfilledRoles.has(agent.role)) {
      if (READ_ONLY_ROLES.has(agent.role)) {
        unverifiedReadOnlyReuse.push({ role: agent.role, name: agent.name })
        warnings.push(
          `Reused read-only role "${agent.role}" on terminal "${agent.name}" without verified runtime tools allowlist (--tools=read,grep,glob).`
        )
      }
      reused.push({ role: agent.role, name: agent.name })
      fulfilledRoles.add(agent.role)
    }
  }

  for (const role of requiredRoles) {
    if (!fulfilledRoles.has(role)) {
      missing.push(role)
    }
  }

  return {
    ok: true,
    activeRoot,
    maestroName: listData.maestroName,
    reused,
    unverifiedReadOnlyReuse,
    warnings,
    missing,
    allNames: listData.allNames,
  }
}

export function inspectOnboarding(root, { projectsFile } = {}) {
  const targetDir = root || process.cwd()
  const agentOsDir = path.join(targetDir, 'agent-os')
  const agentOs = fs.existsSync(agentOsDir)
  const qualityThresholdsPath = path.join(targetDir, 'agent-os', 'quality-thresholds.json')
  const prevcAutonomyPath = path.join(targetDir, 'agent-os', 'prevc-autonomy.json')
  const projectProfilePath = path.join(targetDir, 'agent-os', 'project-profile.json')

  const qualityThresholds = fs.existsSync(qualityThresholdsPath)
  const prevcAutonomy = fs.existsSync(prevcAutonomyPath)
  const projectProfile = fs.existsSync(projectProfilePath)

  let autoConfirm = null
  if (prevcAutonomy) {
    try {
      const parsed = JSON.parse(fs.readFileSync(prevcAutonomyPath, 'utf8'))
      if (typeof parsed?.autoConfirm === 'boolean') {
        autoConfirm = parsed.autoConfirm
      }
    } catch {}
  }

  let fixLoopMaxAttempts = null
  if (projectProfile) {
    try {
      const parsed = JSON.parse(fs.readFileSync(projectProfilePath, 'utf8'))
      if (typeof parsed?.fixLoop?.maxAttempts === 'number') {
        fixLoopMaxAttempts = parsed.fixLoop.maxAttempts
      }
    } catch {}
  }

  const reviewPath = path.join(targetDir, 'docs', 'review.md')
  const prTemplatePath = path.join(targetDir, '.github', 'pull_request_template.md')
  const agentsMdPath = path.join(targetDir, 'AGENTS.md')

  const docs = {
    review: fs.existsSync(reviewPath),
    pullRequestTemplate: fs.existsSync(prTemplatePath),
    agentsMd: fs.existsSync(agentsMdPath),
  }

  const harness = {
    agentOs,
    qualityThresholds,
    prevcAutonomy,
    autoConfirm,
    projectProfile,
    fixLoopMaxAttempts,
  }

  let registered = null
  const regPath =
    projectsFile ||
    process.env.TASK_PIPELINE_PROJECTS ||
    path.join(os.homedir(), '.task-pipeline', 'projects.json')
  try {
    if (fs.existsSync(regPath)) {
      const regData = JSON.parse(fs.readFileSync(regPath, 'utf8'))
      let found = false
      const projectList = Array.isArray(regData?.projects)
        ? regData.projects
        : regData?.projects && typeof regData.projects === 'object'
          ? Object.values(regData.projects)
          : []
      for (const p of projectList) {
        if (p?.repo && pathsMatch(p.repo, targetDir)) {
          found = true
          break
        }
      }
      registered = found
    }
  } catch {
    registered = null
  }

  const missing = []
  if (!harness.agentOs) missing.push('agent-os')
  if (!harness.qualityThresholds) missing.push('qualityThresholds')
  if (!harness.prevcAutonomy) missing.push('prevcAutonomy')
  if (!harness.projectProfile) missing.push('projectProfile')
  if (!docs.review) missing.push('review')
  if (!docs.pullRequestTemplate) missing.push('pullRequestTemplate')
  if (!docs.agentsMd) missing.push('agentsMd')
  if (registered === false) missing.push('registered')

  const advice = []
  if (!harness.agentOs || !harness.qualityThresholds || !harness.projectProfile) {
    advice.push('rode harness-initializer (auditoria) e depois harness-bootstrap')
  }
  if (registered === false || registered === null) {
    advice.push('rode novo-projeto (registro) e depois cerebro-carga-inicial')
  } else {
    advice.push('rode cerebro-carga-inicial se o cérebro estiver desatualizado')
  }
  if (harness.autoConfirm === true) {
    advice.push('autoConfirm está true: recomendado false')
  }

  return {
    harness,
    docs,
    registered,
    missing,
    advice,
  }
}

export function parseCliArgs(argv) {
  let isDryRun = false
  let isApply = false
  let isReset = false
  let root = null
  let projectsFile = null
  let specialist = 'backend-infra'
  let isJson = false
  let model = null
  let thinking = null

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--dry-run') {
      isDryRun = true
    } else if (arg === '--apply') {
      isApply = true
    } else if (arg === '--reset') {
      isReset = true
    } else if (arg === '--json') {
      isJson = true
    } else if (arg === '--help' || arg === '-h') {
      return { isHelp: true }
    } else if (arg === '--root') {
      if (i + 1 >= argv.length) {
        throw new Error('--root requires a directory argument')
      }
      root = argv[++i]
    } else if (arg.startsWith('--root=')) {
      root = arg.slice(7)
    } else if (arg === '--projects-file') {
      if (i + 1 >= argv.length) {
        throw new Error('--projects-file requires a path argument')
      }
      projectsFile = argv[++i]
    } else if (arg.startsWith('--projects-file=')) {
      projectsFile = arg.slice(16)
    } else if (arg === '--specialist') {
      if (i + 1 >= argv.length) {
        throw new Error('--specialist requires an argument (backend-infra or vue)')
      }
      specialist = argv[++i]
    } else if (arg.startsWith('--specialist=')) {
      specialist = arg.slice(13)
    } else if (arg === '--model' || arg === '--thinking') {
      if (i + 1 >= argv.length) {
        throw new Error(`${arg} requires a value`)
      }
      if (arg === '--model') model = argv[++i]
      else thinking = argv[++i]
    } else if (arg.startsWith('--model=')) {
      model = arg.slice(8)
    } else if (arg.startsWith('--thinking=')) {
      thinking = arg.slice(11)
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  if (isReset && !isApply && !isDryRun) {
    throw new Error('--reset requires --apply (or --dry-run for preview).')
  }
  if (!isDryRun && !isApply) {
    throw new Error('One of --dry-run or --apply is required.')
  }
  if (isDryRun && isApply) {
    throw new Error('Cannot specify both --dry-run and --apply.')
  }
  if (isApply && !root) {
    throw new Error('--root is required for --apply to ensure the correct workspace is targeted.')
  }
  if (specialist !== 'backend-infra' && specialist !== 'vue') {
    throw new Error(`Invalid specialist: "${specialist}". Expected "backend-infra" or "vue".`)
  }
  if (model !== null && !MODEL_PATTERN.test(model)) {
    throw new Error(`Invalid model: "${model}". Expected provider/model[:level], e.g. "google-antigravity/gemini-3.8-flash".`)
  }
  if (thinking !== null && !THINKING_LEVELS.has(thinking)) {
    throw new Error(`Invalid thinking level: "${thinking}". Expected one of ${[...THINKING_LEVELS].join(', ')}.`)
  }

  return {
    isDryRun,
    isApply,
    isReset,
    root,
    projectsFile,
    specialist,
    model,
    thinking,
    isJson,
  }
}
export function executeRecruiter(argv, { bin } = {}) {
  let parsed
  try {
    parsed = parseCliArgs(argv)
  } catch (err) {
    return {
      code: 1,
      error: err.message,
      summary: err.message,
    }
  }

  if (parsed.isHelp) {
    return {
      code: 0,
      summary:
        'Usage: node harness-maestri-team.mjs --dry-run [--root <dir>] | --apply --root <dir> [--reset] [--specialist backend-infra|vue] [--model <provider/model>] [--thinking <level>] [--projects-file <path>] [--json]',
    }
  }

  let listRes
  let wsRes
  let presetRes
  let roleRes

  try {
    listRes = runMaestriList({ bin })
    wsRes = runMaestriWorkspaceList({ bin })
    presetRes = runMaestriPresetList({ bin })
    roleRes = runMaestriRoleList({ bin })
  } catch (err) {
    return {
      code: 1,
      error: err.message,
      summary: err.message,
    }
  }

  if (listRes.status !== 0) {
    const err = (listRes.stderr || listRes.stdout || 'maestri list failed').trim()
    return { code: 1, error: err, summary: err }
  }
  if (wsRes.status !== 0) {
    const err = (wsRes.stderr || wsRes.stdout || 'maestri workspace list failed').trim()
    return { code: 1, error: err, summary: err }
  }
  if (presetRes.status !== 0) {
    const err = (presetRes.stderr || presetRes.stdout || 'maestri preset list failed').trim()
    return { code: 1, error: err, summary: err }
  }
  if (roleRes.status !== 0) {
    const err = (roleRes.stderr || roleRes.stdout || 'maestri role list failed').trim()
    return { code: 1, error: err, summary: err }
  }

  const plan = planTeam({
    maestriList: listRes.stdout,
    workspaceList: wsRes.stdout,
    presetList: presetRes.stdout,
    roleList: roleRes.stdout,
    requestedRoot: parsed.root,
    specialist: parsed.specialist,
  })

  if (!plan.ok) {
    return {
      code: 1,
      error: plan.error,
      summary: plan.error,
    }
  }

  const targetRoot = plan.activeRoot || parsed.root
  const onboarding = inspectOnboarding(targetRoot, { projectsFile: parsed.projectsFile })

  const resetCandidates = plan.reused.filter(
    (r) => r.name !== plan.maestroName && plan.allNames.includes(r.name)
  )

  if (parsed.isDryRun) {
    const resetResults = parsed.isReset
      ? resetCandidates.map((m) => ({
          name: m.name,
          status: 'dry-run',
          detail: 'would send /new',
        }))
      : undefined

    const resetPart = parsed.isReset ? ` (${resetCandidates.length} to reset)` : ''
    const summary = `Dry run: 1 Maestro, ${plan.reused.length} reused role(s)${resetPart}, ${plan.missing.length} role(s) to recruit.`
    const responseData = {
      status: 'ok',
      mode: 'dry-run',
      root: plan.activeRoot,
      specialist: parsed.specialist,
      model: parsed.model,
      thinking: parsed.thinking,
      team_size: 10,
      maestro: plan.maestroName,
      reused: plan.reused,
      unverifiedReadOnlyReuse: plan.unverifiedReadOnlyReuse,
      warnings: plan.warnings,
      missing: plan.missing,
      recruited: [],
      onboarding,
      summary,
    }
    if (parsed.isReset) {
      responseData.reset = resetResults
    }
    return {
      code: 0,
      data: responseData,
      summary,
    }
  }

  // Apply mode
  const resetResults = []
  const resetFailed = () => resetResults.some((r) => r.status === "failed")
  if (parsed.isReset) {
    for (const member of resetCandidates) {
      let askRes
      try {
        askRes = runMaestriAsk({ name: member.name, message: '/new\n', bin })
      } catch (err) {
        askRes = { status: 1, stdout: '', stderr: err.message }
      }
      if (askRes.status === 0 || askRes.status === 'ok') {
        resetResults.push({
          name: member.name,
          status: 'ok',
          detail: askRes.detail || (askRes.stdout || '').trim() || 'context reset via /new',
        })
      } else {
        resetResults.push({
          name: member.name,
          status: 'failed',
          detail: askRes.detail || (askRes.stderr || askRes.stdout || 'failed to send /new').trim(),
        })
      }
    }
  }

  if (plan.missing.length === 0) {
    const resetPart = parsed.isReset ? ` (${resetResults.length} reset)` : ''
    const summary = `Team complete: 1 Maestro, ${plan.reused.length} reused role(s)${resetPart}, 0 recruited.`
    const responseData = {
      status: resetFailed() ? "partial" : "ok",
      mode: 'apply',
      root: plan.activeRoot,
      specialist: parsed.specialist,
      model: parsed.model,
      thinking: parsed.thinking,
      team_size: 10,
      maestro: plan.maestroName,
      reused: plan.reused,
      unverifiedReadOnlyReuse: plan.unverifiedReadOnlyReuse,
      warnings: plan.warnings,
      missing: [],
      recruited: [],
      onboarding,
      summary,
    }
    if (parsed.isReset) {
      responseData.reset = resetResults
    }
    return {
      code: resetFailed() ? 1 : 0,
      data: responseData,
      summary,
    }
  }

  const created = []
  const existingNames = new Set(plan.allNames)

  for (const role of plan.missing) {
    const baseName = ROLE_TO_BASE_NAME[role]
    const recruitName = getUniqueAgentName(baseName, existingNames)
    existingNames.add(recruitName)
    const isReadOnly = READ_ONLY_ROLES.has(role)

    let recruitRes
    try {
      recruitRes = runMaestriRecruit({
        name: recruitName,
        role,
        activeRoot: plan.activeRoot,
        isReadOnly,
        model: parsed.model,
        thinking: parsed.thinking,
        bin,
      })
    } catch (err) {
      const summary = `Recruitment failed partway for "${role}". Created ${created.length} role(s) before failure. Rerun to resume.`
      const responseData = {
        status: 'error',
        mode: 'apply',
        error: `Failed to recruit "${role}": ${err.message}`,
        created,
        onboarding,
        summary,
      }
      if (parsed.isReset) {
        responseData.reset = resetResults
      }
      return {
        code: 1,
        error: `Failed to recruit "${role}": ${err.message}`,
        created,
        summary,
        data: responseData,
      }
    }

    if (recruitRes.status !== 0) {
      const err = (recruitRes.stderr || recruitRes.stdout || 'Unknown recruit error').trim()
      const failureMsg = `Failed to recruit "${role}": ${err}`
      const summary = `Recruitment failed partway for "${role}". Created ${created.length} role(s) before failure. Rerun to resume.`
      const responseData = {
        status: 'error',
        mode: 'apply',
        error: failureMsg,
        created,
        onboarding,
        summary,
      }
      if (parsed.isReset) {
        responseData.reset = resetResults
      }
      return {
        code: 1,
        error: failureMsg,
        created,
        summary,
        data: responseData,
      }
    }

    let currentListRes
    try {
      currentListRes = runMaestriList({ bin })
    } catch (err) {
      const failureMsg = `Post-recruit roster check failed for "${role}": ${err.message}`
      const summary = `Recruitment failed partway for "${role}". Created ${created.length} role(s) before failure. Rerun to resume.`
      const responseData = {
        status: 'error',
        mode: 'apply',
        error: failureMsg,
        created,
        onboarding,
        summary,
      }
      if (parsed.isReset) {
        responseData.reset = resetResults
      }
      return {
        code: 1,
        error: failureMsg,
        created,
        summary,
        data: responseData,
      }
    }

    if (currentListRes.status !== 0) {
      const err = (currentListRes.stderr || currentListRes.stdout || 'maestri list failed').trim()
      const failureMsg = `Post-recruit roster check failed for "${role}": ${err}`
      const summary = `Recruitment failed partway for "${role}". Created ${created.length} role(s) before failure. Rerun to resume.`
      const responseData = {
        status: 'error',
        mode: 'apply',
        error: failureMsg,
        created,
        onboarding,
        summary,
      }
      if (parsed.isReset) {
        responseData.reset = resetResults
      }
      return {
        code: 1,
        error: failureMsg,
        created,
        summary,
        data: responseData,
      }
    }

    const updatedList = parseMaestriList(currentListRes.stdout)
    const verified = updatedList.localAgents.some(
      (agent) => agent.name === recruitName && agent.role === role
    )

    if (!verified) {
      const failureMsg = `Post-recruit verification failed for "${role}" (${recruitName}): role missing from local roster`
      const summary = `Recruitment failed partway for "${role}". Created ${created.length} role(s) before failure. Rerun to resume.`
      const responseData = {
        status: 'error',
        mode: 'apply',
        error: failureMsg,
        created,
        onboarding,
        summary,
      }
      if (parsed.isReset) {
        responseData.reset = resetResults
      }
      return {
        code: 1,
        error: failureMsg,
        created,
        summary,
        data: responseData,
      }
    }

    for (const name of updatedList.allNames) {
      existingNames.add(name)
    }

    created.push({ role, name: recruitName })
  }

  const resetPart = parsed.isReset ? ` (${resetResults.length} reset)` : ''
  const summary = `Successfully recruited ${created.length} role(s)${resetPart}. Team now has 10 members.`
  const responseData = {
    status: resetFailed() ? "partial" : "ok",
    mode: 'apply',
    root: plan.activeRoot,
    specialist: parsed.specialist,
    model: parsed.model,
    thinking: parsed.thinking,
    team_size: 10,
    maestro: plan.maestroName,
    reused: plan.reused,
    unverifiedReadOnlyReuse: plan.unverifiedReadOnlyReuse,
    warnings: plan.warnings,
    missing: [],
    recruited: created,
    onboarding,
    summary,
  }
  if (parsed.isReset) {
    responseData.reset = resetResults
  }
  return {
    code: resetFailed() ? 1 : 0,
    data: responseData,
    summary,
  }
}


export function runCli(argv, { bin } = {}) {
  let isJson = argv.includes('--json')
  const result = executeRecruiter(argv, { bin })

  if (isJson) {
    if (result.data) {
      console.log(JSON.stringify(result.data, null, 2))
    } else {
      console.log(
        JSON.stringify(
          {
            status: result.code === 0 ? 'ok' : 'error',
            error: result.error || null,
            summary: result.summary,
          },
          null,
          2
        )
      )
    }
  } else {
    if (result.code === 0) {
      console.log(result.summary)
      if (result.data?.reused?.length) {
        console.log('Reused roles:')
        for (const r of result.data.reused) {
          console.log(`  - ${r.role} (${r.name})`)
        }
      }
      if (result.data?.reset?.length) {
        console.log('Reset members:')
        for (const r of result.data.reset) {
          console.log(`  - ${r.name}: ${r.status} (${r.detail})`)
        }
      }
      if (result.data?.recruited?.length) {
        console.log('Recruited roles:')
        for (const r of result.data.recruited) {
          console.log(`  - ${r.role} (${r.name})`)
        }
      }
      if (result.data?.missing?.length) {
        console.log('Roles to recruit:')
        for (const m of result.data.missing) {
          console.log(`  - ${m}`)
        }
      }
      if (result.data?.warnings?.length) {
        console.warn('Warnings:')
        for (const w of result.data.warnings) {
          console.warn(`  - ${w}`)
        }
      }
    } else {
      console.error(`Error: ${result.error || result.summary}`)
      if (result.created?.length) {
        console.error('Created before failure:')
        for (const c of result.created) {
          console.error(`  - ${c.role} (${c.name})`)
        }
      }
    }
  }

  return result.code
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = runCli(process.argv.slice(2))
  process.exit(code)
}
