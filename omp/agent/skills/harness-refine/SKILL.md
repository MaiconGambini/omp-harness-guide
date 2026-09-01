---
name: harness-refine
description: The Refine phase of the continual harness — dispatch the read-only refiner over the trajectory window, route each proposal by blast radius (rule-verifier or operator gate), and record operator notes. Use after Judge, before awaiting_confirmation.
---

# Harness Refine

The procedure lives here; the reasoning lives in `docs/harness/continual-harness.md`; the governing
numbers live in `agent-os/quality-thresholds.json#learned_rules`; every outcome is recorded in
`docs/harness/refine-log.md`.

Refine runs **after Judge and before `awaiting_confirmation`**, over the trajectory window. It writes
nothing and has **no vote** in the verdict — the Judge's dispatch payload must contain no Refine output.
A rule learned by machine influences the **next** run's prompts, never this run's approval.

## The scheduler supplies the inputs

The refiner is read-only by permission, so **the scheduler runs the counting script and passes the
numbers in** (`bash: deny` is a permission, not a prompt rule). Dispatch the `refiner` subagent with:

- the findings window — the newest `docs/harness/findings/*.json` files (run `harness-findings.mjs
  --window <n> --json` and pass the counts; the script resolves every pointer and does all arithmetic)
- the **per-rule `proposeBar` block** from that same `--json` output: for each rule, the weighted
  evidence (`weightedEvidence`), the number of distinct sessions it spans (`distinctSessions`), the
  configured thresholds (`min_findings_to_propose`, `min_sessions_to_propose`), and the computed
  `eligible` verdict. **`eligible: true` is the propose bar, already applied** — weighted bar AND
  distinct-session bar both met. Propose rules whose block says eligible; everything else stays a
  candidate. Never recompute the bar from the raw counts: the script is the only arithmetic, and the
  refiner must not produce its own numbers
- the counts are already **tier-scoped** — `--window` counts only the newest available file's tier and
  emits `tier` + `crossTierExcluded` (T07 §6, A18). Treat the passed numbers as the whole population;
  never re-read raw findings files to add evidence from another tier (FINAL-R2)
- the newest gate report and its `sourceHash`
- `agent-os/learned-rules.json` (the ledger: rules, conflicts, retired)
- the parsed `Adherence:` history from the newest commit trailer
- the ledger-adjacent context the refiner needs to draft (the scheduler passes it in; the refiner never
  reaches outside the repo to get it)

## No new evidence means no run

If there are no findings since the last `refine-log.md` entry — or no findings file at all for this run —
**say "no new evidence" and stop.** Propose nothing. Tier `auto` runs no reviewer, so it produces no
findings: say that. **Absence is a gap to name, never a clean run.**

## Failure signatures

Translated from the paper's four passes. One signature may be live in more than one component; each
proposal carries its component and the CRUD verb.

| Signature | Detection | CRUD |
|---|---|---|
| recurring violation | same `rule` reaching the weighted bar across the session minimum | **Update** — the rule is ambiguous, not unknown |
| uncitable violation | `blind_spot` recurring where no rule exists | **Create** a rule |
| tool-call failure loop | the same command failing repeatedly in a session | **Create** a skill, or fix the startup path |
| stalled objective | a feature `in_progress` across several handoffs, evidence unchanged | **Create** a decomposition, or mark it blocked |
| unmeasured escape | a `docs/review.md` entry with a metric that could have caught it | **Create** a gate-metric proposal — **propose only; never append to `review.md`** |
| dead rule | an active rule with no citation inside its window | **Delete** — retire it |

The last row is the only mechanism in the system that removes something. Everything else appends.

### The `blind_spot` row is the highest-risk path in the design

It requires **no rule pointer**, so the pointer-resolution defence does not apply on the one path that
authors *new* rule text. Attacker-controlled content in a diff can reach it. The mitigations are
**elsewhere — do not remove any of them thinking it is redundant**:

- `--validate-ledger` on `text` (T01): single-line, no control characters, no fences, no headings, within
  `rule_text_max_chars`
- the untrusted-data fence at injection (T06): rules are data in the lane's prompt, never instructions
- `redact()` on every diff-originating field before it is written
- the operator (or the rule-verifier, for prose-`observe`) seeing the literal text before it lands

## The proposal contract

- **At most one proposal per component per run** (`max_proposals_per_run_per_component`). Rank
  candidates by **weighted recurrence × severity**; everything else stays a candidate. The bar is
  weighted (`min_findings_to_propose` over `min_sessions_to_propose`): one operator note clears it alone;
  one reviewer finding does not.
- Every proposal carries:
  - its **source findings with `file:line`** — the findings, never the diff, are the citation
  - a **conflict check**: a candidate contradicting an active rule opens a `conflicts` entry for the
    operator; it never becomes a second rule
  - **`refuted_by`** — what would prove the rule wrong; required, the operator rejects on that alone
  - the **proposed enforcement level** (`prose | lint | test | gate_metric`)
  - for a **rewrite** (a rule past `rewrite_after_violations_after`): a concrete right/wrong example from
    this codebase, **in its own quoted `example` field** — never inline in `text`, which is single-line
    and fenced-content-free
  - a cap-forced retirement alongside, when the target is full (`max_active_rules_per_target`): retire
    the weakest — fewest citations, then oldest, then already covered by a linter — and name the
    candidate that displaced it (`displaced_by`)
- **Write nothing.** Never propose an edit to `~/.config/opencode/**`, `opencode.jsonc`, or
  `scripts/harness-*.mjs`, and never propose a rule whose `target` is outside `targets_allowed`
  (`agent-os/standards/` only — `AGENTS.md` belongs to `harness-project-calibration`).
- A rejected proposal with a recorded reason is not re-proposed on evidence the reason already covers;
  the reason binds future runs.

## Routing by blast radius (D21)

For each proposal, split by what it can do, **not by which model wrote it**:

- **`enforcement: prose` AND target is not a `high_risk_path`** — dispatch the **`rule-verifier`**
  (distinct from the refiner — the drafter does not verify its own draft) to **REFUTE** the candidate
  against `agent-os/standards/` and the diff: contradiction, duplication, intent mismatch.
  - If it **cannot refute**: the proposal is **auto-approved**. The scheduler writes it in the
    post-confirmation step below with no operator stop, and it is logged to `refine-log.md` as
    `AUTO_ACTIVATED` with the verifier's report (`provenance.verifier_report` is required when
    `approved_by: "rule-verifier"`).
  - If it **refutes**: the proposal returns to `candidate`, nothing is written, and the refutation is
    recorded (`REFUTED`) — it binds future proposals like an operator rejection.
- **`enforcement: lint | test | gate_metric` OR target is a `high_risk_path`** — present inside
  `awaiting_confirmation` as a **separately-rejectable item**, rendering the **LITERAL text to be
  written**, the target file and anchor, source findings with `file:line`, and `refuted_by`. An operator
  cannot be said to have approved text they were never shown. `confirmo` applies code and proposal;
  `confirmo, sem a regra` applies the code and defers the proposal to candidate.
- The `auto_activate_prose_observe` knob gates the auto branch; when it is off, prose candidates route to
  the operator like every other proposal. **The template ships the knob `false` by default**: a project
  opts in deliberately (dated decision in `quality-decisions.md`) after live acceptance C16 has run and
  OpenCode has restarted so the `rule-verifier` permission block is live. Until then the operator gate
  covers every proposal.
- A verifier approval is **not** refused because the target lives under `agent-os/standards/` — that is
  the rulebook's storage path, and its high-risk status is the next-run retroactive veto (tier `full`),
  not a pre-commit block (D21, FINAL-R1). Only a target matching an effect-level high-risk path outside
  the storage scope keeps the pre-commit operator gate.

**The human read is not lost, only the pre-commit block is.** `learned-rules.json` and `standards/**`
are `high_risk_paths`, so the *next* run's gate forces tier `full` and a human read — a retroactive veto
window, not a pre-commit stop.

## Post-confirmation write — owned by the Confirm phase

Prose lands **after** the code commit and its trailer, as a **separate rulebook commit**. The Confirm
phase owns this write: after the operator confirms at `awaiting_confirmation`, the **scheduler**
applies the approved prose (a separate rulebook commit) **before** handoff. Never earlier —
`agent-os/standards/`, `docs/review.md` and `learned-rules.json` are inside `sourceHash`, so writing
them before the trailer stales the report and `ship-evidence` refuses. Do not "fix" that by widening
`GATE_ARTIFACTS` — the rulebook must stay inside the source hash.

Record **every** outcome in `docs/harness/refine-log.md`, including rejections with the operator's
reason, which binds future proposals.

## Operator notes — `/refine --note`

`--note "<what I fixed by hand>"` records an **operator note** as a findings record of class
`operator_note`. The operator's own words are not a model's guess at them, so one clears the propose bar
alone — arithmetic (`operator_note_weight`), not a special case. The scheduler writes it through the
findings write-once path. An explicit one-liner beats any heuristic: only the scheduler commits, so
"operator-authored" is not derivable from git.
