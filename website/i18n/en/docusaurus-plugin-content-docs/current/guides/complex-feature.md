---
sidebar_position: 2
---

# Complex Feature

For multi-component tasks, frontend + backend, or with significant
ambiguity.

## When to use the full pipeline

- Multi-component prompt (for example, frontend and backend).
- Ambiguity in the requirements.
- More than 3 files expected.

## Example

**Prompt:** `Full-text search on products with filters by category and price,
in the backend and frontend.`

**Flow:**

1. `/harness-session-start`

2. `/prevc <objective>` with the full pipeline
   - `/planner` clarifies, then (conditionally) researches and prototypes,
     then writes `spec.md`, `plan.md`, `verification.md`, `decisions.md`,
     and `tickets/`.
   - The plan stops at `awaiting_plan_approval`.

3. `/harness-wip-control`
   - Decomposes into subtasks (feat-020 to feat-025).
   - Marks feat-020 as `in_progress`. Rest: `not_started`.

4. `/harness-role-separation`
   - Planner defines scope, AC and verification plan in the sprint contract.
   - Generator iterates over the subtasks.
   - Evaluator applies a rubric.

5. PREVC iterates: Execute -> Validate -> Judge -> Refine.

6. Confirm after all subtasks pass.

7. Handoff records the `passing` features with evidence and the files
   touched.

**Time:** ~30-45 minutes.

## The sprint contract

For complex features, the sprint contract is filled in BEFORE Execute:

- **Scope In** — what will be done.
- **Scope Out** — what will NOT be done.
- **AC** — observable acceptance criteria.
- **Verification Plan** — commands and success conditions for each check.

Adjacent work discovered during execution becomes a next task, not a
silent extension of the active task.
