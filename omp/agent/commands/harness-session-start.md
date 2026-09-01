---
name: harness-session-start
description: "Start a session: discover instructions, progress/feature state, startup path, WIP, and declare active work."
---

Read `~/.omp/agent/docs/context.md` before invoking `skill://harness-session-start`; use only runtime-relevant sections. If it is unavailable, report `Global context: unavailable (gap)` and continue without inventing content. Then execute `skill://harness-session-start` now as a direct routine operation, not PREVC work. Do NOT use the `goal` tool.

Steps:
- Finish with the canonical status lines in this order, before the active task line: `Global context: loaded from ~/.omp/agent/docs/context.md` or `Global context: unavailable (gap)`, then `Active task: ...`, then the existing `Quality:` line.
- Read the durable PREVC lifecycle: run `node ~/.omp/agent/scripts/harness-prevc-state.mjs inspect --json`. In a project with `agent-os/` or `docs/harness/`, state that is missing, unreadable, or in an unknown phase is a WARN (name it, never pass it); a `blocked` phase with its blocker text persists from the previous session and stays WARN until the operator resolves it. A missing `docs/harness/session-handoff.md` is a WARN when the phase is `awaiting_confirmation` or `complete`.
- Locate feature state and active plans from `feature_list.json`, `agent-os/specs/*/` (the newest spec's `tasks.md` and `tickets/` — tracer-bullet tickets = lanes live there; read the active spec so the session sees the plan), or `.specs/features/*/tasks.md`.
- Read `docs/harness/session-handoff.md` if present.
- Discover the startup command via `skill://harness-startup-path` and run it if safe. If `scripts/harness-briefing.mjs` exists, run `node scripts/harness-briefing.mjs` to load a small path-scoped, sourceHash-stamped briefing instead of re-reading every state file; treat a stale or unavailable briefing as a gap to name, never a pass.
- Run `git log --oneline -3` in a git repo.
- Enforce WIP=1 with the `todo` tool when durable state exists: select the single active task and declare it as — `Active task: [feat-id or session-only] — [title]. AC: [observable criteria].`

If startup fails, record the exact error in the progress file when available and stop. Do not assume `init.ps1` or current repo paths.
