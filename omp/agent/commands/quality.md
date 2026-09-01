---
name: quality
description: "Measured quality gate + risk router: metric table, review tier, exit code."
---

Run `node ~/.omp/agent/scripts/harness-quality-gate.mjs --mode $ARGUMENTS` (default `--mode local`; use `--mode full` before a commit), then `node ~/.omp/agent/scripts/harness-risk-router.mjs`. Both scripts read `agent-os/quality-thresholds.json` from the project cwd.

Print both: the metric table and the tier with its reason.

Follow `skill://harness-quality-gate` for how to react:
- Exit 1 = fix the metric, never relax the threshold.
- Exit 2 = a harness blocker, not a code failure.
- Name every `unavailable` metric as a gap — a green exit code over a handful of measured rows is not evidence.
- A missing, stale, or unconfigured report is not a pass and routes to tier `full`.

For large suites, shard tests across parallel `test-runner` subagents (one `task` batch, split by test file/dir/tag) and reconcile before reading coverage — see `skill://harness-omp-parallel`. Do not assume repository paths or stack.
