// Deterministically render fresh-session progress from PREVC state.
// This script never mutates lifecycle state; only --write updates progress.md.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export const STATE_REL = path.join("docs", "harness", "state", "prevc.json")
export const PROGRESS_REL = path.join("docs", "harness", "progress.md")

function readState(root) {
  const file = path.join(root, STATE_REL)
  const state = JSON.parse(fs.readFileSync(file, "utf8"))
  if (!state || Array.isArray(state) || typeof state !== "object" || typeof state.phase !== "string") {
    throw new Error("PREVC state must be an object with phase")
  }
  return state
}

export function renderProgress(state) {
  const blocker = state.blocker && typeof state.blocker === "object"
    ? state.blocker.reason ?? state.blocker.message ?? JSON.stringify(state.blocker)
    : state.blocker ?? "None."
  const next = state.phase === "complete" ? "No further action; operator may start next objective."
    : state.phase === "aborted" ? "Start a new PREVC objective after resolving the abort reason."
    : `Continue PREVC from phase \`${state.phase}\`.`
  const objective = String(state.objective ?? "Unspecified objective").trim()
  const spec = String(state.specPath ?? "unspecified")
  const risk = String(state.risk ?? "unspecified")
  const verified = state.updatedAt ? `PREVC inspect state read at ${state.updatedAt}.` : "PREVC state read successfully."
  return `# Harness Progress\n\nGenerated from PREVC state. Lifecycle state remains authoritative; this file is a derived, deterministic view.\n\n## Current Active Work\n**${objective}** — phase \`${state.phase}\`, risk \`${risk}\`, spec \`${spec}\`.\n\n## Verification Status\n- ${verified}\n- State history entries: ${Array.isArray(state.history) ? state.history.length : 0}.\n\n## Blockers\n- ${blocker || "None."}\n\n## Decisions Log\n- Lifecycle phase is read from docs/harness/state/prevc.json; progress generation does not write or transition state.\n\n## Next Best Action\n${next}\n`
}

export function generateProgress(root, { write = false } = {}) {
  const state = readState(root)
  const content = renderProgress(state)
  if (write) fs.writeFileSync(path.join(root, PROGRESS_REL), content, "utf8")
  return { state, content, path: path.join(root, PROGRESS_REL), wrote: write }
}

function cli() {
  const args = process.argv.slice(2)
  const value = (flag, fallback) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : fallback }
  const root = path.resolve(value("--root", path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")))
  try {
    const result = generateProgress(root, { write: args.includes("--write") })
    if (args.includes("--json")) console.log(JSON.stringify({ phase: result.state.phase, content: result.content, wrote: result.wrote }, null, 2))
    else process.stdout.write(result.content)
  } catch (error) {
    console.error(`harness-progress: ${error.message}`)
    process.exitCode = 2
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) cli()
