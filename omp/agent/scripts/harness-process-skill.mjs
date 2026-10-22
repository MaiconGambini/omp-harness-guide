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
import { DatabaseSync } from "node:sqlite"
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
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return loadSessionJsonl(historyFile)
  }
  const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed.entries) ? parsed.entries : null
  if (!entries) throw new Error("history must be a JSON array of {ts, cmd} entries (or {entries: [...]})")
  return entries
    .map((entry) => ({ ts: new Date(entry.ts ?? entry.timestamp), cmd: String(entry.cmd ?? "") }))
    .filter((entry) => !Number.isNaN(entry.ts.getTime()) && entry.cmd.trim())
    .sort((a, b) => (a.ts < b.ts ? -1 : 1))
}

const sortEntries = (entries) => entries.sort((a, b) => a.ts.getTime() - b.ts.getTime())

const normalizeSessionEntry = (entry, label) => {
  if (!entry || typeof entry !== "object" || typeof entry.cmd !== "string" || !entry.cmd.trim()) {
    throw new Error(`${label} must contain a non-empty string cmd`)
  }
  if (typeof entry.ts !== "string" || !entry.ts.trim()) throw new Error(`${label} must contain a string ISO ts`)
  const ts = new Date(entry.ts)
  if (Number.isNaN(ts.getTime())) throw new Error(`${label} must contain a valid ISO ts`)
  return { ts, cmd: entry.cmd.trim() }
}

export function loadSqliteHistory(historyDb) {
  let db
  try {
    db = new DatabaseSync(historyDb, { readOnly: true })
    const rows = db
      .prepare("SELECT prompt, created_at, cwd, session_id FROM history ORDER BY created_at ASC, rowid ASC")
      .all()
    return sortEntries(rows.map((row, index) => {
      const createdAt = Number(row.created_at)
      if (!Number.isFinite(createdAt)) throw new Error(`history SQLite row ${index + 1} has invalid created_at`)
      return normalizeSessionEntry({ ts: new Date(createdAt).toISOString(), cmd: row.prompt }, `history SQLite row ${index + 1}`)
    }))
  } catch (error) {
    if (error instanceof Error && /^(history SQLite row|history SQLite read failed)/.test(error.message)) throw error
    throw new Error(`history SQLite read failed: ${error.message}`, { cause: error })
  } finally {
    db?.close()
  }
}

export function loadSessionJsonl(sessionFile) {
  const lines = fs.readFileSync(sessionFile, "utf8").split(/\r?\n/)
  if (lines.at(-1) === "") lines.pop()
  return sortEntries(lines.map((line, index) => {
    if (!line.trim()) throw new Error(`session JSONL line ${index + 1} is blank`)
    let parsed
    try {
      parsed = JSON.parse(line)
    } catch (error) {
      throw new Error(`session JSONL line ${index + 1} is invalid JSON: ${error.message}`, { cause: error })
    }
    return normalizeSessionEntry(parsed, `session JSONL line ${index + 1}`)
  }))
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

function scanNormalizedHistory(root, history) {
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

export function scanProposals(root, historyFile) {
  return scanNormalizedHistory(root, loadHistory(historyFile))
}

export function scanAutoProposals(root, historyDb, sessionsFile) {
  const historyEntries = loadSqliteHistory(historyDb)
  const sessionEntries = loadSessionJsonl(sessionsFile)
  const result = scanNormalizedHistory(root, [...historyEntries, ...sessionEntries].sort((a, b) => a.ts.getTime() - b.ts.getTime()))
  return {
    ...result,
    sources: {
      historyDb: { path: path.relative(root, historyDb), rowsRead: historyEntries.length },
      sessions: { path: path.relative(root, sessionsFile), rowsRead: sessionEntries.length },
    },
  }
}

export function isFailureRecord(record) {
  if (!record || typeof record !== "object") return false
  if (record.error !== null && record.error !== undefined && record.error !== "") return true
  const outcome = String(record.outcome ?? "").toLowerCase()
  if (outcome === "fail" || outcome === "error" || outcome === "failed") return true
  const data = record.data
  if (data && typeof data === "object") {
    if (data.error !== null && data.error !== undefined && data.error !== "") return true
    if (typeof data.exitCode === "number" && data.exitCode !== 0) return true
    if (typeof data.exit_code === "number" && data.exit_code !== 0) return true
    if (typeof data.code === "number" && data.code !== 0) return true
    const status = String(data.status ?? "").toLowerCase()
    if (status === "error" || status === "fail" || status === "failed") return true
    if (data.failed === true || data.isError === true) return true
  }
  if (typeof record.exitCode === "number" && record.exitCode !== 0) return true
  const status = String(record.status ?? "").toLowerCase()
  if (status === "error" || status === "fail" || status === "failed") return true
  return false
}

const GENERIC_IDENTIFIERS = new Set(["tool", "failure", "error", "unknown", "failed", "fail", "null", "undefined", ""])

export function isGenericIdentifier(str) {
  if (!str) return true
  const clean = String(str).toLowerCase().trim()
  if (GENERIC_IDENTIFIERS.has(clean)) return true
  const tokens = clean.split(/[^a-z0-9]+/).filter(Boolean)
  if (tokens.length === 0) return true
  return tokens.every((t) => GENERIC_IDENTIFIERS.has(t))
}

export function extractFailureInfo(record, root = process.cwd()) {
  const rawTs = record.ts ?? record.timestamp ?? record.time
  const ts = rawTs ? new Date(rawTs) : new Date()
  const validTs = Number.isNaN(ts.getTime()) ? new Date() : ts

  const entityType = String(record.entity?.type ?? record.type ?? "tool").trim().toLowerCase()
  const kind = String(record.kind ?? (entityType === "gate" ? "report" : "call")).trim().toLowerCase()
  const outcome = String(record.outcome ?? (record.error ? "error" : "fail")).trim().toLowerCase()

  let tool = ""
  if (entityType === "tool") {
    tool = record.data?.name ?? record.data?.tool ?? record.entity?.id ?? record.tool ?? ""
  } else {
    tool = record.data?.name ?? record.data?.tool ?? record.tool ?? entityType
  }
  tool = String(tool).trim().toLowerCase()

  let cmd = ""
  if (record.data && typeof record.data === "object") {
    cmd =
      record.data.command ??
      record.data.cmd ??
      record.data.input?.command ??
      record.data.input?.cmd ??
      (typeof record.data.input === "string" ? record.data.input : "")
  }
  if (!cmd) {
    cmd = record.command ?? record.cmd ?? (typeof record.input === "string" ? record.input : "")
  }
  cmd = String(cmd).trim()

  let error = ""
  if (record.error) {
    error = typeof record.error === "object" ? (record.error.message ?? JSON.stringify(record.error)) : String(record.error)
  } else if (record.data && typeof record.data === "object") {
    if (record.data.error) {
      error = typeof record.data.error === "object" ? (record.data.error.message ?? JSON.stringify(record.data.error)) : String(record.data.error)
    } else if (record.data.stderr) {
      error = String(record.data.stderr)
    } else if (record.data.message) {
      error = String(record.data.message)
    } else if (record.data.reason) {
      error = String(record.data.reason)
    }
  }

  // Determine prefix and discriminating key based on record type and data
  let prefix = ""
  let discriminatingKey = ""

  if (entityType === "gate") {
    // 1. Check data for failing metrics
    const metricsCandidate =
      record.data?.failing_metrics ??
      record.data?.failingMetrics ??
      record.data?.failed_metrics ??
      record.data?.failing_metric ??
      record.data?.metrics ??
      record.data?.metric
    if (metricsCandidate) {
      const list = Array.isArray(metricsCandidate) ? metricsCandidate : [metricsCandidate]
      discriminatingKey = list
        .map((m) => String(m).replace(/_/g, "-").trim())
        .filter(Boolean)
        .join("-")
      prefix = list.join(" ")
    } else if (record.data?.file && root) {
      // 2. Try reading gate report file
      try {
        const fullReportPath = path.resolve(root, record.data.file)
        if (fs.existsSync(fullReportPath)) {
          const report = JSON.parse(fs.readFileSync(fullReportPath, "utf8"))
          const failingRows = (report.rows || []).filter((r) => r.status === "fail" || r.status === "error")
          const failingNames = failingRows.map((r) => r.metric).filter(Boolean)
          if (failingNames.length > 0) {
            discriminatingKey = failingNames
              .map((m) => String(m).replace(/_/g, "-").trim())
              .join("-")
            prefix = failingNames.join(" ")
          }
        }
      } catch {
        // file unreadable or not json
      }
    }
    if (!discriminatingKey && error) {
      const firstLine = String(error).trim().split(/\r?\n/)[0]
      const cleaned = firstLine.replace(/^[a-zA-Z0-9_.-]*(?:error|exception):\s*/i, "").replace(/:/g, " ").replace(/\s+/g, " ").trim()
      prefix = cleaned.split(/\s+/).slice(0, 3).join(" ").slice(0, 40).trim()
      discriminatingKey = prefix.replace(/[^a-zA-Z0-9]+/g, "-")
    }
  } else {
    // Tool or command failure
    if (cmd) {
      prefix = baseCommand(cmd)
      discriminatingKey = prefix.replace(/[^a-zA-Z0-9]+/g, "-")
    } else if (error) {
      const firstLine = String(error).trim().split(/\r?\n/)[0]
      const cleaned = firstLine.replace(/^[a-zA-Z0-9_.-]*(?:error|exception):\s*/i, "").replace(/:/g, " ").replace(/\s+/g, " ").trim()
      prefix = cleaned.split(/\s+/).slice(0, 3).join(" ").slice(0, 40).trim()
      discriminatingKey = prefix.replace(/[^a-zA-Z0-9]+/g, "-")
    }
  }
  // Clean trailing punctuation
  discriminatingKey = discriminatingKey.replace(/[:;,._-]+$/, "").replace(/^-+/, "").trim().toLowerCase()
  const hasDiscriminatingKey = Boolean(discriminatingKey) && !isGenericIdentifier(discriminatingKey)
  const hasValidTool = Boolean(tool) && !isGenericIdentifier(tool)

  let signature = null
  let slug = null

  if (hasDiscriminatingKey) {
    if (entityType === "gate") {
      signature = `${entityType}:${kind}:${outcome}:${discriminatingKey}`
      slug = slugFor(["gate", outcome, discriminatingKey])
    } else if (hasValidTool) {
      signature = `${tool}:${kind}:${outcome}:${discriminatingKey}`
      slug = slugFor([tool, outcome, discriminatingKey])
    } else {
      signature = `${entityType}:${kind}:${outcome}:${discriminatingKey}`
      slug = slugFor([entityType, outcome, discriminatingKey])
    }
  }

  if (slug && isGenericIdentifier(slug)) {
    slug = null
    signature = null
  }

  return {
    ts: validTs,
    entityType,
    kind,
    outcome,
    tool: hasValidTool ? tool : entityType,
    cmd,
    error: error.trim(),
    prefix: prefix || discriminatingKey,
    discriminatingKey: slug ? discriminatingKey : null,
    signature,
    slug,
    isClassified: Boolean(slug),
    rawRecord: record,
  }
}

export function normalizeFailureGroup(tool, cmd, error) {
  const normTool = String(tool || "tool").trim().toLowerCase()
  let prefix = ""
  if (cmd) {
    prefix = baseCommand(cmd)
  } else if (error) {
    const firstLine = String(error).trim().split(/\r?\n/)[0]
    const cleaned = firstLine.replace(/^[a-zA-Z0-9_.-]*(?:error|exception):\s*/i, "").replace(/:/g, " ").replace(/\s+/g, " ").trim()
    prefix = cleaned.split(/\s+/).slice(0, 3).join(" ").slice(0, 40).trim()
  }
  if (!prefix) prefix = "failure"
  return {
    tool: normTool,
    prefix,
    key: `${normTool}:${prefix}`.toLowerCase(),
  }
}

export function failureSlugFor(tool, prefix) {
  const normTool = String(tool || "").trim().toLowerCase()
  const normPrefix = String(prefix || "").trim().toLowerCase()
  if (!normTool && !normPrefix) return "tool-failure"
  const raw = slugFor([normTool, normPrefix].filter(Boolean))
  return (raw || "tool-failure").slice(0, 60).replace(/-+$/, "")
}
export function failureProposalTemplate({ name, description, tool, prefix, count, first, last, examples = [] }) {
  return [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "status: proposal",
    "generated: true",
    `basedOn: ${JSON.stringify({ failurePattern: { tool, prefix }, count, firstSeen: first, lastSeen: last })}`,
    "---",
    "",
    `# ${name}`,
    "",
    `Automatically proposed by \`harness-process-skill.mjs --scan-failures\` (guardrails v2, R5, AC-8).`,
    `Status: proposal (INERT — not installed, activated, or dispatched until operator approval).`,
    `To activate this skill into production: \`node scripts/harness-process-skill.mjs --activate ${name}\`.`,
    "",
    `## Evidence`,
    "",
    `- Tool/Target: \`${tool}\``,
    `- Pattern: \`${prefix}\``,
    `- Failure count: ${count}`,
    `- First observed: ${first}`,
    `- Last observed: ${last}`,
    "",
    `## When to use`,
    "",
    `Use this skill when handling or remediating recurring failures in \`${tool}\` matching \`${prefix}\`.`,
    `Do NOT use for unrelated tools or one-off unexpected errors.`,
    "",
    `## Observed Failure Examples`,
    "",
    "```",
    ...examples.map((ex, idx) => {
      const tsStr = ex.ts instanceof Date ? ex.ts.toISOString() : String(ex.ts)
      const detail = ex.cmd || ex.error || "failure"
      return `${idx + 1}. [${tsStr}] ${detail}`
    }),
    "```",
    "",
  ].join("\n")
}

export function findFailureGroups(failureEvents, windowDays = WINDOW_DAYS, minRepeats = MIN_REPEATS) {
  const groups = new Map()
  const unclassified = []

  for (const rawEvent of failureEvents) {
    const event = rawEvent && rawEvent.signature !== undefined ? rawEvent : extractFailureInfo(rawEvent)
    if (!event.isClassified || !event.signature || !event.slug) {
      unclassified.push({
        ts: (event.ts instanceof Date ? event.ts : new Date()).toISOString(),
        entityType: event.entityType,
        kind: event.kind,
        outcome: event.outcome,
        reason: "missing discriminating error or data key",
      })
      continue
    }

    const key = event.signature
    if (!groups.has(key)) {
      groups.set(key, {
        signature: event.signature,
        slug: event.slug,
        entityType: event.entityType,
        kind: event.kind,
        outcome: event.outcome,
        tool: event.tool,
        discriminatingKey: event.discriminatingKey,
        entries: [],
      })
    }
    groups.get(key).entries.push(event)
  }

  const qualified = []
  for (const [key, group] of groups) {
    group.entries.sort((a, b) => a.ts.getTime() - b.ts.getTime())
    if (group.entries.length < minRepeats) continue

    const entries = group.entries
    let bestWindow = null
    const totalSpan = (entries[entries.length - 1].ts.getTime() - entries[0].ts.getTime()) / 86_400_000
    if (totalSpan <= windowDays) {
      bestWindow = entries
    } else {
      for (let i = 0; i < entries.length; i++) {
        for (let j = entries.length - 1; j >= i + minRepeats - 1; j--) {
          const span = (entries[j].ts.getTime() - entries[i].ts.getTime()) / 86_400_000
          if (span <= windowDays) {
            const sub = entries.slice(i, j + 1)
            if (!bestWindow || sub.length > bestWindow.length) {
              bestWindow = sub
            }
            break
          }
        }
      }
    }

    if (!bestWindow || bestWindow.length < minRepeats) continue

    const first = bestWindow[0].ts
    const last = bestWindow[bestWindow.length - 1].ts
    qualified.push({
      signature: group.signature,
      slug: group.slug,
      entityType: group.entityType,
      kind: group.kind,
      outcome: group.outcome,
      tool: group.tool,
      prefix: group.entries[0]?.prefix || group.discriminatingKey,
      discriminatingKey: group.discriminatingKey,
      count: bestWindow.length,
      first: first.toISOString(),
      last: last.toISOString(),
      examples: bestWindow.slice(0, 5),
    })
  }
  const result = qualified.sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug))
  result.qualified = result
  result.unclassified = unclassified
  return result
}

export function loadFailureRecords(tracesPath, root = process.cwd()) {
  if (!fs.existsSync(tracesPath)) return []
  const stat = fs.statSync(tracesPath)
  const files = []
  if (stat.isDirectory()) {
    const names = fs.readdirSync(tracesPath).filter((f) => f.endsWith(".jsonl"))
    for (const name of names) {
      files.push(path.join(tracesPath, name))
    }
  } else if (stat.isFile()) {
    files.push(tracesPath)
  }

  const failures = []
  for (const file of files) {
    let content = ""
    try {
      content = fs.readFileSync(file, "utf8")
    } catch {
      continue
    }
    const lines = content.split(/\r?\n/)
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const record = JSON.parse(line)
        if (isFailureRecord(record)) {
          failures.push(extractFailureInfo(record, root))
        }
      } catch {
        // Skip unparseable lines
      }
    }
  }

  return failures.sort((a, b) => a.ts.getTime() - b.ts.getTime())
}

export function scanFailures(root, tracesPath = null, options = {}) {
  const resolvedPath = tracesPath
    ? path.resolve(root, tracesPath)
    : path.join(root, "docs", "harness", "traces")
  const windowDays = options.windowDays ?? WINDOW_DAYS
  const minRepeats = options.minRepeats ?? MIN_REPEATS
  const dryRun = Boolean(options.dryRun)

  const failures = loadFailureRecords(resolvedPath, root)
  const { qualified: groups, unclassified } = findFailureGroups(failures, windowDays, minRepeats)

  if (groups.length === 0) {
    return {
      proposals: [],
      groups: [],
      unclassified,
      dryRun,
      reason: `no tool/command failed >=${minRepeats} times within ${windowDays} days`,
    }
  }

  const proposals = []
  const createdOrUpdated = []

  for (const group of groups) {
    const slug = group.slug
    const name = slug
    const targetLabel = group.discriminatingKey || group.tool
    const description = `Remediate recurring ${group.entityType} ${group.tool} failures on ${targetLabel}. Use when ${group.tool} fails repeatedly with ${targetLabel}. Do NOT use for one-off errors.`
    const content = failureProposalTemplate({
      name,
      description,
      tool: group.tool,
      prefix: group.discriminatingKey,
      count: group.count,
      first: group.first,
      last: group.last,
      examples: group.examples,
    })

    const target = path.join(root, PROPOSALS_DIR, slug, "SKILL.md")
    if (!dryRun) {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, content, "utf8")
    }

    proposals.push(slug)
    createdOrUpdated.push({
      slug,
      signature: group.signature,
      entityType: group.entityType,
      tool: group.tool,
      key: group.discriminatingKey,
      count: group.count,
      first: group.first,
      last: group.last,
      target: path.relative(root, target).replace(/\\/g, "/"),
      dryRun,
    })
  }

  return {
    proposals,
    groups: createdOrUpdated,
    unclassified,
    dryRun,
  }
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
    if (index === -1) return null
    const next = args[index + 1]
    return next && !next.startsWith("-") ? next : null
  }
  const root = path.resolve(valueOf("--root") ?? process.cwd())

  if (args.includes("--scan-failures")) {
    const tracesArg = valueOf("--traces") ?? valueOf("--scan-failures")
    const dryRun = args.includes("--dry-run")
    try {
      const result = scanFailures(root, tracesArg, { dryRun })
      console.log(JSON.stringify(result, null, 2))
    } catch (error) {
      console.error(`harness-process-skill: ${error.message}`)
      process.exitCode = 1
    }
    return
  }

  if (args.includes("--auto")) {
    const historyDb = valueOf("--history-db")
    const sessionsFile = valueOf("--sessions")
    if (!historyDb || !sessionsFile) {
      console.error("harness-process-skill: --auto requires --history-db and --sessions")
      process.exitCode = 1
      return
    }
    try {
      const result = scanAutoProposals(root, path.resolve(root, historyDb), path.resolve(root, sessionsFile))
      console.log(JSON.stringify({ mode: "auto", ...result }, null, 2))
    } catch (error) {
      console.error(`harness-process-skill: ${error.message}`)
      process.exitCode = 1
    }
    return
  }

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

  console.error("harness-process-skill: use --scan-failures [traces-path], --auto --history-db <file> --sessions <file>, --scan <history-file>, --activate <slug>, or --list")
  process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli()
