---
name: harness-quality-gate
description: Run the measured quality gate and the risk router, react to the verdict, and write back what the numbers taught. Use before returning a lane, before a commit, and whenever review depth must be decided. Per-change and binary — for a milestone scorecard use harness-quality-snapshot.
---

# Harness Quality Gate

The numbers live in `scripts/harness-quality-gate.mjs`. The reasoning lives in
`docs/harness/measured-gates.md`. **This skill is only the procedure** — when to run it, how to
react, and what may be written back.

## Procedure

1. **Read** `agent-os/quality-thresholds.json`. Missing? Propose bootstrapping it at **Phase A**
   (everything `observe` except `regression_suite`) and continue. Never block a project that has
   never measured itself — but never call it green either (step 4).
2. **Run the gate** at the mode your position demands:
   - inside an implementation lane → `--mode local --label <lane-id>`
   - scheduler, before the single commit → `--mode full --label scheduler`
   Use the absolute global invocation from `docs/harness/measured-gates.md`.
3. **Run the router** (`harness-risk-router`). Report tier and numbers *together* — they are one
   verdict, and the tier is what decides how much of the diff a human reads.
4. **React by exit code:**

   | Exit | Meaning | What to do |
   |---|---|---|
   | 0 | pass, or breaches only in `observe` | proceed; name any `unavailable` metric as a gap |
   | 1 | a blocking metric is red, or a threshold was loosened with no recorded reason | fix the metric. **Never relax the threshold** — that path runs through `quality-decisions.md` with an operator reason |
   | 2 | the gate itself could not run | report a **harness blocker**. Infer nothing about the code; a broken gate is not failing code |

   And the rule that outranks all of them: **no report is not a green report.** Missing, stale,
   `unconfigured` or exit-2 routes to tier `full` and satisfies no approval input.

## Write-back — Mensurar → Escrever → Automatização

Only after a run is confirmed, and **capped at one proposal per run**:

- **Baselines** are already written by the gate — and only by the scheduler's `full` run, only on
  a passing run, and only in the improving direction for ratchet metrics. Lanes never write them.
- **Threshold ratchet:** if a metric beat its threshold on 3 consecutive runs, propose raising the
  threshold to the lowest of those three. A proposal, not an edit — the gate never tightens its own
  bar on its own authority, and it never loosens one at all.
- **Learned rules:** rulebook edits are the Refine loop's lane, not this skill's. A recurring
  violation becomes a rule in `agent-os/learned-rules.json` through the Refine phase
  (`skills/harness-refine/SKILL.md`) — this skill never proposes into `agent-os/standards/*.md`
  or `AGENTS.md`. See the seam below.
- **Blind spots:** when a defect escaped the gate and a human caught it, append it to
  `docs/review.md`'s escaped-defect log with the metric that should have caught it. This is the
  loop's real payoff — every miss permanently redirects human attention. (Kept: the escaped-defect
  write-back is a different concern and a different file from the rulebook.)

Stop there. A write-back that edits several files per run turns documentation into changelog noise,
and the next agent stops reading it. One proposal, or none.

## The ownership seam — one writer per artifact

Per-project derivation is split with `harness-project-calibration`; this table is the single
source of truth for who writes what:

| Artifact | Owner |
|---|---|
| `agent-os/quality-thresholds.json` | `harness-project-calibration` |
| `AGENTS.md` | `harness-project-calibration` |
| `agent-os/learned-rules.json` | the Refine loop |
| `agent-os/standards/*.md` | the Refine loop |
| `docs/review.md` | the gate's escaped-defect write-back |

Two consequences follow. **A learned rule may never target `AGENTS.md`** — the ledger's
`targets_allowed` enforces it, and that removes the second write path into the entry point.
**Adherence thresholds are calibration's**, set from stage-1 baselines like every other threshold:
the Refine loop proposes rules, never thresholds.

## Phase discipline

Advance `phase` only on the operator's word:

- **A — observe.** Everything reports, nothing blocks (except `regression_suite`). Collect
  baselines from real work.
- **B — block the easy tier.** Thresholds set *from Phase A baselines*, local-speed metrics
  `blocking`, `auto` tier enabled. Mutation still observing.
- **C — full gate.** Mutation blocking on a ratchet; write-back and ratchet proposals live.

Set every threshold from measured baselines, never from an aspiration. A new metric enters at
`observe` and stays there until it agrees with itself across two independent runs — a mis-set
environment once inflated a real project's mutation score by 7 points, invisible in the number
itself.

## Relationship to `harness-quality-snapshot`

**This skill is per-change and binary. The snapshot is per-milestone and qualitative.** They do not
compete: the snapshot's Build health, Test coverage and Architecture boundaries rows now cite the
latest gate report as their evidence instead of re-deriving anything.

## Rules

- Never restate a threshold. Cite `agent-os/quality-thresholds.json`.
- `unavailable` is a named gap — not a pass, not a failure.
- Report the numbers even when they are green. A verdict with no table is not evidence.
- Lanes write lane-labelled reports and never touch the thresholds file (one writer per file).
