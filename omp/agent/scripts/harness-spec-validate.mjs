import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { fileURLToPath } from "node:url"

export function normalizePathForCollision(p) {
  let s = String(p || "").trim().replace(/^`+|`+$/g, "").replace(/\\/g, "/")
  s = s.replace(/^\.\//, "")
  s = s.replace(/\/\*\*?$/, "")
  return s
}

export function pathsCollide(p1, p2) {
  const norm1 = normalizePathForCollision(p1)
  const norm2 = normalizePathForCollision(p2)
  if (!norm1 || !norm2) return false
  if (norm1 === norm2) return true
  if (norm1.startsWith(norm2 + "/")) return true
  if (norm2.startsWith(norm1 + "/")) return true
  return false
}
export function normalizeLaneId(id) {
  if (!id) return id
  const m = String(id).match(/^T?(\d+)([a-z]*)$/i)
  if (m) {
    return `T${m[1].padStart(2, "0")}${m[2].toLowerCase()}`
  }
  return id
}

export function parseBlockedBy(rawStr, knownLanes = new Set(), knownStems = new Set()) {
  if (!rawStr) return { deps: [], unknown: [] }
  let str = rawStr.trim()
  if (/^none\b/i.test(str)) return { deps: [], unknown: [] }

  // Strip trailing notes in parentheses that are not ticket references like (T01) or (T11a)
  str = str.replace(/\s*\((?!T\d+[a-z]*\s*\)).*$/i, "").trim()

  // Also remove em-dash notes e.g. "— can start immediately"
  str = str.replace(/\s*[—–-]\s*can start.*$/i, "").trim()
  if (!str || /^none\b/i.test(str)) return { deps: [], unknown: [] }

  const parts = str.split(",").map((p) => p.trim()).filter(Boolean)
  const deps = []
  const unknown = []

  for (const part of parts) {
    // If the part is entirely parenthetical and not a ticket lane ref (e.g. (Wave 6)), ignore it
    if (/^\([^)]*\)$/.test(part) && !/^\(T\d+[a-z]*\)$/i.test(part)) {
      continue
    }

    // Date-like token check: ignore date-like tokens e.g. 2026-09-30 or 26-09-30
    if (/^\d{2,4}[-/]\d{2}[-/]\d{2,4}$/.test(part) || /\b\d{4}-\d{2}-\d{2}\b/.test(part)) {
      continue
    }

    // Try matching (T\d+[a-z]*) or standalone T\d+[a-z]*
    const laneMatch = part.match(/\(?(T\d+[a-z]*)\)?/i)
    if (laneMatch) {
      const laneId = normalizeLaneId(laneMatch[1])
      deps.push(laneId)
      const hasLane = knownLanes.size === 0 || Array.from(knownLanes).some((l) => normalizeLaneId(l) === laneId)
      if (!hasLane) {
        unknown.push(laneId)
      }
      continue
    }

    // Try matching ticket stem e.g. 01-bootstrap-quality-thresholds or 11a-skill-description
    // Stem must start with digits+optional letters, then hyphen, then letters (not numbers like a date 2026-09-30)
    const stemMatch = part.match(/\b([0-9]{1,3}[a-z]*-[a-z][a-z0-9-]*)\b/i)
    if (stemMatch) {
      const stem = stemMatch[1].toLowerCase()
      deps.push(stem)
      if (knownStems.size > 0 && !knownStems.has(stem)) {
        unknown.push(stem)
      }
      continue
    }

    // If the part is an annotation residue containing wave, operator, or date, skip it
    if (/\b(?:wave|\d{4}-\d{2}-\d{2}|operator)\b/i.test(part)) {
      continue
    }

    // Otherwise record as unknown/raw dependency
    deps.push(part)
    unknown.push(part)
  }

  return { deps, unknown }
}

export function parsePlanLanes(planContent) {
  const lines = planContent.split(/\r?\n/)
  const lanes = []
  let inTable = false
  let headerCols = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.startsWith("|")) {
      if (inTable && line.length === 0) inTable = false
      continue
    }

    const cols = line.split("|").slice(1, -1).map((c) => c.trim())
    if (!cols.length) continue

    if (!headerCols) {
      const lower = cols.map((c) => c.toLowerCase())
      const laneIdx = lower.findIndex((c) => c.includes("lane id") || c === "lane")
      const ticketIdx = lower.findIndex((c) => c.includes("ticket") || c.includes("name"))
      const ownerIdx = lower.findIndex((c) => c.includes("ownership") || c.includes("file"))
      const blockedIdx = lower.findIndex((c) => c.includes("blocked by"))
      if (laneIdx >= 0 && ticketIdx >= 0 && ownerIdx >= 0) {
        headerCols = { laneIdx, ticketIdx, ownerIdx, blockedIdx }
        inTable = true
        continue
      }
    }

    if (inTable && cols.every((c) => /^:?-+:?$/.test(c))) {
      continue // separator row
    }

    if (inTable && headerCols) {
      const rawLane = cols[headerCols.laneIdx] || ""
      const laneMatch = rawLane.match(/T\d+[a-z]*/i)
      if (!laneMatch) continue
      const laneId = normalizeLaneId(laneMatch[0])

      const rawTicket = (cols[headerCols.ticketIdx] || "").replace(/`/g, "").trim()
      const rawOwner = cols[headerCols.ownerIdx] || ""
      const ownership = rawOwner
        .split(/<br\s*\/?>|\n/)
        .map((p) => p.replace(/`/g, "").trim())
        .filter(Boolean)

      const rawBlocked = headerCols.blockedIdx >= 0 ? cols[headerCols.blockedIdx] || "" : ""
      const { deps } = parseBlockedBy(rawBlocked)

      lanes.push({
        id: laneId,
        ticket: rawTicket,
        ownership,
        blockedBy: deps,
        line: i + 1,
      })
    }
  }

  return lanes
}

export function parseTickets(ticketsDir) {
  const tickets = []
  if (!fs.existsSync(ticketsDir)) return tickets

  const entries = fs.readdirSync(ticketsDir).filter((f) => f.endsWith(".md"))
  for (const filename of entries) {
    const fullPath = path.join(ticketsDir, filename)
    const content = fs.readFileSync(fullPath, "utf8")
    const lines = content.split(/\r?\n/)
    const stem = filename.replace(/\.md$/, "")

    let laneId = null
    const idMatch = stem.match(/^(\d+)([a-z]*)/i)
    if (idMatch) {
      const num = idMatch[1].padStart(2, "0")
      const suffix = idMatch[2].toLowerCase()
      laneId = `T${num}${suffix}`
    }

    let blockedByRaw = ""
    let blockedByLine = 1
    const ownership = []
    let inOwnership = false

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      const blockedMatch = trimmed.match(/^\*\*Blocked by:\*\*\s*(.*)$/i)
      if (blockedMatch) {
        blockedByRaw = blockedMatch[1]
        blockedByLine = i + 1
      }

      if (/^\*\*Ownership:\*\*/i.test(trimmed)) {
        inOwnership = true
        continue
      }

      if (inOwnership) {
        if (/^---|^###|^##|^\*\*[A-Za-z]/.test(trimmed)) {
          inOwnership = false
        } else if (/^[-*]\s+/.test(trimmed)) {
          const item = trimmed.replace(/^[-*]\s+/, "").replace(/`/g, "").trim()
          if (item) ownership.push(item)
        }
      }
    }

    tickets.push({
      file: path.join("tickets", filename),
      filename,
      stem,
      laneId,
      blockedByRaw,
      blockedByLine,
      ownership,
    })
  }

  return tickets
}
export function laneMatchesTicket(lane, ticket) {
  if (lane.id === ticket.laneId || lane.ticket === ticket.stem) return true
  if (lane.id && ticket.laneId && lane.id.toLowerCase() === ticket.laneId.toLowerCase()) return true

  // Range match in lane.id, e.g. T11a–d, T11a-d, T11a..11d covering T11a, T11b, etc.
  const rangeMatch = lane.id.match(/^T?(\d+)([a-z])[–\-](?:T?\d+)?([a-z])$/i)
  if (rangeMatch && ticket.laneId) {
    const num = rangeMatch[1].padStart(2, "0")
    const startChar = rangeMatch[2].toLowerCase().charCodeAt(0)
    const endChar = rangeMatch[3].toLowerCase().charCodeAt(0)
    const ticketMatch = ticket.laneId.match(/^T?(\d+)([a-z])$/i)
    if (ticketMatch) {
      const tNum = ticketMatch[1].padStart(2, "0")
      const tChar = ticketMatch[2].toLowerCase().charCodeAt(0)
      if (tNum === num && tChar >= startChar && tChar <= endChar) {
        return true
      }
    }
  }

  // Range match in lane.ticket, e.g. 11a..11d-...
  if (lane.ticket.includes("..")) {
    const prefixMatch = lane.ticket.match(/^(\d+)([a-z])\.\.(\d+)?([a-z])/i)
    if (prefixMatch && ticket.stem) {
      const num = prefixMatch[1]
      const startChar = prefixMatch[2].toLowerCase().charCodeAt(0)
      const endChar = prefixMatch[4].toLowerCase().charCodeAt(0)
      const tMatch = ticket.stem.match(/^(\d+)([a-z])/i)
      if (tMatch) {
        const tNum = tMatch[1]
        const tChar = tMatch[2].toLowerCase().charCodeAt(0)
        if (tNum === num && tChar >= startChar && tChar <= endChar) {
          return true
        }
      }
    }
  }

  // Base number match if lane.id is e.g. T11 and ticket is T11a
  if (lane.id.match(/^T\d+$/i) && ticket.laneId?.match(/^T\d+[a-z]+$/i)) {
    if (ticket.laneId.toLowerCase().startsWith(lane.id.toLowerCase())) {
      return true
    }
  }

  return false
}

export function detectCycles(nodes, getDeps) {
  // nodes: Array of IDs
  // getDeps: (id) => Array of IDs that this id is blocked by
  const state = new Map() // 0 = unvisited, 1 = visiting, 2 = visited
  const parent = new Map()
  let cycle = null

  function dfs(curr) {
    state.set(curr, 1)
    const deps = getDeps(curr) || []
    for (const dep of deps) {
      if (!nodes.includes(dep)) continue
      const depState = state.get(dep) || 0
      if (depState === 1) {
        // Cycle detected
        const pathArr = [dep, curr]
        let p = curr
        while (p && parent.get(p) && parent.get(p) !== dep) {
          p = parent.get(p)
          pathArr.push(p)
        }
        pathArr.push(dep)
        cycle = pathArr.reverse()
        return true
      }
      if (depState === 0) {
        parent.set(dep, curr)
        if (dfs(dep)) return true
      }
    }
    state.set(curr, 2)
    return false
  }

  for (const node of nodes) {
    if ((state.get(node) || 0) === 0) {
      if (dfs(node)) break
    }
  }

  return cycle
}

export function computeTopologicalLevels(nodes, getDeps) {
  // Topological levels: level 1 = no deps; level N = 1 + max(deps levels)
  const inDegree = new Map()
  const dependents = new Map() // dep -> [nodes blocked by dep]
  const levels = new Map()

  for (const n of nodes) {
    inDegree.set(n, 0)
    dependents.set(n, [])
    levels.set(n, 1)
  }

  for (const n of nodes) {
    const deps = (getDeps(n) || []).filter((d) => nodes.includes(d))
    inDegree.set(n, deps.length)
    for (const d of deps) {
      dependents.get(d).push(n)
    }
  }

  const queue = []
  for (const n of nodes) {
    if (inDegree.get(n) === 0) {
      queue.push(n)
    }
  }

  let count = 0
  while (queue.length > 0) {
    const curr = queue.shift()
    count++
    const currLevel = levels.get(curr)
    for (const next of dependents.get(curr)) {
      levels.set(next, Math.max(levels.get(next), currLevel + 1))
      inDegree.set(next, inDegree.get(next) - 1)
      if (inDegree.get(next) === 0) {
        queue.push(next)
      }
    }
  }

  if (count < nodes.length) {
    return null // Cycle
  }

  return levels
}

export function validateSpec(specDir, options = {}) {
  const errors = []
  const warnings = []
  const checks = {
    spec_structure: "pass",
    ac_identifiers: "pass",
    plan_disjoint_ownership: "pass",
    plan_acyclic_dag: "pass",
    verification_coverage: "pass",
    decisions_mandatory_lines: "pass",
    tickets_parity: "pass",
    blast_radius_rollback: "pass",
  }

  const resolvedDir = path.resolve(specDir)
  const specMdPath = path.join(resolvedDir, "spec.md")
  const planMdPath = path.join(resolvedDir, "plan.md")
  const verificationMdPath = path.join(resolvedDir, "verification.md")
  const decisionsMdPath = path.join(resolvedDir, "decisions.md")
  const ticketsDirPath = path.join(resolvedDir, "tickets")

  // --- 1. spec.md validation ---
  const declaredAcs = new Set()
  if (!fs.existsSync(specMdPath)) {
    errors.push({
      file: "spec.md",
      line: 1,
      code: "file_missing",
      message: "spec.md not found in spec directory",
    })
    checks.spec_structure = "fail"
  } else {
    const specRaw = fs.readFileSync(specMdPath, "utf8")
    const specLines = specRaw.split(/\r?\n/)

    let hasObjective = false
    let hasRequirements = false
    let hasAcceptanceCriteria = false
    let inAcceptanceCriteria = false
    let hasNonGoals = false

    let inCodeFence = false

    for (let i = 0; i < specLines.length; i++) {
      const line = specLines[i]
      const trimmed = line.trim()

      if (trimmed.startsWith("```")) {
        inCodeFence = !inCodeFence
        continue
      }

      if (!inCodeFence) {
        // Section checks
        if (/^#+\s*(?:\d+\.?\s*)?objective/i.test(trimmed)) hasObjective = true
        if (/^#+\s*(?:\d+\.?\s*)?requirements/i.test(trimmed)) hasRequirements = true
        if (
          /^#+\s*(?:\d+\.?\s*)?(?:acceptance\s+criteria|crit[eé]rios\s+de\s+aceita[çc][ãa]o)/i.test(trimmed) ||
          /^\s*[-*]?\s*\*{2}(?:acceptance\s+criteria|crit[eé]rios\s+de\s+aceita[çc][ãa]o):?\*{2}/i.test(trimmed)
        ) {
          hasAcceptanceCriteria = true
          inAcceptanceCriteria = true
        } else if (/^#+\s+|^---/.test(trimmed)) {
          inAcceptanceCriteria = false
        }
        if (/^#+\s*(?:\d+\.?\s*)?non[- ]goals/i.test(trimmed)) hasNonGoals = true

        // Placeholder checks: strip inline code first
        const prose = line.replace(/`[^`]*`/g, "")
        const placeholderMatch = prose.match(/\[(?:TBD|\.\.\.|TODO)\]/i)
        if (placeholderMatch) {
          errors.push({
            file: "spec.md",
            line: i + 1,
            code: "unfinished_placeholder",
            message: `Unfinished placeholder "${placeholderMatch[0]}" found in spec.md`,
          })
          checks.spec_structure = "fail"
        }

        // AC ID format checks
        // Look for bullet items declaring an AC e.g. - `AC-XXX-1`: or - AC-XXX-1:
        const acDeclMatch = trimmed.match(/^[-*]\s*(?:\[[ xX]\]\s*)?`?([A-Za-z0-9_.-]+)`?:\s*(.+)$/)
        if (acDeclMatch) {
          const candidateId = acDeclMatch[1]
          // If candidate looks like an AC or is inside an Acceptance Criteria section
          if (inAcceptanceCriteria || /^AC[-_]/i.test(candidateId) || candidateId.startsWith("AC")) {
            if (/^AC-[A-Z0-9]+-\d+$/.test(candidateId)) {
              declaredAcs.add(candidateId)
            } else {
              errors.push({
                file: "spec.md",
                line: i + 1,
                code: "invalid_ac_format",
                message: `Invalid Acceptance Criterion ID format: "${candidateId}" (must match ^AC-[A-Z0-9]+-\\d+$)`,
              })
              checks.ac_identifiers = "fail"
            }
          }
        }
      }
    }

    if (!hasObjective) {
      errors.push({
        file: "spec.md",
        line: 1,
        code: "missing_section",
        message: "spec.md is missing required section: Objective",
      })
      checks.spec_structure = "fail"
    }
    if (!hasRequirements) {
      errors.push({
        file: "spec.md",
        line: 1,
        code: "missing_section",
        message: "spec.md is missing required section: Requirements",
      })
      checks.spec_structure = "fail"
    }
    if (!hasAcceptanceCriteria) {
      errors.push({
        file: "spec.md",
        line: 1,
        code: "missing_section",
        message: "spec.md is missing required section: Acceptance Criteria",
      })
      checks.spec_structure = "fail"
    }
    if (!hasNonGoals) {
      errors.push({
        file: "spec.md",
        line: 1,
        code: "missing_section",
        message: "spec.md is missing required section: Non-goals",
      })
      checks.spec_structure = "fail"
    }
  }

  // --- 2. decisions.md validation ---
  if (!fs.existsSync(decisionsMdPath)) {
    errors.push({
      file: "decisions.md",
      line: 1,
      code: "file_missing",
      message: "decisions.md not found in spec directory",
    })
    checks.decisions_mandatory_lines = "fail"
  } else {
    const decisionsRaw = fs.readFileSync(decisionsMdPath, "utf8")
    const hasResearch = /^research:\s*(?:not-needed|required)\b/m.test(decisionsRaw)
    const hasPrototype = /^prototype:\s*(?:not-needed|required)\b/m.test(decisionsRaw)

    if (!hasResearch) {
      errors.push({
        file: "decisions.md",
        line: null,
        code: "missing_research_decision",
        message: "decisions.md is missing required line 'research: not-needed' or 'research: required'",
      })
      checks.decisions_mandatory_lines = "fail"
    }
    if (!hasPrototype) {
      errors.push({
        file: "decisions.md",
        line: null,
        code: "missing_prototype_decision",
        message: "decisions.md is missing required line 'prototype: not-needed' or 'prototype: required'",
      })
      checks.decisions_mandatory_lines = "fail"
    }
  }

  // --- 3. verification.md validation ---
  const mappedAcs = new Set()
  if (!fs.existsSync(verificationMdPath)) {
    errors.push({
      file: "verification.md",
      line: 1,
      code: "file_missing",
      message: "verification.md not found in spec directory",
    })
    checks.verification_coverage = "fail"
  } else {
    const verifRaw = fs.readFileSync(verificationMdPath, "utf8")
    const verifLines = verifRaw.split(/\r?\n/)

    let currentAc = null
    let acCommandFound = false

    for (let i = 0; i < verifLines.length; i++) {
      const line = verifLines[i]
      const trimmed = line.trim()

      const headingMatch = trimmed.match(/^###\s+.*`?(AC-[A-Z0-9]+-\d+)`?/)
      if (headingMatch) {
        if (currentAc && !acCommandFound) {
          errors.push({
            file: "verification.md",
            line: i + 1,
            code: "empty_ac_command",
            message: `Acceptance Criterion ${currentAc} has heading but no executable command in verification.md`,
          })
          checks.verification_coverage = "fail"
        }
        currentAc = headingMatch[1]
        acCommandFound = false
        mappedAcs.add(currentAc)
        continue
      }

      if (currentAc) {
        if (/^\*\*Command:\*\*/i.test(trimmed) || /-\s*\*\*Command:\*\*/i.test(trimmed)) {
          // Check subsequent lines or same line for command
          acCommandFound = true
        }
      }
    }

    // Check declared ACs coverage
    for (const acId of declaredAcs) {
      if (!mappedAcs.has(acId)) {
        errors.push({
          file: "verification.md",
          line: null,
          code: "unmapped_ac",
          message: `Acceptance Criterion ${acId} has no corresponding command mapping in verification.md`,
        })
        checks.verification_coverage = "fail"
      }
    }
  }

  // --- 4. plan.md and tickets/*.md validation ---
  let planLanes = []
  if (!fs.existsSync(planMdPath)) {
    errors.push({
      file: "plan.md",
      line: 1,
      code: "file_missing",
      message: "plan.md not found in spec directory",
    })
    checks.plan_disjoint_ownership = "fail"
    checks.plan_acyclic_dag = "fail"
  } else {
    const planRaw = fs.readFileSync(planMdPath, "utf8")
    planLanes = parsePlanLanes(planRaw)
  }

  const tickets = parseTickets(ticketsDirPath)

  const knownLaneIds = new Set(planLanes.map((l) => l.id))
  for (const t of tickets) {
    if (t.laneId) knownLaneIds.add(t.laneId)
  }

  const knownStems = new Set(planLanes.map((l) => l.ticket))
  for (const t of tickets) {
    knownStems.add(t.stem)
  }

  // Parity check
  if (planLanes.length > 0 || tickets.length > 0) {
    for (const lane of planLanes) {
      const match = tickets.find((t) => laneMatchesTicket(lane, t))
      if (!match) {
        errors.push({
          file: "plan.md",
          line: lane.line,
          code: "tickets_parity",
          message: `Lane ${lane.id} (${lane.ticket}) in plan.md has no matching ticket file in tickets/`,
        })
        checks.tickets_parity = "fail"
      }
    }

    for (const ticket of tickets) {
      const match = planLanes.find((l) => laneMatchesTicket(l, ticket))
      if (!match) {
        errors.push({
          file: ticket.file,
          line: 1,
          code: "tickets_parity",
          message: `Ticket ${ticket.filename} has no matching lane entry in plan.md`,
        })
        checks.tickets_parity = "fail"
      }
    }
  }

  // Build unified task nodes
  // If planLanes exist, use planLanes mapped with ticket ownership and deps
  // Prefer ticket files for Blocked by & Ownership if present, else planLanes
  const unifiedTasks = new Map()

  for (const lane of planLanes) {
    unifiedTasks.set(lane.id, {
      id: lane.id,
      stem: lane.ticket,
      ownership: [...lane.ownership],
      blockedBy: [...lane.blockedBy],
      file: "plan.md",
      line: lane.line,
    })
  }
  // If individual tickets supersede a group lane row from plan.md (e.g. T11a..d supersedes T11)
  const supersededLanes = new Set()
  for (const [laneId, lane] of unifiedTasks.entries()) {
    const matchingTickets = tickets.filter(
      (t) => t.laneId !== laneId && (t.laneId?.toLowerCase().startsWith(laneId.toLowerCase()) || lane.stem.includes(".."))
    )
    if (matchingTickets.length > 0) {
      supersededLanes.add(laneId)
    }
  }
  for (const id of supersededLanes) {
    unifiedTasks.delete(id)
  }
  for (const ticket of tickets) {
    const id = ticket.laneId || ticket.stem
    const existing = unifiedTasks.get(id) || {
      id,
      stem: ticket.stem,
      ownership: [],
      blockedBy: [],
      file: ticket.file,
      line: 1,
    }

    // Merge ownership from ticket if provided
    if (ticket.ownership.length > 0) {
      existing.ownership = ticket.ownership
    }

    // Parse blocked by from ticket
    if (ticket.blockedByRaw) {
      const { deps, unknown } = parseBlockedBy(ticket.blockedByRaw, knownLaneIds, knownStems)
      if (unknown.length > 0) {
        for (const unk of unknown) {
          errors.push({
            file: ticket.file,
            line: ticket.blockedByLine,
            code: "ticket_phase_forward_ref",
            message: `Ticket ${ticket.filename} references non-existent or forward ticket "${unk}"`,
          })
          checks.plan_acyclic_dag = "fail"
        }
      }
      existing.blockedBy = deps
    }

    unifiedTasks.set(id, existing)
  }

  // Normalize dependency IDs (e.g. if a dep references stem, map to laneId if possible)
  const taskIds = Array.from(unifiedTasks.keys())
  const stemToId = new Map()
  for (const [id, t] of unifiedTasks.entries()) {
    if (t.stem) stemToId.set(t.stem, id)
  }

  for (const [id, t] of unifiedTasks.entries()) {
    t.normalizedBlockedBy = t.blockedBy.map((d) => {
      const norm = normalizeLaneId(d)
      const taskIdMap = new Map()
      for (const id of taskIds) {
        taskIdMap.set(id.toLowerCase(), id)
      }
      if (taskIdMap.has(norm.toLowerCase())) return taskIdMap.get(norm.toLowerCase())
      if (stemToId.has(d)) return stemToId.get(d)
      return d
    })
  }
  // Cycle detection
  const cycle = detectCycles(taskIds, (id) => unifiedTasks.get(id)?.normalizedBlockedBy || [])
  if (cycle) {
    errors.push({
      file: "tickets",
      line: null,
      code: "cyclic_ticket_dependency",
      message: `Circular dependency detected in tickets: ${cycle.join(" -> ")}`,
    })
    checks.plan_acyclic_dag = "fail"
  }

  // Topological levels (Waves) and disjoint ownership
  if (!cycle && taskIds.length > 0) {
    const levels = computeTopologicalLevels(taskIds, (id) => unifiedTasks.get(id)?.normalizedBlockedBy || [])
    if (!levels) {
      errors.push({
        file: "plan.md",
        line: null,
        code: "cyclic_ticket_dependency",
        message: "Circular dependency detected during wave calculation",
      })
      checks.plan_acyclic_dag = "fail"
    } else {
      // Group lanes by wave level
      const waveMap = new Map()
      for (const [id, lvl] of levels.entries()) {
        if (!waveMap.has(lvl)) waveMap.set(lvl, [])
        waveMap.get(lvl).push(unifiedTasks.get(id))
      }

      // Check parallel collisions within each wave
      for (const [waveNum, lanesInWave] of waveMap.entries()) {
        if (lanesInWave.length < 2) continue
        for (let i = 0; i < lanesInWave.length; i++) {
          for (let j = i + 1; j < lanesInWave.length; j++) {
            const laneA = lanesInWave[i]
            const laneB = lanesInWave[j]
            for (const pathA of laneA.ownership) {
              for (const pathB of laneB.ownership) {
                if (pathsCollide(pathA, pathB)) {
                  errors.push({
                    file: "plan.md",
                    line: laneA.line || null,
                    code: "parallel_file_collision",
                    message: `Parallel lanes ${laneA.id} and ${laneB.id} in wave ${waveNum} have colliding file ownership: "${pathA}" and "${pathB}"`,
                  })
                  checks.plan_disjoint_ownership = "fail"
                }
              }
            }
          }
        }
      }
    }
  }

  // --- Check for Blast radius and Rollback sections (spec.md or plan.md) ---
  let hasCombined = false
  let hasBlastRadius = false
  let hasRollback = false

  const scanBlastAndRollback = (filePath) => {
    if (!fs.existsSync(filePath)) return
    const raw = fs.readFileSync(filePath, "utf8")
    const lines = raw.split(/\r?\n/)
    let inFence = false
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith("```")) {
        inFence = !inFence
        continue
      }
      if (!inFence && /^#+\s+/.test(trimmed)) {
        if (/^#+\s*(?:\d+\.?\s*)?(?:blast\s*radius\s*(?:\/|and|&)\s*rollback|rollback\s*(?:\/|and|&)\s*blast\s*radius)\b/i.test(trimmed)) {
          hasCombined = true
          hasBlastRadius = true
          hasRollback = true
        } else {
          if (/^#+\s*(?:\d+\.?\s*)?blast\s*radius\b/i.test(trimmed)) {
            hasBlastRadius = true
          }
          if (/^#+\s*(?:\d+\.?\s*)?rollback\b/i.test(trimmed)) {
            hasRollback = true
          }
        }
      }
    }
  }

  scanBlastAndRollback(specMdPath)
  scanBlastAndRollback(planMdPath)

  if (hasCombined || (hasBlastRadius && hasRollback)) {
    checks.blast_radius_rollback = "pass"
  } else {
    checks.blast_radius_rollback = "warn"
    if (!hasBlastRadius && !hasRollback) {
      warnings.push({
        file: fs.existsSync(planMdPath) ? "plan.md" : "spec.md",
        line: 1,
        code: "missing_blast_radius_rollback",
        message: "Plan/spec is missing required sections: '## Blast radius' and '## Rollback' (or combined 'Blast radius / rollback')",
      })
    } else if (!hasBlastRadius) {
      warnings.push({
        file: fs.existsSync(planMdPath) ? "plan.md" : "spec.md",
        line: 1,
        code: "missing_blast_radius",
        message: "Plan/spec is missing required section: '## Blast radius' (or combined 'Blast radius / rollback')",
      })
    } else {
      warnings.push({
        file: fs.existsSync(planMdPath) ? "plan.md" : "spec.md",
        line: 1,
        code: "missing_rollback",
        message: "Plan/spec is missing required section: '## Rollback' (or combined 'Blast radius / rollback')",
      })
    }
  }

  const ok = errors.length === 0

  return {
    ok,
    spec: path.relative(process.cwd(), resolvedDir).replace(/\\/g, "/") || ".",
    checks,
    errors,
    warnings,
  }
}

// Minimal valid fixture for selftest and fault injection
export const BASELINE_FIXTURE = {
  "spec.md": `# Spec (PRD) — Baseline Spec

## 1. Objective
Objective of the test spec.

## 2. Requirements
Requirements details.

### Acceptance Criteria
- \`AC-TST-1\`: First valid acceptance criterion
- \`AC-TST-2\`: Second valid acceptance criterion

## 3. Non-goals
Non-goals description.
`,
  "decisions.md": `# Architecture Decisions

## 1. Optional Planning Stages Record
research: not-needed
prototype: not-needed
`,
  "plan.md": `# Implementation Plan

## 1. Blast radius / rollback
- Repos touched: none
- Rollback: git revert

## 2. Lane Table
| Lane ID | Ticket / Name | Objective | Exact File Ownership Set | Blocked By (Edges) | Risk Tier | Gate Mode | Owning Capability | Verification Command |
|---|---|---|---|---|:---:|:---:|---|---|
| **T01** | \`01-task-alpha\` | First task | \`src/alpha.ts\` | None | \`low\` | \`local\` | \`fixer\` | \`node --test\` |
| **T02** | \`02-task-beta\` | Second task | \`src/beta.ts\` | None | \`low\` | \`local\` | \`fixer\` | \`node --test\` |
`,
  "verification.md": `# Verification Matrix

### \`AC-TST-1\`: First valid acceptance criterion
- **Command:**
  \`\`\`bash
  node --test test1.js
  \`\`\`

### \`AC-TST-2\`: Second valid acceptance criterion
- **Command:**
  \`\`\`bash
  node --test test2.js
  \`\`\`
`,
  "tickets/01-task-alpha.md": `# 01 — First Task

**Blocked by:** None — can start immediately (Wave 1)

**Risk tier:** \`low\`

**Gate:** \`local\`

**Ownership:**
- \`src/alpha.ts\`

**Capability:** \`fixer\`

**Status:** ready-for-agent

---

### Acceptance Criteria
- [ ] \`AC-TST-1\`: First valid acceptance criterion
`,
  "tickets/02-task-beta.md": `# 02 — Second Task

**Blocked by:** None — can start immediately (Wave 1)

**Risk tier:** \`low\`

**Gate:** \`local\`

**Ownership:**
- \`src/beta.ts\`

**Capability:** \`fixer\`

**Status:** ready-for-agent

---

### Acceptance Criteria
- [ ] \`AC-TST-2\`: Second valid acceptance criterion
`,
}

export function writeFixture(targetDir, files = BASELINE_FIXTURE) {
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(targetDir, relPath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, "utf8")
  }
}

export function runSelftest(options = {}) {
  const verbose = options.verbose ?? true
  const log = (msg) => {
    if (verbose) console.log(msg)
  }

  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "spec-selftest-base-"))
  let baselineOk = false
  try {
    writeFixture(baseDir)
    const baseResult = validateSpec(baseDir)
    baselineOk = baseResult.ok
  } finally {
    fs.rmSync(baseDir, { recursive: true, force: true })
  }

  if (!baselineOk) {
    if (verbose) console.error("[selftest] Baseline verification FAILED on valid fixture!")
    return { mutants: 0, killed: 0, survived: 1 }
  }

  log("[selftest] Running baseline verification on valid fixture... OK")

  const mutants = [
    {
      name: "missing_objective",
      mutate: (files) => {
        files["spec.md"] = files["spec.md"].replace(/## 1\. Objective/i, "## 1. Background Only")
      },
    },
    {
      name: "invalid_ac_format",
      mutate: (files) => {
        files["spec.md"] = files["spec.md"].replace("AC-TST-1", "INVALID_AC_FORMAT")
        files["verification.md"] = files["verification.md"].replace("AC-TST-1", "INVALID_AC_FORMAT")
      },
    },
    {
      name: "unmapped_ac_in_verification",
      mutate: (files) => {
        files["spec.md"] = files["spec.md"] + "\n- `AC-TST-9`: Missing from verification\n"
      },
    },
    {
      name: "parallel_file_collision",
      mutate: (files) => {
        files["tickets/02-task-beta.md"] = files["tickets/02-task-beta.md"].replace("src/beta.ts", "src/alpha.ts")
      },
    },
    {
      name: "cyclic_ticket_dependency",
      mutate: (files) => {
        files["tickets/01-task-alpha.md"] = files["tickets/01-task-alpha.md"].replace(
          "**Blocked by:** None — can start immediately (Wave 1)",
          "**Blocked by:** 02-task-beta (T02)"
        )
        files["tickets/02-task-beta.md"] = files["tickets/02-task-beta.md"].replace(
          "**Blocked by:** None — can start immediately (Wave 1)",
          "**Blocked by:** 01-task-alpha (T01)"
        )
      },
    },
    {
      name: "missing_research_decision",
      mutate: (files) => {
        files["decisions.md"] = files["decisions.md"].replace(/^research:\s*(?:not-needed|required)\b/m, "")
      },
    },
    {
      name: "missing_prototype_decision",
      mutate: (files) => {
        files["decisions.md"] = files["decisions.md"].replace(/^prototype:\s*(?:not-needed|required)\b/m, "")
      },
    },
    {
      name: "ticket_phase_forward_ref",
      mutate: (files) => {
        files["tickets/01-task-alpha.md"] = files["tickets/01-task-alpha.md"].replace(
          "**Blocked by:** None — can start immediately (Wave 1)",
          "**Blocked by:** 99-future-phase (T99)"
        )
      },
    },
  ]

  let killed = 0
  let survived = 0

  for (const m of mutants) {
    const mutatedFiles = JSON.parse(JSON.stringify(BASELINE_FIXTURE))
    m.mutate(mutatedFiles)

    const mutantDir = fs.mkdtempSync(path.join(os.tmpdir(), `spec-selftest-${m.name}-`))
    try {
      writeFixture(mutantDir, mutatedFiles)
      const res = validateSpec(mutantDir)
      if (!res.ok) {
        killed++
        log(`[selftest] Injecting mutant: ${m.name}... CAUGHT (exit 1)`)
      } else {
        survived++
        log(`[selftest] Injecting mutant: ${m.name}... SURVIVED (exit 0)`)
      }
    } finally {
      fs.rmSync(mutantDir, { recursive: true, force: true })
    }
  }

  log(`[selftest] Mutants injected: ${mutants.length}, Mutants caught: ${killed}, Surviving mutants: ${survived}`)
  if (survived === 0) {
    log("[selftest] ALL FAULT INJECTIONS PASSED DETERMINISTICALLY.")
  }

  return { mutants: mutants.length, killed, survived }
}
export const runSelfTest = runSelftest

export function runCli(argv) {
  const isJson = argv.includes("--json")
  const isSelfTest = argv.includes("--self-test")
  const specIdx = argv.indexOf("--spec")
  const specDir = specIdx >= 0 && argv[specIdx + 1] ? argv[specIdx + 1] : null

  if (isSelfTest) {
    const result = runSelftest({ verbose: !isJson })
    if (isJson) {
      console.log(JSON.stringify(result, null, 2))
    }
    return result.survived === 0 ? 0 : 1
  }

  if (specDir) {
    const result = validateSpec(specDir)
    if (isJson) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      if (result.ok) {
        console.log(`PASS: Spec "${result.spec}" validated successfully (0 errors).`)
      } else {
        console.error(`FAIL: Spec "${result.spec}" failed with ${result.errors.length} error(s):`)
        for (const err of result.errors) {
          const loc = err.line ? `${err.file}:${err.line}` : err.file
          console.error(`  - [${err.code}] ${loc}: ${err.message}`)
        }
      }
      if (result.warnings && result.warnings.length > 0) {
        console.warn(`WARNING: Spec "${result.spec}" has ${result.warnings.length} warning(s):`)
        for (const warn of result.warnings) {
          const loc = warn.line ? `${warn.file}:${warn.line}` : warn.file
          console.warn(`  - [${warn.code}] ${loc}: ${warn.message}`)
        }
      }
    }
    return result.ok ? 0 : 1
  }

  console.error("Usage: node harness-spec-validate.mjs --spec <dir> [--json] | --self-test [--json]")
  return 2
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const code = runCli(process.argv.slice(2))
  process.exit(code)
}
