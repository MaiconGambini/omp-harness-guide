---
sidebar_position: 3
---

# Parallel Dispatch

Parallel dispatch allows running multiple work units concurrently during the PREVC Execute phase, enforcing strict write isolation per file under centralized `scheduler` coordination.

![Orchestration and roles](/omp-harness-guide/img/diagrams/orquestracao-e-papeis.png)
*Orchestration and roles: distribution of responsibilities across scheduler, specialists, and reviewers.*

## How real orchestration operates

Parallel dispatch in Oh My Pi enforces strict ownership invariants to prevent race conditions and merge conflicts:

1. **Exclusive file ownership:** every file scheduled for modification belongs to exactly one write-capable lane at a time. If two tasks require edits to the same module, the `scheduler` serializes them.
2. **Ephemeral subagents vs. persistent Maestri team:**
   - **Native subagents (`tasks[]`):** spawned by the `scheduler` via the `task` tool inside the OMP runtime for discrete tasks (such as TDD implementation of a file or executing a test shard).
   - **Persistent Maestri team (`/maestri-team`):** a ten-role team operating in dedicated terminals within the Maestri canvas, enabling persistent collaboration among specialists with pre-configured tool restrictions (e.g. read-only reviewers).
3. **Structured communication:** agents synchronize interfaces and blocking prerequisites through structured messages without manual polling.
4. **Two-tiered validation:** each lane runs local checks (`--mode local`). Upon reconciliation, the `scheduler` runs the comprehensive gate (`--mode full`) against the consolidated working tree.

## The lane table

Prior to dispatching any concurrent batch, the `scheduler` constructs a lane dependency and ownership matrix:

| Lane | Objective | Ownership (files) | Dependencies | Capability |
|---|---|---|---|---|
| L1 | Authorization service | `src/auth/service.py` | — | `implementer` |
| L2 | Storage repository | `src/storage/repository.py` | — | `implementer` |
| L3 | Integration test suite | `tests/test_integration.py` | L1, L2 | `test-runner` |

Mutually independent lanes (L1 and L2) execute in the same batch. Lane L3 waits for L1 and L2 artifacts to settle and reconcile before beginning integration testing.

## Dispatching via the `task` tool

The `scheduler` builds the dispatch payload naming explicit subagent profiles:

```json
{
  "context": "# Objective: Decouple storage and authorization while maintaining strict boundaries.",
  "tasks": [
    {
      "name": "AuthLane",
      "agent": "implementer",
      "task": "Implement authorization service in src/auth/service.py and run pytest tests/test_auth.py."
    },
    {
      "name": "StorageLane",
      "agent": "implementer",
      "task": "Refactor database queries in src/storage/repository.py and run pytest tests/test_storage.py."
    }
  ]
}
```

## Completion tracking and reconciliation

Each lane emits a structured completion receipt with its exit status and modified files list:

```text
[AuthLane]    completed -> pytest tests/test_auth.py: 12 passed (exit 0)
[StorageLane] completed -> pytest tests/test_storage.py: 8 passed (exit 0)
Reconciliation: 2 lanes merged with 0 file conflicts.
Full gate over reconciled tree: pass (Measured: 6/6 metrics evaluated).
```

## Time projection and operational bounds

When a plan is partitioned into independent tasks, execution duration is no longer the linear sum of task times, but bounded by the slowest lane plus reconciliation overhead:

```text
T_total = max(T_L1, T_L2, ...) + T_reconcile
```

This theoretical projection does not guarantee fixed acceleration: CPU contention, network latency, and model provider rate limits affect real throughput. Measure execution duration in your own environment before and after parallelization.

## Operational boundaries

- **Shared files:** never dispatch parallel lanes that write to the same file.
- **Process limits:** observe host memory and CPU bounds when sizing concurrent terminals or test shards.
- **Git commits:** subagents never commit directly. The `scheduler` alone commits reconciled changes locally at the end of the PREVC cycle.

## What this proves and what it does not prove

- **What it proves:** lane isolation guarantees that tasks completed without mutual file contamination and that the reconciled result satisfied the full quality gate.
- **What it DOES NOT prove:** successful parallel completion does not prove that subtle semantic regressions were avoided between modules. End-to-end integration tests during final reconciliation provide that verification.

## Related documentation

- [Maestri Team Guide](./maestri-team.md) — Operating persistent terminals on the canvas.
- [Quality Gate](../concepts/quality-gate.md) — How the full gate assesses reconciled code.
- [Skills and Agents](../reference/skills.md) — Reference for `implementer`, `scheduler`, and specialist roles.
