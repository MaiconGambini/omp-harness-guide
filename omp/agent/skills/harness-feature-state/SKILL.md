---
name: harness-feature-state
description: Normalize feature state across feature_list.json and Markdown task files. Enforce WIP=1, evidence for passing, and blocker reasons.
---

# Harness Feature State

Use to create, update, or audit durable task state.

## State Priority

1. `feature_list.json`
2. `agent-os/specs/*/tasks.md` and `agent-os/specs/*/tickets/` — the v1.1 planning
   pipeline stores tracer-bullet tickets here; each ticket is a lane with a
   `Blocked by:` edge and its own status.
3. `.specs/features/*/tasks.md`
4. Create `feature_list.json` only after user approval.

## Required Schema

Every feature must have all fields:

```json
{
  "id": "feat-001",
  "priority": 1,
  "area": "harness",
  "title": "Short feature name",
  "user_visible_behavior": "What should happen when this works, from agent/user perspective",
  "dependencies": [],
  "status": "not_started",
  "verification": "Command or steps that prove it works",
  "evidence": "Actual output captured after passing verification",
  "notes": ""
}
```

The shipped `templates/feature_list.json` carries this shape as a filled example — the file an
agent opens first must teach the schema, not be an empty array.

## Status Rules

- `not_started` — not yet worked on
- `in_progress` — exactly ONE feature at a time. Two `in_progress` = harness violation.
- `blocked` — requires non-empty `evidence` field with the **failing metric, its value, and its
  threshold** — not "tests failed".
- `passing` — requires non-empty `evidence` that includes **the gate report path and the metric
  line** for that change, not a description of a run.

## Why evidence must cite the report

A `passing` written as prose is undecidable six sessions later. A report path plus a metric line
stays checkable, and `git log --grep=Quality-Gate` corroborates it independently. That is the whole
difference between durable state and a note someone left.

Good: `docs/harness/quality/2026-08-10T18-33-full-scheduler.md — mutation 69.6% >= 69.5%, regression green, 1 unavailable (boundaries)`

Not evidence: `tests pass, coverage looks fine`

## Audit Checklist

Run before any Execute phase:

- [ ] All features have all required fields (no missing keys)
- [ ] Exactly one feature/task is `in_progress` across JSON and Markdown sources
- [ ] All `passing` features have non-empty `evidence` **citing a gate report path and a metric line**
- [ ] All `blocked` features have non-empty `evidence` (the failing metric with value and threshold)
- [ ] `dependencies` are respected — no `in_progress` feature has unresolved deps

## Markdown Task Support

For `.specs/features/*/tasks.md` and `agent-os/specs/*/tasks.md`, detect task rows or checklists with statuses such as `not_started`, `in_progress`, `blocked`, and `passing`. For `agent-os/specs/*/tickets/*.md`, treat each ticket file as a task: read its `Status:` and `Blocked by:` lines; a ticket whose blockers are all done and that is not yet done is on the frontier.

If Markdown format is ambiguous, report the ambiguity and propose normalizing to `feature_list.json`. Do not rewrite without approval.

## Add Feature

When adding a new feature:
1. Assign next `id` in sequence.
2. Set `priority` — lower number = higher priority.
3. Set `area` — matches product/system area (e.g., `harness`, `backend`, `frontend`).
4. Write `user_visible_behavior` as a sentence: "When X, the agent/user sees Y."
5. Write `verification` as a runnable command or observable check.
6. Leave `evidence` empty until verification actually runs.
7. Set `status` to `not_started`.
8. Set `dependencies` to IDs of features that must be `passing` first.

## Rules

- Never mark `passing` without actual evidence.
- Never mark `blocked` without an exact reason.
- Two active tasks is a WIP violation; resolve to WIP=1 before Execute.
