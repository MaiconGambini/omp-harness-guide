---
name: harness-clean-handoff
description: "Close a session with evidence, progress state, handoff, discovered verification, and git status."
---

Read the durable lifecycle first: `node ~/.omp/agent/scripts/harness-prevc-state.mjs inspect --json`. A missing `docs/harness/session-handoff.md` is a **WARN** when the phase is `awaiting_confirmation` or `complete`; a `blocked` phase persists with its blocker and must be carried into the handoff. The handoff must be a regular in-repo file (not a directory or symlink) written AFTER the current `awaiting_confirmation` cycle — a stale handoff from a previous run refuses `complete` and must be rewritten. A handoff report that lacks the state phase, the blocker (when set), and the next action is not complete.

Discover the verification command (via `skill://harness-startup-path`); do not assume `init.ps1` exists.

When invoked directly, return a handoff report only — do not mark feature state, infer confirmation, or claim completion. Only PREVC writes lifecycle transitions after the operator outcome.

Discover the verification command (via `skill://harness-startup-path`); do not assume `init.ps1` exists.

When invoked directly, return a handoff report only — do not mark feature state, infer confirmation, or claim completion. Only PREVC writes lifecycle transitions after the operator outcome.
