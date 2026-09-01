---
name: harness-continuity
description: Multi-session state management with WIP=1 across JSON or Markdown task state and clean-state checkpoints before commits or handoffs.
---

# Harness Continuity

Use when work spans sessions or a task is blocked mid-way.

## One-Task-At-A-Time Rule

1. Locate feature state: `feature_list.json`, `.specs/features/*/tasks.md`, or session todo.
2. Pick one eligible `not_started` task or continue the only `in_progress` task.
3. Check dependencies when the state format supports them.
4. Implement → verify with `harness-termination-check` → update status with evidence → handoff.

## State Transitions

```text
not_started → in_progress → passing
                          ↘ blocked  (requires exact blocker reason)
```

Only one task may be `in_progress` at any time.

## Clean-State Checkpoint

- [ ] Startup command from `harness-startup-path` passes or skipped reason is recorded.
- [ ] Active task has observable evidence or exact blocker reason.
- [ ] `git diff --name-only` shows only files relevant to active task.
- [ ] Progress file is updated: `.specs/project/STATE.md`, `docs/harness/progress.md`, or `agent-progress.md`.
- [ ] Handoff is filled if session is ending.

## Blocked Protocol

1. Set status to `blocked` in available state.
2. Record exact blocker in evidence or blocker field.
3. Update available progress file Blockers.
4. Do not leave two tasks `in_progress`.
