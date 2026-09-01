---
name: fallback
description: "Record, read, or prune provider-fallback events (scheduler-level bounded retry log)."
---

Run `node ~/.omp/agent/scripts/harness-fallback-log.mjs` (OpenCode:
`node "$env:USERPROFILE\.config\opencode\scripts\harness-fallback-log.mjs"`).

- `--record '<json>'` — append a fallback event `{ts?, lane, from_model, to_model,
  reason, task_id, alert?}` to `docs/harness/quality/fallback-events.json`. Malformed
  events are refused with a non-zero exit. The scheduler records ONE re-dispatch per
  lane on the alternate allowed model; orchestrator (scheduler-equivalent) failures are recorded with
  `alert: true` and never auto-retried.
- `--read` (default) — print the total and the 20 most recent events.
- `--prune` — drop events older than 90 days.

The log is data, not policy: retry decisions live in the scheduler contract.
