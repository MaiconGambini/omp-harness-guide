---
name: harness-session-start
description: "Discover context, instructions, and startup commands. Use when starting a new session or declaring active work. Do NOT use for writing handoffs (use harness-session-handoff)."
---

# Harness Session Start

Run at session start. Sinais de startup ou gate são reportados e nunca abortam o trabalho.

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
7. Run the discovered startup command if safe and present. If it fails, record the error in progress/state and report it as a signal, then continue with the operator's request.
8. Run `git log --oneline -3` when inside a git repo.
9. **Read the quality posture.** `agent-os/quality-thresholds.json` (phase, which metrics are
   blocking) and the newest `docs/harness/quality/*.json`. This is the measured half of the session's
   starting context: it tells the agents what to look at, not whether they may work.
   - **Red posture is reported as a signal on the `Quality:` line as context** (e.g. `Quality: red (regression_suite 1 > 0; sinal, não bloqueia trabalho)`). It is never substituted for the operator's request, and never a reason to abort, refuse exploration, or stop coding.
   - A **stale, missing or `unconfigured`** report is stated as such. Never read silence as green.
   - A non-green gate withholds only delivery claims (confirming completion or readiness for production); it does not stop work.
10. Select exactly one active task if durable feature state exists. If none exists, declare no durable active task.
11. Resolve the session identity from the durable PREVC record. Read the matching validated record with `node ~/.omp/agent/scripts/harness-session-store.mjs --read --root "$PWD" --session-id "$SESSION_ID"`. Create the record from the inspected identity and phase when it is absent.
12. Use that record for PREVC phase, lane, blocker, active-task, and evidence context. `docs/harness/session-handoff.md` remains the handoff authority; prior-session evidence never supplies lifecycle authority.

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
Quality: phase A · gate RED (2026-08-10 local) · regression_suite 1 > 0 (sinal, não bloqueia trabalho)
Quality: unconfigured — no agent-os/quality-thresholds.json. Nothing is measured here; run harness-project-calibration.
```

If the shared file is missing or unreadable, use:

`Global context: unavailable (gap)`

The global context gap is recoverable and visible; reported signals provide diagnostic context while the session proceeds.

## Sinais reportados

These conditions are recorded and reported as signals, never used as hard aborts or excuses to stop work:
- Startup command fails (reported with error message).
- Progress or feature state exists but is unreadable or conflicting.
- More than one task is `in_progress` (reported as diagnostic notice).
- Gate is red, stale, unconfigured, or broken (reported on `Quality:` line).

The session proceeds with the operator's requested objective. Do not assume `init.ps1`, `feature_list.json`, or `.specs/project/STATE.md` exist.

