---
name: harness-termination-check
description: Generic three-layer Done check before claiming completion or setting any task to passing. Uses discovered verification and durable evidence.
---

# Harness Termination Check

Run before saying "done", "complete", or setting any durable status to `passing`.

## Layer 1 — Static

- [ ] Static checks from sprint contract or discovered stack pass.
- [ ] Lint/typecheck commands are either run or explicitly not applicable.
- [ ] No new warnings vs baseline.
- [ ] `harness-quality-gate` ran at the mode this position requires and exited 0 — or every breach
      is in `observe` mode and named in the evidence. A missing, stale or `unconfigured` report is
      **not** a pass; record it as unverified.
- [ ] Every `unavailable` metric is listed as a gap, not treated as green.

## Layer 2 — Runtime Behavior

- [ ] Acceptance criteria from sprint contract are observable, not assumed.
- [ ] Commands were run and output recorded, not inferred or remembered.
- [ ] Regression checks for previously passing work were run or scoped out with reason.

## Layer 3 — System Confirmation

- [ ] Startup command from `harness-startup-path` exits 0 or skipped reason is recorded.
- [ ] Feature state/progress state answer what changed for a new session.
- [ ] Evidence contains actual command output, not a description.

## Fail Protocol

If any layer fails:

1. Record exact failure: command, exit code, and output. For a metric, record **the metric name,
   its value, and its threshold** — a description is not evidence, a number is.
2. Set task to `blocked` in the available feature state with reason.
3. Document in the available progress file Blockers.
4. Do not claim done. Do not write completed handoff.
