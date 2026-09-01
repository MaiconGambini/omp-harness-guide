---
name: harness-session-start
description: Generic harness session start. Use at session start to discover instructions, state, task, startup command, and declare active work without repo-specific assumptions.
---

# Harness Session Start

Run at session start. Stop at first hard failure.

## Startup Sequence

1. Read the global harness context when present:
   - OpenCode: `~/.config/opencode/docs/context.md`
   - Oh My Pi: `~/.omp/agent/docs/context.md`
   Read only the runtime-relevant sections. If neither file is readable, state `Global context: unavailable` and continue; this is a named gap, not a silent pass.
2. Read root instructions if present: `AGENTS.md`, `CLAUDE.md`, then `README.md`.
3. Locate progress state in priority order:
   - `.specs/project/STATE.md`
   - `docs/harness/progress.md`
   - `agent-progress.md`
   - none → recommend `/harness-init`.
4. Locate feature state and active plans, in priority order:
   - `feature_list.json`
   - `agent-os/specs/*/` — the newest spec's `spec.md`, `tasks.md`, and `tickets/`.
     The v1.1 planning pipeline stores tracer-bullet tickets (= lanes) here; if `tickets/00-map.md` exists it is the wayfinder map. Read the active spec so the session actually sees the plan and its open tickets.
   - `.specs/features/*/tasks.md`
   - none → use session todo only and recommend state creation.
5. Read handoff if present: `docs/harness/session-handoff.md`.
6. Locate startup command with `harness-startup-path`:
   - `init.ps1`, `init.sh`, `make check`, package script, or documented command.
7. Run the discovered startup command if safe and present. If it fails, record exact error in the progress file when one exists, then stop.
8. Run `git log --oneline -3` when inside a git repo.
9. **Read the quality posture.** `agent-os/quality-thresholds.json` (phase, which metrics are
   blocking) and the newest `docs/harness/quality/*.json`. This is the measured half of the session's
   starting context and the harness was blind to it before v1.2 — a session that starts new feature
   work on top of a red gate is how the red becomes permanent.
   - **Red posture is stated first, and becomes the active task** unless the operator overrides.
   - A **stale, missing or `unconfigured`** report is stated as such. Never read silence as green.
   - A broken gate (exit 2) is a harness blocker to report, **not** an abort condition. The session
     still starts.
10. Select exactly one active task if durable feature state exists. If none exists, declare no durable active task.

## Output

State exactly:

```
Global context: loaded from ~/.config/opencode/docs/context.md or ~/.omp/agent/docs/context.md | unavailable (gap)
Active task: [feat-id or session-only] — [title]. AC: [observable criteria].
Quality: phase [A|B|C] · gate [green|RED|stale|unconfigured] ([date] [mode]) · [key metric vs bar] · [N] unavailable
```

If no durable task exists, state:

`Active task: session-only — [objective]. AC: [observable criteria]. Recommended: run /harness-init to create state.`
(the `Quality:` line is still required)

Examples:

```
Global context: loaded from ~/.config/opencode/docs/context.md
Quality: phase B · gate green (2026-08-10 full) · mutation 69.6% >= 69.5% · 1 unavailable (boundaries)
Quality: phase A · gate RED (2026-08-10 local) · regression_suite 2 failing · active task is now this
Quality: unconfigured — no agent-os/quality-thresholds.json. Nothing is measured here; run harness-project-calibration.
```

If the shared file is missing or unreadable, use:

`Global context: unavailable (gap)`

The global context gap is recoverable and visible; existing project state/startup failure rules remain hard failures.

## Abort Conditions

- Startup command fails.
- Progress or feature state exists but is unreadable.
- More than one task is `in_progress`.

Do not assume `init.ps1`, `feature_list.json`, or `.specs/project/STATE.md` exist.

