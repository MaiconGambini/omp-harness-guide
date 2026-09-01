---
name: score
description: "Derive and persist the aggregate quality score (0-10) from the newest gate reports."
---

Run `node ~/.omp/agent/scripts/harness-score.mjs` (OpenCode: `node "$env:USERPROFILE\.config\opencode\scripts\harness-score.mjs"`).

It reads the ≤ 30 newest full gate reports under `docs/harness/quality/`, derives the aggregate
score from the newest report (green blocking metrics plus the pass ratio of all measured rows;
unavailable metrics remain in the denominator and are named as gaps; sparse reports cannot score
10; a red blocking metric caps at 4; nonzero security findings cap at 2), and persists
`docs/harness/quality/aggregate.json` with append-only history (30 entries, oldest dropped).

The aggregate is derived observability only — it never feeds thresholds, the router, or any
gate input. Missing reports are a named gap (exit 2), never a zero.
