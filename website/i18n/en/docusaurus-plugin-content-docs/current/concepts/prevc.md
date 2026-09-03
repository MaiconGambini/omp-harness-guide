---
sidebar_position: 3
---

# PREVC

PREVC is a common contract for significant work, independent of the runtime.
It defines scope boundaries, allowed transitions, required evidence, and human
confirmation; no agent can replace those decisions.

## Four phases and seven steps

The seven contract steps are grouped into four phases:

| Phase | Steps | Main boundary |
|---|---|---|
| **Prepare** | `prepare` + `plan` | Discover context, classify risk, and obtain plan approval. |
| **Execute** | `execute` | Change only approved files and objectives. |
| **Validate** | `validate` + `judge` | Run gates and receive an independent judgment. |
| **Confirm** | `refine` + `confirm` | Review the improvement proposal and confirm as operator. |

Grouping assigns responsibility at each boundary; the literal sequence remains
`prepare → plan → execute → validate → judge → refine → confirm`.

## Phase boundaries

1. **Prepare:** the agent inspects the repository, measures risk, and proposes
   a clear specification.
2. **Execute:** after plan approval, it implements under WIP=1 and within
   declared ownership.
3. **Validate:** it runs real checks and submits the result to the read-only
   Judge.
4. **Confirm:** the operator reviews the evidence and authorizes completion.

## Lifecycle diagram

```text
OPERATOR MAKES A REQUEST
        |
        v
PREPARE
        |-- discovers context, reads rules, state, and handoff
        |-- classifies risk (harness-risk-router.mjs)
        |-- planner creates the plan in agent-os/specs/<slug>/
        v
AWAITING_PLAN_APPROVAL
        |-- the operator reviews objective, scope, non-scope, and AC
        v
EXECUTE
        |-- scheduler dispatches approved lanes (task + hub)
        |-- WIP=1: one active unit at a time
        v
VALIDATE
        |-- local gate per lane; full gate over the reconciled tree
        v
JUDGE
        |-- full gate green and fresh; read-only judge returns one receipt
        v
REFINE
        |-- read-only refiner proposes improvements; does not write or vote
        v
AWAITING_CONFIRMATION
        |-- the operator reviews evidence and literal proposal text
        v
CONFIRM | REVISE | ABORT
        |
        v
HANDOFF
```

## PREVC in OpenCode and Oh My Pi

OpenCode is the methodological and continuity adapter here: it organizes
planning conventions, durable artifacts, and handoffs. Oh My Pi is the native
engine and executes the same contract with runtime primitives.

In OMP, the `scheduler` uses `task` to dispatch independent lanes in one
`tasks[]` wave; `hub` coordinates messages; `todo` maintains session WIP=1; and
`test-runner` may shard suites when the plan authorizes it and test files are
disjoint. Native extensions observe runtime events, but do not transition PREVC
or confirm work.

These are execution capabilities, not evidence of speed. Use dispatch only when
lanes have disjoint ownership and explicit dependencies.

## Durable lifecycle state

The lifecycle phase is **durable**: every transition is written by
`harness-prevc-state.mjs` to a project-local durable lifecycle file
and survives across sessions. The state script is the
persistent transition boundary:

```powershell
# start in prepare
node ~/.omp/agent/scripts/harness-prevc-state.mjs init --objective "<objective>" --spec agent-os/specs/<slug> --risk <low|medium|high|untrusted>

# phase transitions
node ~/.omp/agent/scripts/harness-prevc-state.mjs transition --to <phase>

# read the state
node ~/.omp/agent/scripts/harness-prevc-state.mjs inspect --json
```

- **Exit 2 means the transition was refused.** Ordinary refusals — illegal
  edges, invalid state or receipt, missing/stale/unreadable gates — write
  nothing.
- The single exception is the red-gate guard: `validate → judge` against a
  red full gate atomically persists `blocked` with the derived
  metric/value/threshold blocker and still returns exit 2.
- Every write is serialized by a repository-local lock file; a stale lock is
  detected and treated as expired.
- **No agent other than PREVC may write the lifecycle phase.** Agents and
  skills cannot transition lifecycle state, approve evidence, or self-confirm
  completion.

## How to use

Start PREVC with the task description:

```text
/prevc prepare <objective>
```

- Performs discovery, classifies risk, and creates the plan via the planner.
- Stops at `awaiting_plan_approval`, waiting for your confirmation.
- Nothing is edited before explicit approval; read-only reconnaissance is
  always allowed. The sole pre-approval write exception is the planning
  pipeline itself: the planner may create the canonical artifacts in
  `agent-os/specs/<slug>/` (spec.md, plan.md, verification.md, decisions.md,
  tickets/, research.md, prototype/).

Once you approve (plain language, or):

```text
/prevc run
```

- Executes within the approved scope.
- Validates the result (full measured gate, green and fresh).
- Runs the Judge, then Refine, then stops at `awaiting_confirmation`.

An instruction to execute a **named** plan or spec end to end is itself the
authorization for an autonomous run: no separate `/prevc run`, no per-task
approval. The run stops once at `awaiting_confirmation` for the whole spec,
and halts mid-run only for a real blocker (operator/live action, scope
change, push/deploy, or an unrecoverable validation failure).

## The Judge boundary

- Before `validate → judge`, the full gate
  (`node ~/.omp/agent/scripts/harness-quality-gate.mjs --mode full`) must be
  **green AND fresh**: its `sourceHash` must equal the current tree hash.
- The read-only `judge` agent returns **one receipt JSON** — schema version,
  `sourceHash`, gate report, tier, verdict (`accept | revise | block`),
  rubric score, blocking criteria, evidence paths, judge identity, and
  timestamp. PREVC writes it to the project's Judge-receipts area and passes
  it to the transition; the receipt's `sourceHash` must equal the latest full
  green gate's.
- `refine → awaiting_confirmation` requires a recorded verdict `accept`;
  `revise`/`block` route to a revision or `blocked`.
- `awaiting_confirmation → complete` requires **both** an explicit operator
  action (`--operator-action confirm`) and an existing
  `docs/harness/session-handoff.md`. A stale handoff from a previous run
  refuses `complete` and must be rewritten.

## Why there is no auto-completion

An agent message saying it ran a command is **not** a reliable receipt from
the runtime. As long as there are no reliable execution receipts, no
automatic transition to final completion is enabled. This limit is
intentional: the system prefers to stop at review rather than record a
completion it cannot prove.

## PREVC rules

- WIP=1 always (tracked with the `todo` tool during a session).
- Routine low-risk operations (session start, status checks, explicit
  dependency installation, formatting, narrow test repairs) go through a
  direct fast path with objective verification, without the PREVC ceremony.
- Completion requires real evidence.
- Do not touch files outside the scope.
- Adjacent work becomes `not_started`.
- If verification fails, the feature is marked `blocked`.
- If the Judge is not `accept`, it does not confirm.
- Refine does not alter the Judge result or approve rules.
- The harness never pushes, deploys, changes branches, or runs remote Git
  operations automatically.

## Next step

See [Continual Harness](./continual-harness) for findings, Refine, and rule
injection, or [WIP=1](./wip-one) for execution discipline.
