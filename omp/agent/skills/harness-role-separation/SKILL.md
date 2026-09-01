---
name: harness-role-separation
description: Invoke for complex, subjective, UI-heavy, or self-review-prone tasks. Separates planner, generator, and evaluator roles. Produces sprint contract before any code.
---

# Harness Role Separation

Use when a task is complex, has subjective outcomes, touches UI, or where self-review would miss defects.

## When to Use

- Task involves UI/visual design decisions
- Task spans multiple files or subsystems
- Prior similar tasks had quality drift or missed requirements
- Task is high-risk (auth, data integrity, public API)
- Single-role approach produced incomplete output before

## Role Definitions

**Planner:** Defines scope, writes sprint contract, defines AC, does NOT write implementation.
**Generator:** Implements ONLY what is in sprint contract scope. No scope expansion.
**Evaluator:** Judges against sprint contract AC using harness-evaluator-rubric. Does NOT self-approve.

In OpenCode, one agent can play all three roles — but sequentially, with explicit role transitions.

## Workflow

### 1. Planner Phase

Fill `docs/harness/sprint-contract.md` before writing any code:
- Sprint Overview: what and why
- Scope In: explicit list of what will change
- Scope Out: explicit list of what will NOT change
- Roles: planner / generator / evaluator
- Acceptance Criteria: observable, runnable
- Verification Plan: commands + pass conditions
- Evidence Log: leave empty, fill during/after Execute

State: "Planner complete. Switching to Generator role."

### 2. Generator Phase

Implement ONLY sprint contract scope:
- If you discover adjacent work → add to `feature_list.json` as `not_started`. Do not implement now.
- If scope must change → stop, update sprint contract, get approval, then continue.

State: "Generator complete. Switching to Evaluator role."

### 3. Evaluator Phase

Invoke `harness-evaluator-rubric`. Do not produce verdict in same response as implementation.
Fill Evidence Log in sprint contract with actual command output.
Record revision log entry if any rework was needed.

## Revision Log Pattern

```
[timestamp] Revision 1: [what changed] | Reason: [why] | AC affected: [which]
```
