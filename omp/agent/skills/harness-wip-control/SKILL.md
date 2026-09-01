---
name: harness-wip-control
description: Decompose broad requests into WIP=1 atomic units before any execution. One active task at a time.
---

# Harness WIP Control

Invoke before planning any broad request. Before writing any code.

## When to Use

When given: "add X", "refactor Y", "improve Z", or any multi-step request.
Before entering Execute phase. Before opening any file to edit.

## Decomposition Steps

1. Restate the broad request exactly as received.
2. List all implied sub-tasks.
3. Order by dependency.
4. Mark exactly ONE as `in_progress` in `feature_list.json`. All others → `not_started`.
5. Define observable acceptance criteria — runnable commands, not descriptions.
6. Record explicit non-goals: what will NOT be done this session.

## WIP=1 Contract

- Work discovered during execution → add to `feature_list.json` as `not_started`. Do not start it.
- Active task expands in scope → stop, redecompose, get approval before continuing.
- Adjacent improvements → pending. Not this session.

## Output

```
Active: [feat-id] [title]
AC: [observable, runnable criteria]
Excluded this session: [explicit list]
Pending: [other tasks not being done now]
```
