---
name: planner
description: "Planning pipeline (scheduler): clarify idea, conditional research/prototype, canonical spec/plan/decisions, to-spec then to-tickets. Ends at awaiting_plan_approval."
---

Run the planning pipeline for this objective: $ARGUMENTS

If the objective is empty, ask the operator for it and stop.

Dispatch the `scheduler` agent (via the `task` tool) in its Planning role. Every plan writes the canonical Agent OS artifacts under `agent-os/specs/<YYYY-MM-DD-HHMM-slug>/` before `awaiting_plan_approval`:

- `spec.md` — the canonical PRD: objective, requirements, acceptance criteria. No other file plays that role.
- `plan.md` — approach, file boundaries, lane table, validation, rollback, risks.
- `verification.md` — how each acceptance criterion is proven, with commands.
- `decisions.md` — every resolved decision, including the optional-stage records below.
- `prototype/` — disposable prototypes only, written only when the conditional prototype stage ran.
- `tickets/` — the tracer-bullet lane table. Never created before `spec.md` exists.

`docs/superpowers/plans/` and `writing-plans` are not PREVC planning destinations.

## Size routing

Before planning ceremony, run `node ~/.omp/agent/scripts/harness-size-gate.mjs --objective "$ARGUMENTS" --files <comma-separated-files> --json` (OpenCode:
`node "$env:USERPROFILE\.config\opencode\scripts\harness-size-gate.mjs" --objective "$ARGUMENTS" --files <comma-separated-files> --json`).
For `fast-path` (simple one-file work), execute the objective directly with focused verification; do not dispatch
`scheduler`, open PREVC, or create planning/panel ceremony. For `prevc` (`medium` or `full`), continue the
planner/PREVC pipeline below. The gate result must be rendered in the reply contract.
Upstream routing — resolve the idea before planning:

1. **Clarify.** If the input is an idea rather than an objective, run `skill://brainstorming` first: the idea becomes a goal plus observable acceptance criteria. Never plan against a vague idea.
2. **Research (conditional).** Run `skill://research` ONLY when an external claim (dependency, platform, regulation) changes the requirements. Save primary sources to `agent-os/specs/<slug>/research.md` and record `research: required` in `decisions.md` with a concise result/verdict and the research.md pointer.
3. **Prototype (conditional).** Build a disposable prototype ONLY when a logic/UI question cannot be answered from code or docs. Write it under `agent-os/specs/<slug>/prototype/` — never beside real module/page code. A throwaway branch or worktree requires explicit operator authorization; otherwise the `prototype/` directory is the only allowed location. Record `prototype: required` in `decisions.md` with the question, the verdict, and the artifact pointer.
4. **Decide → to-spec.** Run `skill://to-spec` over the resolved decisions; it writes `spec.md` (the canonical PRD). When research or prototype was skipped, `decisions.md` records the literal lines `research: not-needed` and/or `prototype: not-needed` so the optional stages never vanish silently.
5. **Decompose → to-tickets (only after to-spec).** Run `skill://to-tickets` to break the sharpened plan into tracer-bullet vertical slices under `tickets/`, each declaring its blocking edges. A ticket IS a lane — derive its exact file-ownership set, dependencies, verification command, risk tier, and owning capability. The scheduler may not publish tickets without a `spec.md`.

Output the reviewable plan (objective, scope, non-goals + assumptions, acceptance criteria, ownership/risks, risk class (low | medium | high | untrusted), validation, rollback, and the lane table with blocking edges). Stop at conversational `awaiting_plan_approval`; do not edit before approval. This feeds `/prevc run` or an autonomous named-plan execution. See `skill://harness-omp-parallel` for how the lanes execute in parallel.
