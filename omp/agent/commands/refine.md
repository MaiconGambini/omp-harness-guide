---
name: refine
description: "Refine phase: dispatch the read-only refiner over the trajectory/findings window, route proposals by blast radius; or record an operator note with --note."
---

Execute `skill://harness-refine`.

With `--note "<what I fixed by hand>"`: record it as a findings record of class `operator_note` (weighted `operator_note_weight` from `agent-os/quality-thresholds.json#learned_rules`) through the scheduler's write-once findings path, then stop — one operator note clears the propose bar alone.

Without `--note`: run the Refine phase after Judge. Gather the findings window with `node ~/.omp/agent/scripts/harness-findings.mjs --window --json`, plus the newest gate report, `agent-os/learned-rules.json`, the parsed Adherence history, and counts from `node ~/.omp/agent/scripts/harness-findings.mjs --json`. Dispatch the `refiner` agent (read-only) via the `task` tool over that material; it returns at most one proposal per component and writes nothing. Route `enforcement == prose` and non-high-risk targets to the `rule-verifier` agent (via `task`) to attempt refutation.

Never propose an edit to `~/.config/opencode/**`, `~/.omp/agent/**`, or the harness scripts. Proposals target the PROJECT's `agent-os/standards/` and nothing outside `targets_allowed`.
