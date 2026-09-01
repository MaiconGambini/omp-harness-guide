// harness-freshsession — the fresh-session readability test, as an assert.
//
// harness-readable-workspace is a *procedure*: it asks four questions and a
// human answers them from the conversation. Nothing checked them. This script
// answers them from files only — no conversation context — and exits non-zero
// when it cannot, so the ritual becomes a check.
//
//   | Question                         | Resolved from                                   |
//   |----------------------------------|-------------------------------------------------|
//   | What does this repo do?          | root instructions (AGENTS.md, CLAUDE.md, README) |
//   | How do I start and verify?       | the discovered startup path                     |
//   | What is unfinished?              | discovered progress and feature state           |
//   | What is the single next action?  | the progress file's next-action section         |
//
// Discovery order reuses harness-startup-path and harness-session-start, and
// assumes NO path: no init.ps1, no feature_list.json, no .specs/project/STATE.md
// — a script that assumed them would fail on the harness itself.
//
// Exit codes match the gate's meaning:
//   0  all four questions resolve from files
//   1  at least one question is unanswerable — a project gap, named not crashed
//   2  the script itself could not run — a harness blocker, never a project failure

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { pathExists, readTextIfExists } from "./harness-common.mjs"
import { readJsonIfExists } from "./harness-quality-core.mjs"

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

// ---------------------------------------------------------------------------
// question 1 — root instructions

const ROOT_INSTRUCTIONS = ["AGENTS.md", "CLAUDE.md", "README.md"]

function answerWhatTheRepoDoes(root) {
  for (const relative of ROOT_INSTRUCTIONS) {
    const full = path.join(root, relative)
    if (!pathExists(full)) continue
    const text = readTextIfExists(full).trim()
    if (!text) continue
    return { answerable: true, source: relative }
  }
  return { answerable: false, gap: `no root instructions (${ROOT_INSTRUCTIONS.join(", ")})` }
}

// ---------------------------------------------------------------------------
// question 2 — the discovered startup path (harness-startup-path order)

function findStartupPath(root) {
  // 1. existing explicit scripts
  if (pathExists(path.join(root, "init.ps1"))) return { command: ".\\init.ps1", source: "init.ps1" }
  if (pathExists(path.join(root, "init.sh"))) return { command: "./init.sh", source: "init.sh" }
  const scriptsDir = path.join(root, "scripts")
  if (pathExists(scriptsDir)) {
    const checks = fs.readdirSync(scriptsDir).filter((name) => name.startsWith("check-")).sort()
    if (checks.length > 0) return { command: `node scripts/${checks[0]}`, source: `scripts/${checks[0]}` }
  }
  const makefile = readTextIfExists(path.join(root, "Makefile"))
  if (makefile) {
    for (const target of ["check", "test", "build"]) {
      if (new RegExp(`^${target}:`, "m").test(makefile)) return { command: `make ${target}`, source: "Makefile" }
    }
    return { command: "make", source: "Makefile" }
  }

  // 2. package managers
  const packageManagers = [
    { lock: "package-lock.json", pm: "npm" },
    { lock: "pnpm-lock.yaml", pm: "pnpm" },
    { lock: "yarn.lock", pm: "yarn" },
    { lock: "bun.lockb", pm: "bun" },
  ]
  for (const { lock, pm } of packageManagers) {
    if (!pathExists(path.join(root, lock))) continue
    const scripts = readJsonIfExists(path.join(root, "package.json"))?.scripts ?? {}
    if (scripts.test) return { command: `${pm} test`, source: lock }
    if (scripts.build) return { command: `${pm} run build`, source: lock }
    return { command: `${pm} install`, source: lock }
  }
  // A bare package.json is still npm — the lockfile may simply be gitignored.
  const pkgScripts = readJsonIfExists(path.join(root, "package.json"))?.scripts ?? {}
  if (Object.keys(pkgScripts).length > 0) {
    if (pkgScripts.test) return { command: "npm test", source: "package.json" }
    if (pkgScripts.build) return { command: "npm run build", source: "package.json" }
    return { command: "npm install", source: "package.json" }
  }

  // 3. python
  if (pathExists(path.join(root, "uv.lock"))) return { command: "uv sync && uv run pytest", source: "uv.lock" }
  if (pathExists(path.join(root, "pyproject.toml"))) return { command: "uv run pytest", source: "pyproject.toml" }
  if (pathExists(path.join(root, "requirements.txt"))) return { command: "pip install -r requirements.txt && pytest", source: "requirements.txt" }

  // 4. other stacks
  if (pathExists(path.join(root, "Cargo.toml"))) return { command: "cargo test", source: "Cargo.toml" }
  if (pathExists(path.join(root, "go.mod"))) return { command: "go test ./...", source: "go.mod" }
  if (pathExists(path.join(root, "docker-compose.yml")) || pathExists(path.join(root, "compose.yml"))) {
    return { command: "docker compose config", source: "docker-compose.yml" }
  }

  // 5. CI files — last resort: a workflow names commands, but it is CI-only
  const workflows = path.join(root, ".github", "workflows")
  if (pathExists(workflows)) {
    const entries = fs.readdirSync(workflows).sort()
    if (entries.length > 0) {
      return { command: null, source: `.github/workflows/${entries[0]}`, note: "CI-only — inspect the workflow for the real command" }
    }
  }
  return null
}

function answerHowToStart(root) {
  const found = findStartupPath(root)
  if (!found) {
    return {
      answerable: false,
      gap: "no startup path: no init.ps1, init.sh, scripts/check-*, Makefile, package lock, python manifest, other-stack manifest or CI workflow",
    }
  }
  return { answerable: true, source: found.source, command: found.command ?? found.note }
}

// ---------------------------------------------------------------------------
// questions 3 & 4 — progress and feature state (harness-session-start order)

const PROGRESS_FILES = [path.join(".specs", "project", "STATE.md"), path.join("docs", "harness", "progress.md"), "agent-progress.md"]
const FEATURE_FILES = ["feature_list.json", path.join(".specs", "features")]

function newestSpecDir(root) {
  const specs = path.join(root, "agent-os", "specs")
  if (!pathExists(specs)) return null
  const candidates = fs
    .readdirSync(specs, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(specs, entry.name))
    // Spec slugs are timestamp-prefixed, so name order is creation order.
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
  return candidates[0] ?? null
}

function findTasksMd(root) {
  const features = path.join(root, ".specs", "features")
  if (!pathExists(features)) return null
  const found = []
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === "tasks.md") found.push(full)
    }
  }
  walk(features)
  return found[0] ?? null
}

function findProgressState(root) {
  for (const relative of PROGRESS_FILES) {
    if (pathExists(path.join(root, relative))) return { kind: "progress", relative, full: path.join(root, relative) }
  }
  if (pathExists(path.join(root, "feature_list.json"))) {
    return { kind: "feature", relative: "feature_list.json", full: path.join(root, "feature_list.json") }
  }
  const spec = newestSpecDir(root)
  if (spec) {
    for (const name of ["spec.md", "tasks.md"]) {
      const candidate = path.join(spec, name)
      if (pathExists(candidate)) return { kind: "feature", relative: path.relative(root, candidate), full: candidate }
    }
  }
  const tasksMd = findTasksMd(root)
  if (tasksMd) return { kind: "feature", relative: path.relative(root, tasksMd), full: tasksMd }
  return null
}

// "Current Active Work" is what a progress file actually says is unfinished.
function activeWorkExcerpt(text) {
  const match = text.match(/^#{2,3}\s+Current Active Work\s*$/m)
  if (!match) return null
  const rest = text.slice(match.index + match[0].length)
  const section = rest.split(/\n#{2,3}\s+/)[0]
  const content = section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && line !== "_None._")
  return content.length ? content.slice(0, 3).join(" ").slice(0, 200) : null
}

function answerWhatIsUnfinished(root) {
  const state = findProgressState(root)
  if (!state) {
    return {
      answerable: false,
      gap: `no progress file (${PROGRESS_FILES.join(", ")}) and no feature state (${FEATURE_FILES.join(", ")}, agent-os/specs/*/spec.md|tasks.md)`,
    }
  }
  const excerpt = state.kind === "progress" ? activeWorkExcerpt(readTextIfExists(state.full)) : null
  return { answerable: true, source: state.relative, ...(excerpt ? { detail: excerpt } : {}) }
}

// The progress file's next-action section: `## Next Best Action` (the canonical
// heading from harness-progress-log and the progress template), accepting
// `## Next Action` as well. A placeholder section does not answer the question.
function nextActionFrom(text) {
  const match = text.match(/^#{2,3}\s+Next(?:\s+Best)?\s+Action\s*$/m)
  if (!match) return null
  const rest = text.slice(match.index + match[0].length)
  const section = rest.split(/\n#{2,3}\s+/)[0]
  const content = section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && line !== "_None._")
  return content.length ? content.slice(0, 3).join(" ").slice(0, 200) : null
}

function answerNextAction(root) {
  for (const relative of PROGRESS_FILES) {
    const full = path.join(root, relative)
    if (!pathExists(full)) continue
    const action = nextActionFrom(readTextIfExists(full))
    if (action) return { answerable: true, source: relative, detail: action }
    return {
      answerable: false,
      gap: `${relative} has no "Next Best Action" section with a real next action`,
    }
  }
  return { answerable: false, gap: `no progress file (${PROGRESS_FILES.join(", ")}) with a next-action section` }
}

// ---------------------------------------------------------------------------
// the assert

export function freshSessionCheck(root) {
  const questions = [
    { question: "What does this repo do?", answer: answerWhatTheRepoDoes(root) },
    { question: "How do I start and verify?", answer: answerHowToStart(root) },
    { question: "What is unfinished?", answer: answerWhatIsUnfinished(root) },
    { question: "What is the single next action?", answer: answerNextAction(root) },
  ]
  const answerable = questions.filter((entry) => entry.answer.answerable).length
  return { questions, answerable, total: questions.length, exitCode: answerable === questions.length ? 0 : 1 }
}

function renderRows(result) {
  const rows = result.questions.map((entry, index) => {
    const { answerable, source, command, detail, gap } = entry.answer
    return `[${index + 1}] ${entry.question}\n    answerable: ${answerable ? "yes" : "no"}${source ? ` | source: ${source}` : ""}${
      command ? ` | command: ${command}` : ""
    }${detail ? ` | ${detail}` : ""}${gap ? `\n    gap: ${gap}` : ""}`
  })
  return rows.join("\n")
}

function runCli() {
  const args = process.argv.slice(2)
  const valueOf = (flag, fallback) => {
    const index = args.indexOf(flag)
    return index !== -1 && args[index + 1] ? args[index + 1] : fallback
  }
  const root = path.resolve(valueOf("--project", SCRIPT_ROOT))

  let result
  try {
    if (!pathExists(root)) throw new Error(`project root ${root} does not exist`)
    result = freshSessionCheck(root)
  } catch (error) {
    // Exit 2: the assert itself broke. A harness blocker, never a project failure.
    console.error(`harness-freshsession could not run: ${error.message}`)
    process.exitCode = 2
    return
  }

  if (args.includes("--json")) {
    console.log(JSON.stringify(result, null, 2))
  } else if (result.exitCode === 0) {
    console.log(`fresh-session: ${result.answerable} of ${result.total} questions answerable from files.`)
    console.log(renderRows(result))
    console.log("Result: a fresh session can orient from the repository alone.")
  } else {
    console.log(`fresh-session: ${result.answerable} of ${result.total} questions answerable from files.`)
    console.log(renderRows(result))
    console.log(`Result: a fresh session cannot orient — ${result.total - result.answerable} question(s) unresolved. The gaps above name what is missing.`)
  }
  process.exitCode = result.exitCode
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli()
