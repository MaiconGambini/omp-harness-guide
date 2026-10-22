#!/usr/bin/env node
// harness-briefing — derive a small, path-scoped context briefing from durable project
// state, NOT from chat memory. The checkout, tests and runtime outrank this briefing; it
// is a projection of canonical state, never a second source of truth.
//
// What it loads (in trust order, matching the plan's recovery order):
//   1. objective + next action        docs/harness/progress.md
//   2. blockers + last verified        docs/harness/progress.md
//   3. governing decisions (recent)    agent-os/quality-decisions.md
//   4. active learned rules            agent-os/learned-rules.json (optional)
//
// Every briefing carries a `sourceHash` over the exact bytes it was derived from. A
// consumer (session start, compaction) recomputes the hash and REFUSES a stale briefing
// rather than injecting outdated state silently — absence is a gap to name, never a pass.
//
// Usage:
//   node scripts/harness-briefing.mjs            human-readable briefing
//   node scripts/harness-briefing.mjs --json     machine-readable { sourceHash, sections }
//   node scripts/harness-briefing.mjs --check <hash>   exit 0 fresh, 3 stale, 2 no state

import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"

const PROGRESS_FILE = path.join("docs", "harness", "progress.md")
const DECISIONS_FILE = path.join("agent-os", "quality-decisions.md")
const RULES_FILE = path.join("agent-os", "learned-rules.json")

export function readTextIfExists(full) {
  try {
    return fs.readFileSync(full, "utf8")
  } catch {
    return null
  }
}

// Pull a `## Heading` section's non-placeholder lines. Mirrors harness-freshsession's
// parser so a briefing and a fresh-session check agree on what counts as real content.
export function sectionLines(text, heading) {
  if (!text) return []
  const match = text.match(new RegExp(`^#{2,3}\\s+${heading}\\s*$`, "m"))
  if (!match) return []
  const rest = text.slice(match.index + match[0].length)
  const section = rest.split(/\n#{2,3}\s+/)[0]
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && line !== "_None._")
}

// Active rules only: a retired or observe-only rule is not injected as if it governs.
export function activeRules(rulesText) {
  if (!rulesText) return []
  let parsed
  try {
    parsed = JSON.parse(rulesText)
  } catch {
    return []
  }
  const rules = Array.isArray(parsed?.rules) ? parsed.rules : []
  return rules
    .filter((rule) => rule && rule.status === "active")
    .map((rule) => ({ id: rule.id ?? null, text: rule.text ?? "", target: rule.target ?? null }))
}

export function buildBriefing(root) {
  const progressPath = path.join(root, PROGRESS_FILE)
  const decisionsPath = path.join(root, DECISIONS_FILE)
  const rulesPath = path.join(root, RULES_FILE)

  const progressText = readTextIfExists(progressPath)
  const decisionsText = readTextIfExists(decisionsPath)
  const rulesText = readTextIfExists(rulesPath)

  if (!progressText) {
    return { ok: false, gap: `no progress file at ${PROGRESS_FILE} — run harness-session-start to create durable state` }
  }

  const activeWork = sectionLines(progressText, "Current Active Work").slice(0, 3)
  const nextAction = sectionLines(progressText, "Next Best Action").slice(0, 3)
  const blockers = sectionLines(progressText, "Blockers").slice(0, 4)
  const verified = sectionLines(progressText, "Verified Now").slice(0, 4)

  if (nextAction.length === 0) {
    return { ok: false, gap: `${PROGRESS_FILE} has no "Next Best Action" section — the next session cannot orient` }
  }

  // Recent decisions only — the last few dated lines, not the whole history.
  const decisionLines = (decisionsText ?? "")
    .split("\n")
    .filter((line) => /^\s*-\s+\d{4}-\d{2}-\d{2}/.test(line))
    .slice(-3)
    .map((line) => line.trim())

  const rules = activeRules(rulesText)

  // Hash the EXACT source bytes this briefing was derived from. Order fixed so the hash is
  // stable across runs. A stale consumer recomputes this and refuses on mismatch.
  const sourceHash = crypto
    .createHash("sha256")
    .update(progressText, "utf8")
    .update(decisionsText ?? "", "utf8")
    .update(rulesText ?? "", "utf8")
    .digest("hex")
    .slice(0, 16)

  return {
    ok: true,
    sourceHash,
    sections: { activeWork, nextAction, blockers, verified, decisions: decisionLines, rules },
  }
}

export function renderBriefing(briefing) {
  if (!briefing.ok) return `briefing unavailable: ${briefing.gap}`
  const { sections, sourceHash } = briefing
  const out = [`# Context briefing (sourceHash ${sourceHash}) — durable state, not chat memory`, ""]
  const block = (title, lines) => {
    if (!lines || lines.length === 0) return
    out.push(`## ${title}`)
    for (const line of lines) out.push(line.startsWith("-") || line.startsWith("*") ? line : `- ${line}`)
    out.push("")
  }
  block("Active work", sections.activeWork)
  block("Next action", sections.nextAction)
  block("Blockers", sections.blockers)
  block("Verified now", sections.verified)
  block("Recent decisions", sections.decisions)
  block("Active rules", sections.rules.map((rule) => `${rule.id ? `[${rule.id}] ` : ""}${rule.text}${rule.target ? ` (${rule.target})` : ""}`))
  out.push("_The checkout, tests and runtime outrank this briefing. Treat any conflict as a finding, not a fact._")
  return out.join("\n")
}

function main(argv, root) {
  const briefing = buildBriefing(root)

  const checkIndex = argv.indexOf("--check")
  if (checkIndex !== -1) {
    const expected = argv[checkIndex + 1]
    if (!briefing.ok) {
      process.stdout.write(`briefing: no durable state (${briefing.gap})\n`)
      return 2
    }
    if (expected !== briefing.sourceHash) {
      process.stdout.write(`briefing: STALE — expected ${expected}, current ${briefing.sourceHash}. Regenerate before injecting.\n`)
      return 3
    }
    process.stdout.write(`briefing: fresh (sourceHash ${briefing.sourceHash})\n`)
    return 0
  }

  if (argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(briefing, null, 2)}\n`)
    return briefing.ok ? 0 : 2
  }

  process.stdout.write(`${renderBriefing(briefing)}\n`)
  return briefing.ok ? 0 : 2
}

// Run only when invoked directly (not when imported by tests). fileURLToPath
// decodes percent-encoding and handles the Windows drive-letter correctly — a
// hand-rolled URL.pathname regex leaves a path with a space encoded and the
// comparison silently false, which made the whole CLI inert on such installs.
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (invokedDirectly) {
  process.exit(main(process.argv.slice(2), process.cwd()))
}
