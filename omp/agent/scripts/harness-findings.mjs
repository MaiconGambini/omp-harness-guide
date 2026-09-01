// harness-findings — the deterministic half of the continual harness (v1.3).
//
// The model classifies; this script counts. It never judges a record's merit, only its
// shape and its arithmetic: schema validation against the findings README
// (templates/docs/harness/findings/README.md), exact pointer resolution against the
// rulebook on disk, ledger text constraints, window binding by value, and the grouped
// counts / weighting / recall estimates the downstream stages read.
//
// SEC-R1 (2026-08-12, security review): the ledger's `targets_allowed` is a CONSTANT —
// the refiner's output becomes the ledger, so a widening `targets_allowed` would let a
// model choose where its prose lands; `example.right`/`wrong` carry the same injection
// constraints as `text`; `approved_by: "rule-verifier"` is a deterministic gate (toggle,
// prose, non-high-risk target, verifier report, audited session-compatible evidence);
// the propose bar is two-condition (weight + distinct sessions, D7); the exported
// learned_rules validator refuses an empty (partial) block instead of silently running
// on defaults.
//
// CLI:
//   --validate <file>         exit 0 valid · 1 invalid · 2 script blocker
//   --validate-ledger <file>  same, for agent-os/learned-rules.json
//   --window <n>              grouped counts for the newest n findings files. Derived counts
//                             (byRule/byAgent/unciteableRatio/proposeBar — the Refine inputs)
//                             use ONLY the newest available file's tier (T07 §6, A18); other
//                             tiers are excluded and the exclusion is stated in
//                             `tier`/`crossTierExcluded` in JSON and in the text output.
//                             Malformed files are reported, never dropped. The window is an
//                             observation command: exit 0 with problems represented in the
//                             output; 2 only for a script blocker (bad knobs, bad argv).
//   --json                    machine-readable output (for T07's adapter and the Refine phase)
//                             — --window --json also emits the per-rule proposeBar block:
//                             weighted evidence, distinct sessions, thresholds, eligible verdict
//   --root <dir>              project root (default: the working directory)
//
// Every invocation first range-checks quality-thresholds.json#learned_rules (T02's
// governing knobs). Out of range — or a knob with no range row here — is exit 2, never a
// silent default (review B12). T02 owns the data and defines the ranges; this module is
// the named code owner of the check, so "a control specified at one layer, unowned at the
// layer beneath" cannot recur (T02 S2).
//
// SECURITY: paths that reach git go through the hardened port in harness-quality-core.mjs
// (--literal-pathspecs on every invocation, entries validated by `validatePathEntries`),
// and every file that is read to LOCATE something goes through `safeReadFile` (lstat →
// regular file → realpath re-confirmed inside the root). Text that travels onward is
// passed through `redact()`.

import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

import {
  FINDINGS_DIR,
  makeGit,
  readJsonIfExists,
  redact,
  safeReadFile,
  THRESHOLDS_PATH,
  validatePathEntries,
} from "./harness-quality-core.mjs"
import { matchGlobs } from "./harness-risk-router.mjs"
import { emitTraceEvent, loadTraceIdentity, safeTraceId } from "./harness-ship-evidence.mjs"

export { validatePathEntries }

// SEC-R1: the rulebook allowlist is a CONSTANT, never ledger-supplied. The refiner's output
// becomes the ledger, so a ledger field that widens the allowlist would let a model choose
// where its own prose lands. Normalized: forward slashes, no leading slash; the trailing
// slash marks a directory prefix. A ledger carrying the constant verbatim is accepted; any
// other value — including an empty list — is a mutation attempt and is rejected.
export const TARGETS_ALLOWED = ["agent-os/standards/"]

// FINAL-R1 (D21 reachability): the rulebook's STORAGE path. `**/standards/**` sits in
// high_risk_paths, but matching it is NOT a verifier rejection — every permitted target lives
// under TARGETS_ALLOWED and would match it, so rejecting on it would make `rule-verifier`
// approval structurally impossible. The storage glob stays in high_risk_paths for a different
// reason: it forces the NEXT run's tier to full, which is the retroactive veto window — the
// human read is moved, not removed. Only a target matching an EFFECT high-risk glob (outside
// this storage scope) keeps the pre-commit operator gate.
export const STORAGE_HIGH_RISK_GLOBS = ["**/standards/**"]

const VALID_CLASSES = new Set(["rule_violation", "operator_note", "blind_spot", "defect", "nit"])
const VALID_ENFORCEMENTS = new Set(["prose", "lint", "test", "gate_metric"])
const VALID_STATUSES = new Set(["candidate", "active"])
const VALID_TIERS = new Set(["full", "sampling", "auto"])
const DEFAULT_RULE_TEXT_MAX_CHARS = 200
const DEFAULT_MIN_FINDINGS_TO_PROPOSE = 3
const DEFAULT_MIN_SESSIONS_TO_PROPOSE = 1
const DEFAULT_CITATION_SAMPLES = 3

// ---------------------------------------------------------------------------
// governing knobs — range validation (review B12, T02 S2, verification A12/A13)

// Every knob that governs the loop lives in quality-thresholds.json#learned_rules, so a
// change lands in the fingerprint's `other` bucket and needs a dated decision. This table
// is the range check on top: positive integer with a sane upper bound, out of range is
// exit 2 — never a default. `recall_sample_every_n_runs` has a purpose-built cap instead
// of a "sane" one: floor(stage1_window_runs / citation_competence_min_samples), so at
// least K sampling runs always fall inside a stage-1 window and the liveness signal
// cannot be deferred out of existence (S6).
const KNOB_RANGES = {
  stage: { integer: true, min: 1, max: 2 },
  min_findings_to_propose: { integer: true, min: 1, max: 100 },
  min_sessions_to_propose: { integer: true, min: 1, max: 100 },
  operator_note_weight: { integer: true, min: 1, max: 100 },
  reviewer_finding_weight: { integer: true, min: 1, max: 100 },
  defect_weight: { integer: true, min: 1, max: 100 },
  max_active_rules_per_target: { integer: true, min: 1, max: 100 },
  max_proposals_per_run_per_component: { integer: true, min: 1, max: 100 },
  retire_after_days_without_citation: { integer: true, min: 1, max: 3650 },
  rewrite_after_violations_after: { integer: true, min: 1, max: 10000 },
  recall_sample_every_n_runs: "recallCap",
  stage1_window_runs: "stageWindow",
  citation_competence_min_samples: { integer: true, min: 1, max: 100 },
  // Floors start null (not yet derived from real sampling runs) and become probabilities.
  citation_competence_floor: { nullable: true, min: 0, max: 1 },
  reviewer_recall_floor: { nullable: true, min: 0, max: 1 },
  rule_text_max_chars: { integer: true, min: 1, max: 100000 },
  standards_file_lines_max: { integer: true, min: 1, max: 1000000 },
  enforced_fraction_min_runs: { integer: true, min: 1, max: 100000 },
  auto_activate_prose_observe: { type: "boolean" },
}

export function validateLearnedRules(knobs) {
  if (knobs === null || typeof knobs !== "object" || Array.isArray(knobs)) {
    return { ok: false, errors: ["learned_rules must be an object"] }
  }
  // SEC-R1: a block that exists but carries no knobs is a PARTIAL declaration, not an absent
  // one. The gate's wrapper treats a missing block as "feature not installed"; an empty block
  // is someone declaring the feature and forgetting the knobs — running on function defaults
  // would be a silent default, which this module refuses on principle (review B12).
  if (Object.keys(knobs).length === 0) {
    return { ok: false, errors: ["learned_rules is an empty block — a declared feature with no knobs is partial, not absent; declare the knobs or remove the block (SEC-R1)"] }
  }
  const errors = []
  const samples = typeof knobs.citation_competence_min_samples === "number" ? knobs.citation_competence_min_samples : DEFAULT_CITATION_SAMPLES
  for (const [key, value] of Object.entries(knobs)) {
    const range = KNOB_RANGES[key]
    if (!range) {
      // Fail closed: a knob with no range row is a control with no code owner. The table
      // lives next to this check, so adding a knob means adding its row here first.
      errors.push(
        `learned_rules.${key}: no range row in harness-findings.mjs — a knob without a range is a control with no code owner (T02 S2). Add the row before shipping the knob`,
      )
      continue
    }
    if (typeof range === "string") {
      if (key === "recall_sample_every_n_runs") {
        const windowRuns = knobs.stage1_window_runs
        if (typeof windowRuns !== "number") {
          errors.push("learned_rules.recall_sample_every_n_runs: stage1_window_runs must be present to compute the S6 cap")
          continue
        }
        const cap = Math.floor(windowRuns / samples)
        if (cap < 1) {
          errors.push(
            `learned_rules.stage1_window_runs: ${windowRuns} < citation_competence_min_samples (${samples}) — the S6 recall cap would be 0 and sampling could be deferred out of existence`,
          )
        } else if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > cap) {
          errors.push(
            `learned_rules.recall_sample_every_n_runs: ${JSON.stringify(value)} outside 1..${cap} (floor(stage1_window_runs / citation_competence_min_samples)) — at least ${samples} sampling runs must fit inside a stage-1 window (S6)`,
          )
        }
        continue
      }
      if (key === "stage1_window_runs") {
        if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
          errors.push(`learned_rules.stage1_window_runs: expected a positive integer, got ${JSON.stringify(value)}`)
        } else if (value < samples) {
          errors.push(
            `learned_rules.stage1_window_runs: ${value} < citation_competence_min_samples (${samples}) — the S6 recall cap would be 0`,
          )
        } else if (value > 100000) {
          errors.push(`learned_rules.stage1_window_runs: ${value} outside 1..100000`)
        }
        continue
      }
    }
    if (range.type === "boolean") {
      if (typeof value !== "boolean") errors.push(`learned_rules.${key}: expected a boolean, got ${JSON.stringify(value)}`)
      continue
    }
    if (range.nullable && (value === null || value === undefined)) continue
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(`learned_rules.${key}: expected a number, got ${JSON.stringify(value)}`)
      continue
    }
    if (range.integer && !Number.isInteger(value)) {
      errors.push(`learned_rules.${key}: expected an integer, got ${value}`)
      continue
    }
    if (range.min !== undefined && value < range.min) {
      errors.push(`learned_rules.${key}: ${value} below the range minimum ${range.min}`)
    }
    if (range.max !== undefined && value > range.max) {
      errors.push(`learned_rules.${key}: ${value} above the range maximum ${range.max}`)
    }
  }
  return { ok: errors.length === 0, errors }
}

// ---------------------------------------------------------------------------
// pointer resolution — exact, never fuzzy (A2, D19)

// A pointer `path#anchor` resolves when the file on disk contains a heading whose
// GitHub-style slug equals the anchor exactly, or an explicit marker line
// (`<!-- anchor: id -->`, `<!-- rule: id -->`, `<a id="...">`). "Something similar" is
// rejected: a pointer that resolves fuzzily manufactures evidence (audit F2).
export function resolveRulePointer(pointer, { root } = {}) {
  if (typeof pointer !== "string" || !pointer.includes("#")) {
    return { ok: false, reason: "pointer must be path#anchor" }
  }
  const splitAt = pointer.indexOf("#")
  const filePart = pointer.slice(0, splitAt)
  const anchor = pointer.slice(splitAt + 1)
  const normalized = filePart.replace(/\\/g, "/")
  if (!normalized.trim() || !anchor.trim()) return { ok: false, reason: "pointer must be path#anchor" }
  if (normalized === "AGENTS.md" || normalized.endsWith("/AGENTS.md")) {
    return { ok: false, reason: "AGENTS.md is not a valid rule target — it belongs to harness-project-calibration, and a learned rule targeting it would be a second write path into the entry point (review F4)" }
  }
  const read = safeReadFile(root, filePart)
  if (!read.ok) return { ok: false, reason: read.reason }
  const match = findAnchorLine(read.text, anchor)
  if (!match) {
    return { ok: false, reason: `no heading or rule id exactly matching ${JSON.stringify(anchor)} in ${normalized} — resolution is exact, never fuzzy` }
  }
  return { ok: true, file: normalized, anchor, line: match.line, text: match.lineText }
}

function findAnchorLine(text, anchor) {
  const lines = text.split(/\r?\n/)
  const markers = [/<!--\s*anchor:\s*([\w.-]+)\s*-->/, /<!--\s*rule:\s*([\w.-]+)\s*-->/, /<a\s+id=["']([\w.-]+)["']/]
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)
    if (heading && slugify(heading[1]) === anchor) return { line: index + 1, lineText: line.trim() }
    for (const marker of markers) {
      const match = marker.exec(line)
      if (match && match[1] === anchor) return { line: index + 1, lineText: line.trim() }
    }
  }
  return null
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// ---------------------------------------------------------------------------
// record validation (A1, B10)

// Shape check per the findings README, AND lane/capability/model/changed_lines_in_lane
// validated against the run's lane manifest — never against git (review B10): the dual
// review runs once over the whole diff and every lane lands in one scheduler commit, so
// no git-visible lane boundary exists. Without a manifest only presence is checked.
export function validateRecord(record, { root, manifest } = {}) {
  const errors = []
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    return { ok: false, errors: ["record must be an object"] }
  }
  const has = (field) => typeof record[field] === "string" && record[field].trim() !== ""
  if (!has("class")) errors.push("missing class")
  else if (!VALID_CLASSES.has(record.class)) {
    errors.push(`unknown class ${JSON.stringify(record.class)} — expected one of ${[...VALID_CLASSES].join(", ")}`)
  }
  if (!has("id")) errors.push("missing id")
  if (!has("file")) errors.push("missing file")
  else {
    const confined = validatePathEntries([record.file], root)
    if (!confined.ok) errors.push(...confined.refusals)
  }
  if (typeof record.line !== "number" || !Number.isInteger(record.line) || record.line < 0) {
    errors.push("line must be a non-negative integer")
  }
  if (!has("severity")) errors.push("missing severity")
  if (!has("lane")) errors.push("missing lane")
  if (!has("capability")) errors.push("missing capability")
  if (!has("model")) errors.push("missing model")
  if (typeof record.changed_lines_in_lane !== "number" || !Number.isInteger(record.changed_lines_in_lane) || record.changed_lines_in_lane < 0) {
    errors.push("changed_lines_in_lane must be a non-negative integer")
  }
  if (!has("summary")) errors.push("missing summary")
  if (record.class === "rule_violation") {
    if (!has("rule")) {
      errors.push("rule_violation with no rule — a reviewer that cannot cite the rule must downgrade to blind_spot or nit")
    } else {
      const resolved = resolveRulePointer(record.rule, { root })
      if (!resolved.ok) errors.push(`unresolvable rule ${JSON.stringify(record.rule)}: ${resolved.reason}`)
    }
  }
  if (manifest) {
    const lane = (manifest.lanes ?? []).find((entry) => entry?.lane === record.lane)
    if (!lane) {
      errors.push(`lane ${JSON.stringify(record.lane)} not in the run's lane manifest — the manifest is the only source of lane identity (review B10)`)
    } else {
      if (lane.capability !== undefined && record.capability !== lane.capability) {
        errors.push(`capability ${JSON.stringify(record.capability)} disagrees with the lane manifest (${JSON.stringify(lane.capability)})`)
      }
      if (lane.model !== undefined && record.model !== lane.model) {
        errors.push(`model ${JSON.stringify(record.model)} disagrees with the lane manifest (${JSON.stringify(lane.model)})`)
      }
      if (lane.changed_lines !== undefined && record.changed_lines_in_lane !== lane.changed_lines) {
        errors.push(`changed_lines_in_lane ${record.changed_lines_in_lane} disagrees with the lane manifest (${lane.changed_lines})`)
      }
      const ownership = validatePathEntries(lane.ownership ?? [], root)
      if (!ownership.ok) errors.push(...ownership.refusals)
    }
  }
  return { ok: errors.length === 0, errors }
}

// ---------------------------------------------------------------------------
// ledger validation (A3, A4, review B4, D21)

// `text` is pasted into every matching write-capable lane's prompt — a newline forges
// list entries inside the prompt of an agent holding `edit: allow, bash: allow`. This is
// the only file whose contents reach every write-capable prompt, so its schema is the
// first thing `--validate-ledger` enforces. Code examples live in their own quoted
// `example` field, never inline (D9). SEC-R1: the allowlist is a constant
// (`TARGETS_ALLOWED`); the ledger can neither widen it nor empty it, and a target must be a
// repository-relative markdown path inside it. `example.right`/`example.wrong` travel into
// the same prompts when a rule is rendered, so they carry the same injection constraints
// as `text`.
function checkInjectedText(value, maxChars, where, errors) {
  if (typeof value !== "string") {
    errors.push(`${where} required`)
    return
  }
  if (value.length > maxChars) errors.push(`${where} exceeds rule_text_max_chars (${maxChars})`)
  if (/[\r\n]/.test(value)) errors.push(`${where} must be single-line — a newline forges list entries inside a write-capable lane's prompt (review B4)`)
  if (/[\x00-\x1f\x7f]/.test(value)) errors.push(`${where} must not contain control characters (review B4)`)
  if (/```|~~~/.test(value)) errors.push(`${where} must not contain fenced blocks — the fence is the untrusted-data boundary (review B4)`)
  if (/^#{1,6}\s/m.test(value)) errors.push(`${where} must not contain markdown headings (review B4)`)
}

// YYYY-MM-DD, validated by round-trip so 2026-02-31 is not a date.
function parseDate(value) {
  if (typeof value !== "string") return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (Number.isNaN(date.getTime())) return null
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) return null
  return date
}

const VERIFIER_REQUIRED_STATS = ["violations_before", "violations_after", "citations", "runs_since_approval"]
const RUN_TOKEN_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[A-Za-z0-9._-]+$/

export function validateLedger(ledger, { root, config } = {}) {
  const errors = []
  if (ledger === null || typeof ledger !== "object" || Array.isArray(ledger)) {
    return { ok: false, errors: ["ledger must be an object"] }
  }
  const maxChars = config?.rule_text_max_chars ?? DEFAULT_RULE_TEXT_MAX_CHARS
  // SEC-R1 + FINAL-R1: the allowlist is the constant, and the ledger MUST declare it — exact
  // length and exact order. A ledger without the field, with a shorter or longer list, or with a
  // reordered one is a mutation attempt: an appended entry after the constant used to pass
  // because the comparison only walked the constant's length.
  if (ledger.targets_allowed === undefined) {
    errors.push(
      `targets_allowed required — the allowlist is a constant (${TARGETS_ALLOWED.join(", ")}) and a ledger must carry it verbatim; absence is a mutation attempt (SEC-R1)`,
    )
  } else {
    const normalized = Array.isArray(ledger.targets_allowed) ? ledger.targets_allowed.map((entry) => String(entry).replace(/\\/g, "/")) : null
    const exact =
      Array.isArray(ledger.targets_allowed) &&
      ledger.targets_allowed.length === TARGETS_ALLOWED.length &&
      TARGETS_ALLOWED.every((prefix, index) => normalized[index] === prefix)
    if (!exact) {
      errors.push(
        `targets_allowed may not be changed, emptied, extended or reordered — the allowlist is a constant (${TARGETS_ALLOWED.join(", ")}) and a ledger cannot widen where its own rules land (SEC-R1)`,
      )
    }
  }
  for (const key of ["rules", "conflicts", "retired"]) {
    if (!Array.isArray(ledger[key])) errors.push(`${key} must be an array`)
  }
  for (const [index, rule] of (ledger.rules ?? []).entries()) {
    const where = `rules[${index}]`
    if (rule === null || typeof rule !== "object" || Array.isArray(rule)) {
      errors.push(`${where} must be an object`)
      continue
    }
    if (typeof rule.id !== "string" || !rule.id.trim()) errors.push(`${where}.id required`)
    if (typeof rule.text !== "string") errors.push(`${where}.text required`)
    else checkInjectedText(rule.text, maxChars, `${where}.text`, errors)
    if (typeof rule.target !== "string") errors.push(`${where}.target required`)
    else {
      const normalized = rule.target.replace(/\\/g, "/")
      if (normalized === "AGENTS.md" || normalized.endsWith("/AGENTS.md")) {
        errors.push(`${where}.target AGENTS.md is not allowed — calibration owns it; allowing both would be a second write path into the entry point (review F4)`)
      }
      if (normalized.split("/").includes("..")) {
        errors.push(`${where}.target must not contain a dot-dot segment — a traversal target escapes the allowlist prefix (SEC-R1)`)
      }
      if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
        errors.push(`${where}.target must be repository-relative — an absolute path is outside the repository (SEC-R1)`)
      }
      if (!normalized.endsWith(".md")) {
        errors.push(`${where}.target must be a markdown file (.md) — learned rules only ever append to agent-os/standards/*.md (SEC-R1)`)
      }
      if (!TARGETS_ALLOWED.some((prefix) => normalized.startsWith(prefix))) {
        errors.push(`${where}.target ${JSON.stringify(rule.target)} outside targets_allowed (${TARGETS_ALLOWED.join(", ")}) — the allowlist is a constant, the ledger cannot widen it (SEC-R1)`)
      }
    }
    if (typeof rule.anchor !== "string" || !rule.anchor.trim()) {
      errors.push(`${where}.anchor required — without an anchor the rule can never be cited, so it can never be measured`)
    }
    if (rule.enforcement !== undefined && !VALID_ENFORCEMENTS.has(rule.enforcement)) {
      errors.push(`${where}.enforcement ${JSON.stringify(rule.enforcement)} — expected ${[...VALID_ENFORCEMENTS].join("|")}`)
    }
    if (rule.status !== undefined && !VALID_STATUSES.has(rule.status)) {
      errors.push(`${where}.status ${JSON.stringify(rule.status)} — expected ${[...VALID_STATUSES].join("|")}`)
    }
    if (rule.example !== undefined) {
      if (!rule.example || typeof rule.example !== "object" || typeof rule.example.right !== "string" || typeof rule.example.wrong !== "string") {
        errors.push(`${where}.example must be an object with string right and wrong — a code example lives in its own quoted field, never inline in text (D9)`)
      } else {
        // SEC-R1: example.right/wrong are rendered into the same write-capable prompts as
        // `text`; they carry the identical injection constraints.
        checkInjectedText(rule.example.right, maxChars, `${where}.example.right`, errors)
        checkInjectedText(rule.example.wrong, maxChars, `${where}.example.wrong`, errors)
      }
    }
    const provenance = rule.provenance
    if (!provenance || typeof provenance !== "object") {
      errors.push(`${where}.provenance required`)
    } else {
      for (const field of ["first_seen", "proposed_by", "approved_by", "approved_at", "refuted_by"]) {
        if (typeof provenance[field] !== "string" || !provenance[field].trim()) errors.push(`${where}.provenance.${field} required`)
      }
      if (!Array.isArray(provenance.source_findings)) errors.push(`${where}.provenance.source_findings must be an array`)
      if (provenance.approved_by === "rule-verifier") {
        // D21: only the prose+observe path can auto-activate, and the refutation attempt
        // that failed must be recorded — an auto-activated rule carries the same auditable
        // trail as an operator-approved one.
        if (rule.enforcement !== "prose") {
          errors.push(`${where}: approved_by "rule-verifier" requires enforcement "prose" — the verifier never approves a rule that can block (D21)`)
        }
        if (typeof provenance.verifier_report !== "string" || !provenance.verifier_report.trim()) {
          errors.push(`${where}.provenance.verifier_report required when approved_by is "rule-verifier" — the refutation attempt that failed must be recorded (D21)`)
        }
        // SEC-R1: auto-activation is deterministic, not self-declared. Every gate below is
        // checked at validate time from the guarded thresholds file, never from the ledger:
        // the config toggle must be true, the target must not match a high_risk_path, and
        // the rule must carry auditable, session-compatible evidence.
        if (config?.auto_activate_prose_observe !== true) {
          errors.push(
            `${where}: approved_by "rule-verifier" requires auto_activate_prose_observe: true in quality-thresholds.json#learned_rules — the toggle gates auto-activation deterministically; false or absent is a refusal (D21, SEC-R1)`,
          )
        }
        const thresholds = root ? readJsonIfExists(path.join(root, THRESHOLDS_PATH)) : null
        const highRisk = Array.isArray(thresholds?.high_risk_paths) ? thresholds.high_risk_paths : []
        if (!root) {
          errors.push(`${where}: approved_by "rule-verifier" cannot verify the target against high_risk_paths without root — refusing rather than approving unverified (D21, SEC-R1)`)
        } else {
          const normalizedTarget = typeof rule.target === "string" ? rule.target.replace(/\\/g, "/") : ""
          // FINAL-R1 (D21 reachability): the high-risk target check is scoped to EFFECT risk.
          // Storage-path globs (STORAGE_HIGH_RISK_GLOBS) are excluded — they match every
          // permitted target and their high-risk status is the next-run retroactive veto, not a
          // pre-commit block. Only a target matching an effect-level glob keeps the operator
          // gate; with the default high_risk_paths the remaining globs cannot match any target
          // inside TARGETS_ALLOWED, so the check is a no-op that exists for defense in depth.
          const effectRisk = highRisk.filter((glob) => !STORAGE_HIGH_RISK_GLOBS.includes(glob))
          const matched = matchGlobs(normalizedTarget, effectRisk)
          if (matched) {
            errors.push(
              `${where}: approved_by "rule-verifier" requires a target free of effect-level high-risk paths — ${JSON.stringify(rule.target)} matches high_risk_paths pattern ${JSON.stringify(matched)}; storage-path high risk (${STORAGE_HIGH_RISK_GLOBS.join(", ")}) is the next-run veto, not a pre-commit block (D21, FINAL-R1)`,
            )
          }
        }
        if (!Array.isArray(provenance.source_findings) || provenance.source_findings.length === 0 || provenance.source_findings.some((entry) => typeof entry !== "string" || !entry.trim())) {
          errors.push(`${where}.provenance.source_findings must be a non-empty array of strings when approved_by is "rule-verifier" — an auto-activated rule needs auditable evidence (D21, SEC-R1)`)
        }
        const statsOk =
          rule.stats && typeof rule.stats === "object" && !Array.isArray(rule.stats) &&
          VERIFIER_REQUIRED_STATS.every((field) => typeof rule.stats[field] === "number" && Number.isInteger(rule.stats[field]) && rule.stats[field] >= 0)
        if (!statsOk) {
          errors.push(`${where}.stats must carry ${VERIFIER_REQUIRED_STATS.join(", ")} as non-negative integers when approved_by is "rule-verifier" — partial stats are not auditable (SEC-R1)`)
        }
        const firstSeen = parseDate(provenance.first_seen)
        const approvedAt = parseDate(provenance.approved_at)
        if (!firstSeen || !approvedAt) {
          errors.push(`${where}.provenance.first_seen and approved_at must be YYYY-MM-DD dates when approved_by is "rule-verifier" (SEC-R1)`)
        } else if (approvedAt < firstSeen) {
          errors.push(`${where}.provenance.approved_at must not predate first_seen — an approval cannot precede its evidence (session compatibility, SEC-R1)`)
        }
        const createdRun = rule.created_at_run
        if (typeof createdRun !== "string" || !RUN_TOKEN_PATTERN.test(createdRun)) {
          errors.push(`${where}.created_at_run required and must be a run token (YYYY-MM-DDTHH-MM-SS-<label>) when approved_by is "rule-verifier" — the approval must name the session the rule was created in (SEC-R1)`)
        } else {
          const createdDate = parseDate(createdRun.slice(0, 10))
          if (approvedAt && createdDate && createdDate > approvedAt) {
            errors.push(`${where}.created_at_run must not be later than approved_at — a rule cannot be created in a session after its approval (session compatibility, SEC-R1)`)
          }
        }
      } else if (provenance.approved_by !== undefined && !["operator", "rule-verifier"].includes(provenance.approved_by)) {
        errors.push(`${where}.provenance.approved_by ${JSON.stringify(provenance.approved_by)} — expected operator or rule-verifier`)
      }
    }
    const stats = rule.stats
    if (stats !== undefined) {
      if (!stats || typeof stats !== "object") {
        errors.push(`${where}.stats must be an object`)
      } else {
        for (const field of ["violations_before", "violations_after", "citations", "runs_since_approval"]) {
          const value = stats[field]
          if (value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || value < 0)) {
            errors.push(`${where}.stats.${field} must be a non-negative integer`)
          }
        }
      }
    }
  }
  return { ok: errors.length === 0, errors }
}

// ---------------------------------------------------------------------------
// the window (D15, review B8)

// Newest N findings files. A file with no reviewer roster is `unavailable`, not empty;
// malformed files are REPORTED, never silently dropped — a dropped file is a detector
// that stops counting without saying so.
export function readWindow({ root, runs } = {}) {
  const dir = path.join(root, FINDINGS_DIR)
  const names = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort().reverse().slice(0, Math.max(1, runs ?? 1))
    : []
  return names.map((name) => {
    const file = path.join(FINDINGS_DIR, name)
    const read = safeReadFile(root, file)
    if (!read.ok) return { file, ok: false, error: read.reason }
    let data
    try {
      data = JSON.parse(read.text)
    } catch {
      return { file, ok: false, error: "malformed JSON — reported, never dropped" }
    }
    const roster = Array.isArray(data?.roster) ? data.roster : []
    if (roster.length === 0) {
      return { file, ok: true, unavailable: "no reviewer roster — findings without a roster are the rows: [] bug, not an honest zero (review B8)", data }
    }
    return { file, ok: true, data }
  })
}

// The newest file's recorded gate_report sourceHash must match the evaluated report
// EXACTLY — a filename in a listable directory is no content binding (review B8). Older
// files' hashes must appear in a commit trailer, and presence must match the tier: `full`
// with no file, or `auto` with one, rejects the window.
export function assessWindow(window, { report, tier, git, root } = {}) {
  const errors = []
  const mode = String(tier ?? "").toLowerCase()
  const entries = window ?? []
  if (mode === "full" && entries.length === 0) errors.push("tier full with no findings file — absence rejects the window (review B8)")
  if (mode === "auto" && entries.length > 0) errors.push(`tier auto with ${entries.length} findings file(s) — presence rejects the window (review B8)`)
  if (mode === "sampling" && entries.length === 0) {
    errors.push("tier sampling with no findings file — a sampling run has reviewers, so its records must exist")
  }
  for (const entry of entries) {
    if (entry.ok === false) errors.push(`${entry.file}: malformed — ${entry.error}`)
    else if (entry.unavailable) errors.push(`${entry.file}: ${entry.unavailable}`)
  }
  if (entries.length > 0 && !report) {
    errors.push("no report supplied — the newest file's gate_source_hash must be compared by value, not by filename (review B8)")
  }
  if (report && entries.length > 0) {
    const recorded = entries[0].data?.run?.gate_source_hash ?? null
    if (typeof recorded !== "string" || recorded.length === 0) {
      errors.push(`${entries[0].file}: no run.gate_source_hash recorded — without a content binding a copied filename would pass (review B8)`)
    } else if (recorded !== report.sourceHash) {
      errors.push(
        `${entries[0].file}: recorded gate_source_hash ${recorded} does not match the evaluated report's sourceHash ${report.sourceHash} — the window is stale or belongs to another run`,
      )
    }
  }
  if (entries.length > 1) {
    const gitAccess = git ?? (root ? makeGit(root) : null)
    if (!gitAccess) {
      errors.push("cannot verify older files' hashes in commit trailers without git access — pass git or root")
    } else {
      const trailers = sourceHashesInTrailers(gitAccess)
      for (const entry of entries.slice(1)) {
        const recorded = entry.data?.run?.gate_source_hash
        if (typeof recorded !== "string" || !trailers.includes(recorded.toLowerCase())) {
          errors.push(`${entry.file}: gate_source_hash ${JSON.stringify(recorded)} not found in any commit trailer — an older file must be bound to a shipped run (review B8)`)
        }
      }
    }
  }
  return { ok: errors.length === 0, errors }
}

function sourceHashesInTrailers(git) {
  const out = git.text(["log", "--format=%B"])
  return [...String(out).matchAll(/Source-Hash:\s*([0-9a-fA-F]{16,})/g)].map((match) => match[1].toLowerCase())
}

function available(window) {
  return (window ?? []).filter(isCountable)
}

// ---------------------------------------------------------------------------
// cross-tier discipline (T07 §6, A18, FINAL-R2)
//
// A window's derived counts NEVER aggregate entries of different tiers: at tier
// `sampling` reviewers see a subset, so mixing populations silently compares a
// subset against a full read. The anchor is the newest AVAILABLE file — the same
// population the adherence adapter counts (A18). A malformed newest file cannot
// anchor counts (it is reported in `files`, never dropped), and a file with no
// roster is not a countable population.

function isCountable(entry) {
  return entry?.ok === true && !entry.unavailable && Array.isArray(entry.data?.findings)
}

// The newest file that is a countable population. Its recorded tier anchors every
// derived count. No anchor → no countable population: without a tier the window
// cannot be bound and cross-tier comparison cannot be ruled out, so the counts are
// refused, never guessed — the same refusal the adherence adapter emits.
export function newestTier(window) {
  const anchor = (window ?? []).find(isCountable)
  return typeof anchor?.data?.run?.tier === "string" ? anchor.data.run.tier.toLowerCase() : null
}

// The countable population: available entries whose recorded tier equals the newest
// available file's tier. A single-tier window is unchanged (every available entry
// counts); a mixed-tier window loses every other tier, and the caller states the
// exclusion.
export function countableWindow(window) {
  const tier = newestTier(window)
  if (!tier) return []
  return (window ?? []).filter(
    (entry) => isCountable(entry) && String(entry.data.run.tier ?? "").toLowerCase() === tier,
  )
}

// Why a window entry is not part of the countable population — emitted per file so a
// consumer can see exactly what the counts exclude (FINAL-R2).
export function exclusionReasonOf(entry) {
  if (entry?.ok === false) return "malformed — reported, never dropped"
  if (entry?.unavailable) return "no reviewer roster — not a countable population"
  if (!Array.isArray(entry?.data?.findings)) return "no findings array — not a countable population"
  const tier = String(entry?.data?.run?.tier ?? "").toLowerCase()
  if (!tier) return "no recorded tier — cross-tier comparison cannot be ruled out"
  return `other tier (${tier}) — cross-tier comparison refused (T07 §6)`
}

// ---------------------------------------------------------------------------
// counts (D16, review M13)

// Grouping is by capability — eighteen of nineteen agents run one model, so grouping by
// model has one bucket. `model` is carried for provenance, never grouped on. Counts use
// only the newest available file's tier (T07 §6, A18, FINAL-R2).
export function countByRule(window) {
  const counts = new Map()
  for (const entry of countableWindow(window)) {
    for (const record of entry.data.findings) {
      if (record.class !== "rule_violation" || typeof record.rule !== "string") continue
      counts.set(record.rule, (counts.get(record.rule) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([rule, count]) => ({ rule, count }))
    .sort((a, b) => b.count - a.count)
}

export function countByAgent(window) {
  const groups = new Map()
  for (const entry of countableWindow(window)) {
    for (const record of entry.data.findings) {
      const capability = typeof record.capability === "string" ? record.capability : "unknown"
      const group = groups.get(capability) ?? { capability, count: 0, models: new Set() }
      group.count += 1
      if (typeof record.model === "string") group.models.add(record.model)
      groups.set(capability, group)
    }
  }
  return [...groups.values()]
    .map(({ capability, count, models }) => ({ capability, count, models: [...models].sort() }))
    .sort((a, b) => b.count - a.count)
}

// ---------------------------------------------------------------------------
// weighting (D7, A7)

const WEIGHT_KEYS = {
  rule_violation: "reviewer_finding_weight",
  operator_note: "operator_note_weight",
  defect: "defect_weight",
}
const DEFAULT_WEIGHTS = { operator_note_weight: 3, reviewer_finding_weight: 1, defect_weight: 3 }

export function weightedEvidence(window, rule, config = {}) {
  let total = 0
  for (const entry of countableWindow(window)) {
    for (const record of entry.data.findings) {
      if (record.rule !== rule) continue
      const key = WEIGHT_KEYS[record.class]
      if (!key) continue
      total += config[key] ?? DEFAULT_WEIGHTS[key]
    }
  }
  return total
}

// The propose bar is weighted, not a raw count: one operator note (weight 3) clears the
// weight, one reviewer finding (weight 1) does not (A7). SEC-R1 adds D7's second
// condition: the evidence must also span the configured number of DISTINCT sessions —
// one bad session cannot legislate. Callers pass `sessions` from
// `distinctEvidenceSessions`; omitting it fails closed (0 < any configured minimum).
export function meetsProposeBar(weighted, config = {}, sessions = 0) {
  const minFindings = config.min_findings_to_propose ?? DEFAULT_MIN_FINDINGS_TO_PROPOSE
  const minSessions = config.min_sessions_to_propose ?? DEFAULT_MIN_SESSIONS_TO_PROPOSE
  return weighted >= minFindings && sessions >= minSessions
}

// A session identity for the D7 bar. The envelope's `run.session` names the session
// explicitly; a writer that omits it falls back to `run.label`, and a file with neither is
// its own session (the file name). Deterministic, and the same identity is used for every
// rule, so evidence cannot be relabelled per rule.
export function distinctEvidenceSessions(window, rule) {
  const sessions = new Set()
  for (const entry of countableWindow(window)) {
    const contributes = (entry.data.findings ?? []).some(
      (record) => record?.rule === rule && WEIGHT_KEYS[record.class] !== undefined,
    )
    if (!contributes) continue
    sessions.add(sessionOf(entry))
  }
  return sessions.size
}

function sessionOf(entry) {
  const run = entry?.data?.run
  if (typeof run?.session === "string" && run.session.trim() !== "") return run.session
  if (typeof run?.label === "string" && run.label.trim() !== "") return run.label
  return entry?.file ?? "unknown"
}

// ---------------------------------------------------------------------------
// the propose bar block (FINAL-R1, objective 3)
//
// One row per rule with any weighted evidence in the countable population: the weighted
// total (D7/A7), the number of distinct sessions that contributed (D7's second condition),
// the configured thresholds, and the eligible verdict — the single number the Refiner
// should act on. `eligible` is `meetsProposeBar`, which fails closed when the session
// count is omitted. The population is only the newest available file's tier (T07 §6, A18,
// FINAL-R2): a rule cited only in an older different-tier file contributes nothing and
// does not even appear — an older tier's finding cannot change eligibility.
export function proposeBar(window, config = {}) {
  const rules = new Set()
  for (const entry of countableWindow(window)) {
    for (const record of entry.data.findings) {
      if (typeof record?.rule === "string" && (record.class === "rule_violation" || WEIGHT_KEYS[record.class] !== undefined)) {
        rules.add(record.rule)
      }
    }
  }
  const rows = [...rules]
    .map((rule) => {
      const weighted = weightedEvidence(window, rule, config)
      const distinctSessions = distinctEvidenceSessions(window, rule)
      return {
        rule,
        weightedEvidence: weighted,
        distinctSessions,
        eligible: meetsProposeBar(weighted, config, distinctSessions),
      }
    })
    .sort((a, b) => b.weightedEvidence - a.weightedEvidence || a.rule.localeCompare(b.rule))
  return {
    min_findings_to_propose: config.min_findings_to_propose ?? DEFAULT_MIN_FINDINGS_TO_PROPOSE,
    min_sessions_to_propose: config.min_sessions_to_propose ?? DEFAULT_MIN_SESSIONS_TO_PROPOSE,
    rules: rows,
  }
}

export function unciteableRatio(window, { root } = {}) {
  let total = 0
  let rejected = 0
  for (const entry of countableWindow(window)) {
    for (const record of entry.data.findings) {
      if (record.class !== "rule_violation" || typeof record.rule !== "string") continue
      total += 1
      if (!resolveRulePointer(record.rule, { root }).ok) rejected += 1
    }
  }
  if (total === 0) return null
  return rejected / total
}

// ---------------------------------------------------------------------------
// the liveness probe (F1, C7/C8)

function resolvedPointerOf(record, { root } = {}) {
  if (record?.class !== "rule_violation" || typeof record.rule !== "string") return null
  const resolved = resolveRulePointer(record.rule, { root })
  if (!resolved.ok) return null
  return `${resolved.file}#${resolved.anchor}`
}

function resolvingPointers(records, { root } = {}) {
  const set = new Set()
  for (const record of records ?? []) {
    const pointer = resolvedPointerOf(record, { root })
    if (pointer) set.add(pointer)
  }
  return set
}

// Of the paid reviewer's rule_violation records, the share the cheap reviewer also cited
// with a RESOLVING pointer — matching by resolved pointer, so a similar-but-different
// anchor never counts. Null when the paid reviewer produced no resolvable citations.
export function citationCompetence(cheap, paid, { root } = {}) {
  const cheapSet = resolvingPointers(cheap, { root })
  const paidResolved = (paid ?? []).filter((record) => record?.class === "rule_violation" && resolvedPointerOf(record, { root }) !== null)
  if (paidResolved.length === 0) return null
  const shared = paidResolved.filter((record) => cheapSet.has(resolvedPointerOf(record, { root }))).length
  return shared / paidResolved.length
}

// How much the cheap reviewer misses: paid records also present in the cheap set, over
// the paid set. Matching is by file:line:class — the same violation at the same place.
export function recallEstimate(cheap, paid, { root } = {}) {
  void root
  const cheapSet = new Set((cheap ?? []).map(recordKey))
  const paidRecords = (paid ?? []).filter((record) => record !== null && typeof record === "object")
  if (paidRecords.length === 0) return null
  const shared = paidRecords.filter((record) => cheapSet.has(recordKey(record))).length
  return shared / paidRecords.length
}

function recordKey(record) {
  return `${record?.file ?? "?"}:${record?.line ?? "?"}:${record?.class ?? "?"}`
}

// ---------------------------------------------------------------------------
// trace recording (T03) — one bounded finding event per --validate invocation

function recordFindingsValidation(root, file, result) {
  const resolved = loadTraceIdentity(root)
  if (!resolved.ok) return // no lifecycle — nothing to join; the diagnostic outcome stands alone
  const parsed = readConfinedJson(root, file)
  const run = parsed?.data?.run
  const outcome = result.valid ? "valid" : result.blocked ? "blocked" : "invalid"
  const emitted = emitTraceEvent(root, {
    trace_id: resolved.identity.traceId,
    run_id: resolved.identity.runId,
    session_id: resolved.identity.sessionId,
    entity: { type: "finding", id: safeTraceId(path.basename(file).replace(/\.json$/i, ""), "finding") },
    parent: { type: "run", id: resolved.identity.runId },
    kind: "validate",
    outcome,
    data: {
      file: file.replace(/\\/g, "/"),
      records: Array.isArray(parsed?.data?.findings) ? parsed.data.findings.length : 0,
      gate_report: typeof run?.gate_report === "string" ? run.gate_report : null,
      gate_source_hash: typeof run?.gate_source_hash === "string" ? run.gate_source_hash : null,
      tier: typeof run?.tier === "string" ? run.tier : null,
      errors: result.valid || result.blocked ? null : (result.errors ?? []).slice(0, 20),
    },
  })
  if (!emitted.ok) console.warn(`[harness:trace] findings event not recorded: ${emitted.reason}`)
}

// ---------------------------------------------------------------------------
// CLI

function validateThresholdsKnobs(root) {
  const thresholds = readJsonIfExists(path.join(root, THRESHOLDS_PATH))
  if (!thresholds || thresholds.learned_rules === null || typeof thresholds.learned_rules !== "object") return { ok: true, errors: [] }
  return validateLearnedRules(thresholds.learned_rules)
}

function readConfinedJson(root, file) {
  const read = safeReadFile(root, file)
  if (!read.ok) return { blocked: true, errors: [read.reason] }
  let data
  try {
    data = JSON.parse(read.text)
  } catch {
    return { blocked: false, errors: [`${file} is not valid JSON`] }
  }
  return { data }
}

function validateFindingsFile(root, file) {
  const parsed = readConfinedJson(root, file)
  if (!("data" in parsed)) return { valid: false, blocked: parsed.blocked, errors: parsed.errors }
  const data = parsed.data
  if (Array.isArray(data.findings)) {
    const errors = []
    const roster = Array.isArray(data.roster) ? data.roster : []
    if (roster.length === 0) {
      errors.push("no reviewer roster — findings: [] without a roster is the rows: [] bug, not an honest zero (review B8)")
    }
    const run = data.run
    if (!run || typeof run !== "object") errors.push("missing run envelope")
    else {
      for (const field of ["label", "tier", "gate_report", "gate_source_hash"]) {
        if (typeof run[field] !== "string" || !run[field].trim()) errors.push(`run.${field} required`)
      }
      if (run.tier !== undefined && !VALID_TIERS.has(String(run.tier).toLowerCase())) {
        errors.push(`run.tier ${JSON.stringify(run.tier)} — expected full, sampling or auto`)
      }
    }
    const manifest = Array.isArray(data.manifest?.lanes) ? data.manifest : null
    if (!manifest && data.findings.length > 0) {
      errors.push("no lane manifest in the envelope — lane/capability/model/changed_lines_in_lane cannot be verified (review B10)")
    }
    for (const [index, record] of data.findings.entries()) {
      const result = validateRecord(record, { root, manifest })
      if (!result.ok) for (const error of result.errors) errors.push(`findings[${index}]: ${error}`)
    }
    return { valid: errors.length === 0, blocked: false, errors }
  }
  const recordResult = validateRecord(data, { root })
  return { valid: recordResult.ok, blocked: false, errors: recordResult.errors }
}

function runCli() {
  const args = process.argv.slice(2)
  const valueOf = (flag, fallback) => {
    const index = args.indexOf(flag)
    return index !== -1 && args[index + 1] ? args[index + 1] : fallback
  }
  const root = path.resolve(valueOf("--root", process.cwd()))
  const json = args.includes("--json")

  // Every invocation range-checks the governing knobs first (T02 S2). A bad knob is a
  // harness blocker — exit 2, never a silent default.
  const knobs = validateThresholdsKnobs(root)
  if (!knobs.ok) {
    for (const error of knobs.errors) console.error(redact(error))
    process.exitCode = 2
    return
  }

  try {
    if (args.includes("--validate")) {
      const file = valueOf("--validate", null)
      if (!file) throw new Error("--validate requires a file argument")
      const result = validateFindingsFile(root, file)
      recordFindingsValidation(root, file, result)
      if (json) {
        console.log(JSON.stringify(result, null, 2))
      } else if (result.valid) {
        console.log(`${file}: valid`)
      } else {
        console.log(`${file}: invalid${result.blocked ? " (script blocker)" : ""}`)
        for (const error of result.errors) console.log(`  - ${redact(error)}`)
      }
      process.exitCode = result.valid ? 0 : result.blocked ? 2 : 1
      return
    }

    if (args.includes("--validate-ledger")) {
      const file = valueOf("--validate-ledger", null)
      if (!file) throw new Error("--validate-ledger requires a file argument")
      const thresholds = readJsonIfExists(path.join(root, THRESHOLDS_PATH))
      const parsed = readConfinedJson(root, file)
      const result = "data" in parsed
        ? validateLedger(parsed.data, { root, config: thresholds?.learned_rules ?? {} })
        : { ok: false, errors: parsed.errors, blocked: parsed.blocked }
      if (json) {
        console.log(JSON.stringify({ valid: result.ok, blocked: result.blocked ?? false, errors: result.errors }, null, 2))
      } else if (result.ok) {
        console.log(`${file}: ledger valid`)
      } else {
        console.log(`${file}: ledger invalid${result.blocked ? " (script blocker)" : ""}`)
        for (const error of result.errors) console.log(`  - ${redact(error)}`)
      }
      process.exitCode = result.ok ? 0 : result.blocked ? 2 : 1
      return
    }

    if (args.includes("--window")) {
      const runs = Number.parseInt(valueOf("--window", "1"), 10)
      if (!Number.isInteger(runs) || runs < 1) throw new Error("--window requires a positive integer")
      const window = readWindow({ root, runs })
      // FINAL-R2: every derived output counts ONLY the newest available file's tier
      // (T07 §6, A18) — the same population the adherence adapter counts. The anchor
      // tier and every excluded file are emitted so a consumer cannot mistake the
      // filtered counts for a full window: an older different-tier finding can never
      // change counts, weights, sessions or eligibility.
      const tier = newestTier(window)
      const counted = countableWindow(window)
      const excluded = window.filter((entry) => !counted.includes(entry))
      // FINAL-R1: the propose bar is computed here, not by the refiner — the refiner is
      // read-only and must not produce its own numbers. The thresholds come from the same
      // guarded file the gate reads; a knobs block was already range-checked above.
      const thresholds = readJsonIfExists(path.join(root, THRESHOLDS_PATH))
      const output = {
        files: window.map((entry) => ({
          file: entry.file,
          ok: entry.ok,
          ...(entry.error ? { error: entry.error } : {}),
          ...(entry.unavailable ? { unavailable: entry.unavailable } : {}),
          ...(entry.data?.run?.tier ? { tier: entry.data.run.tier } : {}),
        })),
        tier,
        crossTierExcluded: {
          count: excluded.length,
          files: excluded.map((entry) => ({ file: entry.file, reason: exclusionReasonOf(entry) })),
          reason: tier
            ? `counted ${counted.length} file(s) at tier ${tier}; ${excluded.length} file(s) excluded — cross-tier comparison refused (T07 §6)`
            : "no countable file records a tier — counts refused rather than guessed; cross-tier comparison cannot be ruled out (T07 §6)",
        },
        byRule: countByRule(window),
        byAgent: countByAgent(window),
        unciteableRatio: unciteableRatio(window, { root }),
        proposeBar: proposeBar(window, thresholds?.learned_rules ?? {}),
      }
      if (json) {
        console.log(JSON.stringify(output, null, 2))
      } else {
        console.log(`tier: ${tier ?? "none — no countable file records a tier (T07 §6)"}`)
        if (output.crossTierExcluded.count > 0) {
          console.log(`cross-tier excluded: ${redact(output.crossTierExcluded.reason)}`)
          for (const file of output.crossTierExcluded.files) {
            console.log(`  - ${redact(file.file)}: ${redact(file.reason)}`)
          }
        }
        for (const entry of output.files) {
          if (!entry.ok) console.log(`  ${entry.file}: ERROR ${redact(entry.error)}`)
          else if (entry.unavailable) console.log(`  ${entry.file}: ${redact(entry.unavailable)}`)
          else console.log(`  ${entry.file}: ok`)
        }
        console.log("byRule:")
        for (const row of output.byRule) console.log(`  ${row.rule}: ${row.count}`)
        console.log("byAgent:")
        for (const row of output.byAgent) console.log(`  ${row.capability}: ${row.count} (${row.models.join(", ")})`)
        console.log(`unciteableRatio: ${output.unciteableRatio === null ? "null (no rule-bearing records)" : output.unciteableRatio.toFixed(4)}`)
        console.log(
          `proposeBar (weight >= ${output.proposeBar.min_findings_to_propose} and sessions >= ${output.proposeBar.min_sessions_to_propose}):`,
        )
        for (const row of output.proposeBar.rules) {
          console.log(`  ${row.rule}: weight ${row.weightedEvidence} over ${row.distinctSessions} session(s) — ${row.eligible ? "ELIGIBLE" : "below bar"}`)
        }
      }
      // The window is an OBSERVATION command: malformed and rosterless files are
      // represented in the output above, so they never turn the exit code red — 0 here,
      // and 2 only from the knob/argv blockers earlier (FINAL-R2).
      process.exitCode = 0
      return
    }

    throw new Error("expected --validate <file>, --validate-ledger <file>, or --window <n>")
  } catch (error) {
    console.error(`harness-findings could not run: ${redact(error.message)}`)
    process.exitCode = 2
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCli()
