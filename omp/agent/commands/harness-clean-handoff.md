---
name: harness-clean-handoff
description: "Close a session with evidence, progress state, handoff, discovered verification, and git status."
---

Read the durable lifecycle first: `node ~/.omp/agent/scripts/harness-prevc-state.mjs inspect --json`. A missing `docs/harness/session-handoff.md` is a **WARN** when the phase is `awaiting_confirmation` or `complete`; a `blocked` phase persists with its blocker and must be carried into the handoff. The handoff must be a regular in-repo file (not a directory or symlink) written AFTER the current `awaiting_confirmation` cycle — a stale handoff from a previous run refuses `complete` and must be rewritten. A handoff report that lacks the state phase, the blocker (when set), and the next action is not complete.

Discover the verification command (via `skill://harness-startup-path`); do not assume `init.ps1` exists.

When invoked directly, return a handoff report only — do not mark feature state, infer confirmation, or claim completion. Only PREVC writes lifecycle transitions after the operator outcome.

- Resolve `SESSION_ID` from the durable PREVC record and read the validated session record:
  `node ~/.omp/agent/scripts/harness-session-store.mjs --read --root "$PWD" --session-id "$SESSION_ID"`.
- Update the record through the store with the current phase, blocker, verified evidence, and next action, using its returned revision as `--expected-revision`. A revision mismatch is a conflict and must be reported, not overwritten.
- Project the handoff only after the record write succeeds:
  `node ~/.omp/agent/scripts/harness-session-store.mjs --project-handoff --root "$PWD" --session-id "$SESSION_ID"`.
  The projection is written by the harness from the validated record. It is never rendered from ai-memory, and handoff delivery is out of scope.
