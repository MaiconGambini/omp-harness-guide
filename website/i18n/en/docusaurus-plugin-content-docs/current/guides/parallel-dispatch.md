---
sidebar_position: 3
---

# Parallel Dispatch

Executes the tasks of an approved plan in **parallel subagents**, each with
its own scope, under PREVC lifecycle control. The scheduler is the
Execute-phase dispatcher: it receives the approved plan, dispatches the
independent lanes at the same time, and reconciles the results.

**OMP execution model.** Oh My Pi dispatches lanes natively:



- One `task` call carries a **`tasks[]` array** — all independent lanes in a
  single wave of independent lanes.
- `hub` handles peer coordination; **results auto-deliver** — there is no
  background stub and no status-polling fallback.
- Reviewers also run concurrently: code review + architecture review in one
  `task` batch.
- Tests shard across parallel test-runner lanes (split by test file/dir/tag)
  and are reconciled before reading coverage — a large suite is never run
  serially in the main agent.

## When to use

- A plan with **independent lanes** — disjoint files, no sequential
  dependency between them.
- Multi-component work where distinct parts can advance together (for
  example, an authorization layer in parallel with a persistence layer).

**When NOT to use:** a strictly serial WIP=1 plan, lanes that touch the same
file, or a 1-file feature. In those cases the scheduler overhead does not pay
off — use the [complex feature](./complex-feature) flow or the
[small task](./small-task) flow.

## How a run works

An instruction to execute a **named plan** end to end is itself the
authorization for the autonomous run:

```text
Execute all tasks in plan agent-os/specs/<PLAN-FOLDER> end to end under PREVC —
this authorizes a full autonomous run.
Propose a lane table per phase; parallelize independent lanes,
serialize lanes sharing a file. Use recommended subagents.
When all tasks land, run the code review and architecture review in parallel
over the diff; both must pass with zero critical/blocking issues.
Stop only at the final awaiting_confirmation for the whole spec.
```

The run executes every task without per-task approval and stops **once**, at
`awaiting_confirmation` for the whole spec. It halts mid-run only for a real
blocker: a task that needs operator/live action (physical machine,
credential, real traffic), a scope change, push/deploy, or an unrecoverable
validation failure.

Without a named-plan instruction, the normal gate applies: `/prevc prepare`
proposes the plan, stops at `awaiting_plan_approval`, and `/prevc run`
authorizes Execute.

## The lane table

Before dispatching, the scheduler builds a lane table. Each lane declares
file ownership — **one write-capable lane per file at a time**:

```text
| Lane | Objective             | Ownership (files)      | Dep  | Capability |
| L1   | Authorization layer   | authorization/, routes/| —    | implementer |
| L2   | Persistence layer     | area_bindings/sql_*.py | —    | implementer |
| L3   | Tests for L1 + L2     | tests/...              | L1,2 | test-runner |
```

Ownership that crosses = lanes that are **not** independent — serialize or
merge them into a single lane. It is a prompt rule, not a lock: two lanes on
the same file silently overwrite each other.

## Specific and experimental example: four modules

The following example illustrates the OMP-native `task` shape and test
partitioning. The file names, agents, shards, and outputs are illustrative, not
measurements or a universal recipe.

### 1. Concurrent dispatch through `task`

```json
{
  "context": "Refactor four independent domains without shared files.",
  "tasks": [
    { "name": "AuthShard", "agent": "implementer", "task": "Refactor auth schemas and run its focused tests." },
    { "name": "BillingShard", "agent": "implementer", "task": "Refactor billing schemas and run its focused tests." },
    { "name": "CatalogShard", "agent": "implementer", "task": "Refactor catalog schemas and run its focused tests." },
    { "name": "NotificationShard", "agent": "implementer", "task": "Refactor notification schemas and run its focused tests." }
  ]
}
```

### 2. Observable evidence trail (illustrative format)

Each lane returns a terminal envelope with real output when executed. This
snippet shows only the shape:

```text
[AuthShard] completed in <time> -> focused tests: <result> (exit 0)
[BillingShard] completed in <time> -> focused tests: <result> (exit 0)
Reconciled tree: <count> shards, <count> file conflicts.
Full gate: <result>.
```

### 3. Illustrative wall-clock calculation

The formula explains how to measure a run; these values are synthetic:

```text
Reduction = (T_sequential - T_parallel) / T_sequential
          = (128.0s - 32.0s) / 128.0s
          = 75.0%  # example calculation, not a published result
```

Measure the same plan in the target environment before comparing runs.

## Authorization

- **Manual mode:** `/prevc prepare <objective>` stops at
  `awaiting_plan_approval`; after approval, `/prevc run` authorizes Execute.
- **Autonomous mode:** an instruction to execute a named plan or spec end to
  end is the authorization and stops once at `awaiting_confirmation`.

## Known limits

- File ownership is a prompt rule, not a lock. For real isolation between
  colliding lanes, use [git worktrees](./portability).
- `Ctrl+C` in the main session does not kill dispatched children; cancel
  lanes through the harness.
- Two schedulers in the **same folder** collide — schedulers do not share
  ownership. Use different worktrees or machines.
- A dense plan saturates capacity on its own; running several heavy plans at
  once can hit provider limits without going faster.
