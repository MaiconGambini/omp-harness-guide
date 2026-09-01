// harness-process-skill — automatic process-skill proposal tracker (R5).
//
// A tracker proposes generated skills into `agent-os/skills-proposals/` when a process
// recurs (the same command sequence >= 3 times within 14 days). Proposals are INERT
// artifacts: no auto-install, no auto-activation, no dispatch reference. Activation is
// one explicit operator command (`--activate <slug>`) that validates the candidate
// (frontmatter, naming, writing-skills checks) and only then installs it into
// `skills/<slug>/` where the OMP exporter picks it up.
//
// Scan input: `--scan <history-file>` — a JSON array of command entries
// [{ts: "<ISO>", cmd: "<command line>"}] (or JSONL). Sequence = the base command names
// in chronological order; windows of 3-6 commands that occur >= 3 times within 14 days
// become candidates. One proposal per pattern per scan.
//
// Zero auto-activation: `--scan` never writes into `skills/`. Only `--activate` may,
// and only after validation. No background watchers, no hooks.

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

export const PROPOSALS_DIR = path.join("agent-os", "skills-proposals")
export const SKILLS_DIR = path.join("skills")
export const WINDOW_DAYS = 14
export const MIN_REPEATS = 3
const WINDOW_SIZES = [3, 4, 5, 6]

const isoDay = (date) => date.toISOString().slice(0, 10)

function baseCommand(cmd) {
  // Command + first argument keep `npm test` vs `npm run typecheck` distinct while
  // staying stable across paths and flags.
  return String(cmd ?? "").trim().split(/\s+/).slice(0, 2).join(" ") || ""
}

export function loadHistory(historyFile) {
  const text = fs.readFileSync(historyFile, "utf8")
  const parsed = JSON.parse(text)
  const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed.entries) ? parsed.entries : null
  if (!entries) throw new Error("history must be a JSON array of {ts, cmd} entries (or {entries: [...]})")
  return entries
    .map((entry) => ({ ts: new Date(entry.ts ?? entry.timestamp), cmd: String(entry.cmd ?? "") }))
    .filter((entry) => !Number.isNaN(entry.ts.getTime()) && entry.cmd.trim())
    .sort((a, b) => (a.ts < b.ts ? -1 : 1))
}

export function findPatterns(history) {
  const base = history.map((entry) => ({ ...entry, base: baseCommand(entry.cmd) })).filter((entry) => entry.base)
  const counts = new Map() // "seq" -> { count, first: Date, last: Date }
  for (const size of WINDOW_SIZES) {
    for (let index = 0; index + size <= base.length; index += 1) {
      const window = base.slice(index, index + size)
      const key = window.map((entry) => entry.base).join("|")
      const existing = counts.get(key)
      if (existing) {
        existing.count += 1
        existing.first = existing.first < window[0].ts ? existing.first : window[0].ts
        existing.last = existing.last > window[size - 1].ts ? existing.last : window[size - 1].ts
        existing.example = window
      } else {
        counts.set(key, { count: 1, first: window[0].ts, last: window[size - 1].ts, example: window })
      }
    }
  }
  const candidates = []
  for (const [key, info] of counts) {
    if (info.count < MIN_REPEATS) continue
    const spanDays = (info.last.getTime() - info.first.getTime()) / 86_400_000
    if (spanDays > WINDOW_DAYS) continue
    candidates.push({ sequence: key.split("|"), count: info.count, first: info.first.toISOString(), last: info.last.toISOString() })
  }
  // Deterministic: longest sequence wins ties, then most frequent, then lexicographic.
  return candidates
    .sort((a, b) => b.sequence.length - a.sequence.length || b.count - a.count || a.sequence.join("|").localeCompare(b.sequence.join("|")))
}

export function slugFor(sequence) {
  return sequence
    .map((part) => part.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .join("-")
    .slice(0, 60)
    .replace(/-+$/, "")
}

export function proposalTemplate({ name, description, sequence, count, first, last }) {
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "generated: true",
    `basedOn: ${JSON.stringify({ sequence, count, firstSeen: first, lastSeen: last })}`,
    "---",
    "",
    `# ${name}`,
    "",
    `Automatically proposed by \`harness-process-skill.mjs --scan\` (guardrails v2, R5).`,
    `This proposal is INERT — it is not installed, activated, or dispatched until the`,
    `operator runs \`node scripts/harness-process-skill.mjs --activate ${name}\`.`,
    "",
    `## When to use`,
    "",
    `Run this skill when the task matches the recurring sequence:`,
    "",
    "```",
    ...sequence.map((step) => `1. ${step}`),
    "```",
    "",
    `Observed ${count} times between ${first} and ${last}.`,
    "",
  ].join("\n")
}

export function listProposals(root) {
  const dir = path.join(root, PROPOSALS_DIR)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(dir, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort()
}

export function scanProposals(root, historyFile) {
  const history = loadHistory(historyFile)
  const candidates = findPatterns(history)
  if (candidates.length === 0) return { proposals: [], reason: "no sequence repeated 3+ times within 14 days" }
  const best = candidates[0]
  const slug = slugFor(best.sequence)
  const name = slug
  const description = `Recurring process (${best.count} occurrences in 14 days): ${best.sequence.join(" → ")}.`
  const content = proposalTemplate({ name, description, sequence: best.sequence, count: best.count, first: best.first, last: best.last })
  const target = path.join(root, PROPOSALS_DIR, slug, "SKILL.md")
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content, "utf8")
  return { proposals: [slug], slug, target: path.relative(root, target), sequence: best.sequence, count: best.count }
}

// writing-skills checklist (bounded): name = slug pattern, required frontmatter,
// no executable frontmatter fields, description present and non-empty.
export function validateCandidate(root, slug) {
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(slug)) {
    return { ok: false, reason: `invalid slug ${JSON.stringify(slug)} — lowercase alphanumeric + hyphens only` }
  }
  const dir = path.join(root, PROPOSALS_DIR, slug)
  const file = path.join(dir, "SKILL.md")
  if (!fs.existsSync(file)) return { ok: false, reason: `no proposal at ${PROPOSALS_DIR}/${slug}/SKILL.md` }
  const text = fs.readFileSync(file, "utf8")
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!frontmatter) return { ok: false, reason: "proposal has no frontmatter block" }
  const body = frontmatter[1]
  const name = body.match(/^name:\s*(.+)$/m)?.[1]?.trim()
  const description = body.match(/^description:\s*(.+)$/m)?.[1]?.trim()
  const generated = body.match(/^generated:\s*(true|false)$/m)?.[1]
  if (!name || name !== slug) return { ok: false, reason: `frontmatter name ${JSON.stringify(name)} must equal the slug ${JSON.stringify(slug)}` }
  if (!description) return { ok: false, reason: "frontmatter description is required and must be non-empty" }
  if (generated !== "true") return { ok: false, reason: "proposal is not marked generated: true — activation refuses hand-written candidates" }
  if (/^(run|command|execute|tools|permissions|model):/m.test(body)) {
    return { ok: false, reason: "frontmatter carries executable fields (run/command/execute/tools/permissions/model) — refused" }
  }
  return { ok: true, name, description }
}

export function activateProposal(root, slug) {
  const validated = validateCandidate(root, slug)
  if (!validated.ok) return { ok: false, reason: validated.reason }
  const source = path.join(root, PROPOSALS_DIR, slug)
  const targetDir = path.join(root, SKILLS_DIR, slug)
  if (fs.existsSync(targetDir)) return { ok: false, reason: `${SKILLS_DIR}/${slug} already exists — activation refused` }
  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
fs.mkdirSync(targetDir, { recursive: true })
  fs.renameSync(path.join(source, "SKILL.md"), path.join(targetDir, "SKILL.md"))
  fs.rmSync(source, { recursive: true, force: true })
  return { ok: true, installed: path.relative(root, path.join(targetDir, "SKILL.md")) }
}

function runCli() {
  const args = process.argv.slice(2)
  const valueOf = (flag) => {
    const index = args.indexOf(flag)
    return index !== -1 && args[index + 1] ? args[index + 1] : null
  }
  const root = path.resolve(valueOf("--root") ?? process.cwd())

  if (args.includes("--scan")) {
    const historyFile = valueOf("--scan")
    if (!historyFile) {
      console.error("harness-process-skill: --scan requires a history file argument")
      process.exitCode = 1
      return
    }
    try {
      const result = scanProposals(root, path.resolve(historyFile))
      console.log(JSON.stringify(result, null, 2))
    } catch (error) {
      console.error(`harness-process-skill: ${error.message}`)
      process.exitCode = 1
    }
    return
  }

  if (args.includes("--activate")) {
    const slug = valueOf("--activate")
    const result = activateProposal(root, slug)
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
    return
  }

  if (args.includes("--list")) {
    console.log(JSON.stringify({ proposals: listProposals(root) }, null, 2))
    return
  }

  console.error("harness-process-skill: use --scan <history-file>, --activate <slug>, or --list")
  process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli()
