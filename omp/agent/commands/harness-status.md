---
name: harness-status
description: "Print harness readiness: git, durable PREVC phase, handoff, context, security, score, fallback events, capabilities, red-team."
---

Run `node ~/.omp/agent/scripts/harness-status.mjs` (it needs no args — just run it) and summarize the output as readiness evidence: git state, PREVC phase, handoff presence, context budget, security posture, and the guardrails v2 observability surfaces:

- `score` — aggregate 0-10 from `docs/harness/quality/aggregate.json` (derived, never a gate input).
- `fallbackEvents` — provider-fallback event count + last event from `fallback-events.json`.
- `capabilities` — per-model multimodal summary from `capabilities.json`.
- `redteam` — the newest full gate report's `redteam_quickcheck` row (state + FAIL count).

Each surface degrades to a named `unavailable` marker when its artifact is missing — never invented values.

Read the durable lifecycle directly as well: run `node ~/.omp/agent/scripts/harness-prevc-state.mjs inspect --json` and fold its result into the report. In a project with `agent-os/` or `docs/harness/`:
- state missing, unreadable, or `phase` unknown → **WARN** — name what is absent, never pass it;
- handoff missing when the phase is `awaiting_confirmation` or `complete` → **WARN**;
- a `blocked` phase persists from the previous session (a red gate survives session end with its metric/value/threshold blocker) → **WARN** with the blocker text, until the operator resolves it.

Identify the next best action. Reference `skill://harness-status` for interpretation.
