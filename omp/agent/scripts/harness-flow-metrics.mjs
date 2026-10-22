import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

export function parseSince(sinceStr) {
  if (arguments.length === 0) {
    sinceStr = "28d"
  }
  if (typeof sinceStr !== "string") {
    throw new Error(`Invalid --since value: ${sinceStr}`)
  }
  const trimmed = sinceStr.trim()
  const match = trimmed.match(/^(\d+)([dw])$/i)
  if (!match) {
    throw new Error(`Invalid --since format: "${sinceStr}". Expected Nd or Nw (e.g. 28d, 4w).`)
  }
  const count = parseInt(match[1], 10)
  if (isNaN(count) || count <= 0) {
    throw new Error(`Invalid --since count: "${sinceStr}"`)
  }
  const unit = match[2].toLowerCase()
  const days = unit === "w" ? count * 7 : count
  return { count, unit, days, sinceArg: trimmed }
}

export function getIsoWeek(dateInput) {
  const d = new Date(dateInput)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  const padWeek = String(weekNo).padStart(2, "0")
  return `${d.getUTCFullYear()}-W${padWeek}`
}

export function isRevertCommit(subject = "", body = "") {
  const s = String(subject || "").trim()
  const b = String(body || "")
  return s.startsWith('Revert "') || s.includes("This reverts commit") || b.includes("This reverts commit")
}

export function isFixSubject(subject = "") {
  return /^(?:fix|hotfix|bugfix)(?:\([^)]*\))?!?(?::|\s|$)/i.test(String(subject || "").trim())
}

export function classifyCommit(commit, priorCommits = []) {
  const subject = String(commit.subject || "").trim()
  const body = String(commit.body || "")
  const files = Array.isArray(commit.files) ? commit.files : []
  const parents = Array.isArray(commit.parents) ? commit.parents : []
  const isMerge = parents.length > 1
  const isRevert = isRevertCommit(subject, body)
  const isFix = !isRevert && isFixSubject(subject)

  let isFixFollowup = false

  if (isFix && files.length > 0 && Array.isArray(priorCommits) && priorCommits.length > 0) {
    const commitTime = new Date(commit.date).getTime()
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
    const commitFileSet = new Set(files)
    const commitIndex = priorCommits.findIndex((c) => (c.hash && commit.hash ? c.hash === commit.hash : c === commit))

    for (let i = 0; i < priorCommits.length; i++) {
      const prior = priorCommits[i]
      if (prior === commit || (commit.hash && prior.hash && prior.hash === commit.hash)) {
        continue
      }

      const priorTime = new Date(prior.date).getTime()
      const diff = commitTime - priorTime
      const isEarlier = commitIndex >= 0 ? (i > commitIndex || diff > 0) : diff >= 0
      if (!isEarlier) continue

      if (diff > sevenDaysMs) continue

      const priorSubject = String(prior.subject || "").trim()
      const priorBody = String(prior.body || "")
      const priorParents = Array.isArray(prior.parents) ? prior.parents : []
      const priorIsMerge = priorParents.length > 1
      const priorIsRevert = isRevertCommit(priorSubject, priorBody)
      const priorIsFix = isFixSubject(priorSubject)

      if (priorIsFix || priorIsRevert || priorIsMerge) continue

      const priorFiles = Array.isArray(prior.files) ? prior.files : []
      const hasOverlap = priorFiles.some((f) => commitFileSet.has(f))
      if (hasOverlap) {
        isFixFollowup = true
        break
      }
    }
  }

  return {
    hash: commit.hash || "",
    date: commit.date || "",
    subject,
    files,
    isMerge,
    isRevert,
    isFix,
    isFixFollowup
  }
}

export function bucketByWeek(commits = []) {
  const weeksMap = new Map()

  for (const c of commits) {
    const week = c.week || getIsoWeek(c.date)
    if (!weeksMap.has(week)) {
      weeksMap.set(week, {
        week,
        commits: 0,
        reverts: 0,
        fixFollowups: 0,
        revertRatio: 0,
        followupRatio: 0
      })
    }
    const w = weeksMap.get(week)
    if (!c.isMerge) {
      w.commits += 1
    }
    if (c.isRevert) {
      w.reverts += 1
    }
    if (c.isFixFollowup && !c.isMerge) {
      w.fixFollowups += 1
    }
  }

  for (const w of weeksMap.values()) {
    w.revertRatio = w.commits > 0 ? Number((w.reverts / w.commits).toFixed(4)) : 0
    w.followupRatio = w.commits > 0 ? Number((w.fixFollowups / w.commits).toFixed(4)) : 0
  }

  const sortedWeeks = Array.from(weeksMap.values()).sort((a, b) => a.week.localeCompare(b.week))
  const totals = {
    commits: sortedWeeks.reduce((acc, w) => acc + w.commits, 0),
    reverts: sortedWeeks.reduce((acc, w) => acc + w.reverts, 0),
    fixFollowups: sortedWeeks.reduce((acc, w) => acc + w.fixFollowups, 0),
    revertRatio: 0,
    followupRatio: 0
  }
  totals.revertRatio = totals.commits > 0 ? Number((totals.reverts / totals.commits).toFixed(4)) : 0
  totals.followupRatio = totals.commits > 0 ? Number((totals.fixFollowups / totals.commits).toFixed(4)) : 0

  return Object.assign(sortedWeeks, { weeks: sortedWeeks, totals })
}

export function getFlowMetrics({ root = process.cwd(), since = "28d" } = {}) {
  const resolvedRoot = path.resolve(root)
  const gitDir = path.join(resolvedRoot, ".git")

  let hasGit = false
  try {
    hasGit = fs.existsSync(gitDir)
  } catch {
    hasGit = false
  }

  if (!hasGit) {
    return {
      status: "not_applicable",
      reason: "no git repository",
      root: resolvedRoot
    }
  }

  const sinceParsed = parseSince(since)
  let output = ""

  try {
    output = execFileSync(
      "git",
      [
        "log",
        `--since=${sinceParsed.days + 7} days ago`,
        "--format=%x1e%H%x00%P%x00%cI%x00%s%x00%b%x1f",
        "--name-only"
      ],
      {
        cwd: resolvedRoot,
        shell: false,
        maxBuffer: 32 * 1024 * 1024,
        timeout: 30000,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"]
      }
    )
  } catch (err) {
    const rawReason = (err.stderr ? err.stderr.toString() : "") || err.message || "git log failed"
    const cleanReason = rawReason.split("\n")[0].trim().replace(/^fatal:\s*/i, "").slice(0, 200)
    return {
      status: "error",
      reason: cleanReason || "git log execution failed",
      root: resolvedRoot
    }
  }

  const chunks = output.split("\x1e").map((c) => c.trim()).filter(Boolean)
  const allCommits = []

  for (const chunk of chunks) {
    const [meta, filesRaw = ""] = chunk.split("\x1f")
    const parts = meta.split("\x00")
    const hash = parts[0] || ""
    const parentsStr = parts[1] || ""
    const date = parts[2] || ""
    const subject = parts[3] || ""
    const body = parts.slice(4).join("\x00")
    const parents = parentsStr.trim().split(/\s+/).filter(Boolean)
    const files = filesRaw.split("\n").map((f) => f.trim()).filter(Boolean)
    allCommits.push({ hash, parents, date, subject, body, files })
  }

  const classified = allCommits.map((c) => classifyCommit(c, allCommits))
  const now = Date.now()
  const windowStart = now - sinceParsed.days * 24 * 60 * 60 * 1000

  const windowCommits = classified.filter((c) => {
    const t = new Date(c.date).getTime()
    return isNaN(t) || t >= windowStart
  })

  const { weeks, totals } = bucketByWeek(windowCommits)

  return {
    status: "ok",
    root: resolvedRoot,
    since: sinceParsed.sinceArg,
    definition: "fixFollowups = commit fix/hotfix/bugfix que altera arquivo mexido por outro commit nos 7 dias anteriores (proxy de correção posterior; não prova merge).",
    weeks,
    totals
  }
}

export function renderMetricsTable({ weeks = [], totals = {} } = {}) {
  const lines = []
  lines.push("Semana       Commits  Reverts  Fix Follow-ups  Revert %  Follow-up %")
  lines.push("--------------------------------------------------------------------")

  if (weeks.length === 0) {
    lines.push("(nenhum commit no período)")
  } else {
    for (const w of weeks) {
      const revPct = `${(w.revertRatio * 100).toFixed(1)}%`
      const folPct = `${(w.followupRatio * 100).toFixed(1)}%`
      lines.push(
        `${w.week.padEnd(12)} ${String(w.commits).padStart(8)} ${String(w.reverts).padStart(8)} ${String(w.fixFollowups).padStart(15)} ${revPct.padStart(9)} ${folPct.padStart(12)}`
      )
    }
  }

  lines.push("--------------------------------------------------------------------")
  const totRevPct = `${((totals.revertRatio || 0) * 100).toFixed(1)}%`
  const totFolPct = `${((totals.followupRatio || 0) * 100).toFixed(1)}%`
  lines.push(
    `${"Total".padEnd(12)} ${String(totals.commits || 0).padStart(8)} ${String(totals.reverts || 0).padStart(8)} ${String(totals.fixFollowups || 0).padStart(15)} ${totRevPct.padStart(9)} ${totFolPct.padStart(12)}`
  )
  lines.push("")
  lines.push("Definição: fixFollowups = commit fix/hotfix/bugfix que altera arquivo mexido por outro commit nos 7 dias anteriores (proxy de correção posterior; não prova merge).")

  return lines.join("\n")
}

export function runCli(argv = process.argv.slice(2)) {
  let root = process.cwd()
  let since = "28d"
  let isJson = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--root") {
      if (i + 1 < argv.length) {
        root = argv[++i]
      }
    } else if (arg === "--since") {
      if (i + 1 < argv.length) {
        since = argv[++i]
      }
    } else if (arg === "--json") {
      isJson = true
    }
  }

  const resolvedRoot = path.resolve(root)

  // Validate --since with strict regex before doing anything
  try {
    parseSince(since)
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`)
    process.exit(1)
  }

  const result = getFlowMetrics({ root: resolvedRoot, since })

  if (result.status === "not_applicable") {
    if (isJson) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log("not_applicable: no git repository")
    }
    process.exit(0)
  }

  if (result.status === "error") {
    if (isJson) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      process.stderr.write(`error: ${result.reason}\n`)
    }
    process.exit(2)
  }

  if (isJson) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(renderMetricsTable(result))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli()
}
