---
sidebar_position: 5
---

# WIP=1

WIP=1 (*Work In Progress = 1*) is the harness's core cognitive discipline: **only one atomic unit of work may be active at any given time**.

Just as a human developer juggling multiple tickets simultaneously begins confusing variables, skipping validations, and mistakenly presuming tests passed, a language model assigned multiple concurrent objectives disperses its attention tokens (*context mixing*), loses track of constraints, and hallucinates task completion.

## Cognitive constraints for language models

An LLM's context window behaves much like human working memory:

- **Without WIP=1:** The agent receives mixed instructions (e.g., "implement authentication, refactor the database, and fix the login button"). The model attempts to modify multiple modules in undefined order, generates massive and unreviewable diffs, and frequently claims victory without testing.
- **With WIP=1:** 100% of model capacity focuses on a single bounded specification. The agent knows exactly what the goal is, which files it has permission to touch, and which command proves completion.

## Comparison: With vs Without WIP=1

| With WIP=1 | Without WIP=1 |
|---|---|
| A single feature is completed with captured real evidence. | Multiple initiatives are started simultaneously and none finish cleanly. |
| Blockers are recorded with their exact root cause in the handoff. | Blockers accumulate silently in chat memory. |
| Session scope is surgical and diffs are straightforward to review. | The session jumps across files, generating chaotic and cluttered diffs. |
| The handoff defines exactly one clear next best step. | The handoff lists vague and incomplete "in-progress" items. |

## Practical implementation

The harness maintains exactly one active unit marked `in_progress` in the tracking state (`todo` or `tasks.md`):

```json
{
  "id": "feat-001",
  "status": "in_progress",
  "title": "Add JWT authentication middleware"
}
```

If during execution you or the agent discover adjacent work (such as an unrelated bug or a refactoring opportunity):
1. **Do not expand scope silently.**
2. Enqueue the new item with status `not_started`.
3. Remain strictly focused on the active task until completion and validation.
4. The new task will be processed in its own isolated cycle.

## Parallel dispatch and exclusive file ownership

When a plan schedules parallel lane execution (`tasks[]`), WIP=1 applies per execution unit:
- Each subagent receives **exactly one active unit**.
- Each lane maintains a **disjoint set of files** under its responsibility (*declared file ownership*).
- Two parallel lanes are never permitted to edit the same file simultaneously. Tasks with code dependencies must execute sequentially, never in parallel.

## Remediation cycle ceiling (fixLoop)

To prevent focus discipline from devolving into infinite unproductive retry loops, the harness caps `fixLoop.maxAttempts` at **3 attempts** within the validation macro-loop. If tests fail to pass after three corrective cycles, execution halts cleanly for human operator review, preventing runaway token consumption.

## What this proves and what it does not prove

### What it proves
- That repository modifications were produced atomically with direct traceability to a single objective.
- That the agent operated under strict file ownership boundaries.

### What it does NOT prove
- It does not prove the prioritized task was the most commercially valuable business feature.
- It does not replace the requirement to carefully break down complex initiatives into atomic units during planning.

## Next step

See how atomic verification data is packaged in [Evidence and Handoff](./evidence-and-handoff) or explore evaluation standards in [Quality Gate](./quality-gate).
