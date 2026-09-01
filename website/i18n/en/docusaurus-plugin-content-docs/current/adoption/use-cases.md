---
sidebar_position: 1
---

# Use Cases

Choose the workflow by risk, dependencies, and duration, not only by file
count. Gates measure only metrics declared in
`agent-os/quality-thresholds.json#metrics`; a missing signal is a gap, not an
approval.

| Scenario | Recommended selection |
|---|---|
| Simple one-file task | One short lane, WIP=1 |
| Small bug fix | Reproduction, minimal fix, regression |
| Complex feature | Spec, contract, ownership lanes |
| Independent multitask | Parallel lanes with disjoint ownership |
| Dependent multitask | Lanes serialized by dependencies |
| Multi-session | Durable state and handoff |
| High-risk or security | Full tier and specialist review |
| Docs-only | Docs lane and source/link validation |
| Refine and learned rule | Judge, Refine, separate confirmation |
| Session resume | Derived briefing with source hash; refuses stale |

## Simple one-file task

**When to use:** a localized change with a clear requirement and no new
dependency, migration, or high-risk-path effect.

**Example prompt:**

```text
/prevc prepare Fix the empty copy in src/components/EmptyState.tsx. Change
only that file and run the area test and local gate.
```

**Expected behavior:** PREVC creates one WIP=1 unit, confirms scope, and runs
the discovered verification and local gate. The scheduler escalates review
only when the risk router or a gap requires it.

**Common mistakes:** opening a large spec; touching adjacent files; calling a
green gate proof when relevant metrics are unavailable.

## Small bug fix

**When to use:** reproducible behavior with a likely bounded cause and an
automatable regression.

**Example prompt:**

```text
/prevc prepare Reproduce the duplicate pagination error, add a regression
test, make the smallest fix, and validate the affected route.
```

**Expected behavior:** Plan records reproduction and acceptance criteria;
Execute follows red-green; Validate runs regression and gates; Judge compares
the fix with the original bug. A rule breach returns as a typed finding with
a resolvable pointer.

**Common mistakes:** fixing before reproducing; widening the refactor;
recording a preference as `rule_violation` without citing a real rule.

## Complex feature

**When to use:** multiple components, design decisions, schema changes,
integrations, or independent acceptance criteria.

**Example prompt:**

```text
/prevc prepare Design and implement report exports. Specify contracts,
separate API, worker, and UI ownership, and request approval before
execution.
```

**Expected behavior:** the planning pipeline produces a spec and evaluation
contract, maps risk and ownership, divides the plan into bounded lanes, and
keeps one active unit. The scheduler runs the full gate, the risk router
selects review depth, and Judge consumes aggregated evidence.

**Common mistakes:** coding before approval; sharing files across lanes;
using test volume as a substitute for acceptance criteria.

## Independent multitask parallel lanes

**When to use:** two or more tasks have no dependency and have disjoint file
sets.

**Example prompt:**

```text
/prevc prepare Run the parser fix and status component update in parallel.
Declare exclusive ownership and return evidence per lane.
```

**Expected behavior:** the scheduler builds the manifest before dispatch,
injects only active rules matching each ownership set, and runs lanes in one
native `task` wave with `hub` coordination. Each lane runs its local gate;
the scheduler is the sole findings writer and runs the aggregate gate.

**Common mistakes:** parallelizing tasks that edit the same file; allowing
reviewers to write findings; merging results without lane and capability
data.

## Dependent multitask serialized lanes

**When to use:** one task produces a contract, schema, or artifact consumed
by the next.

**Example prompt:**

```text
/prevc prepare Stabilize the API contract first, update the client second,
and adapt the UI last. Do not start a lane before the prior lane returns
evidence.
```

**Expected behavior:** PREVC represents blocking edges and runs only the
released lane. Each boundary validates its artifact before the next dispatch;
aggregate gates and Judge run when the chain ends.

**Common mistakes:** calling dependencies parallel; starting consumers
against a provisional contract; hiding a blocker to keep execution moving.

## Multi-session work

**When to use:** the goal does not fit one session or must survive pauses,
agent changes, or later review.

**Example prompt:**

```text
/prevc prepare Continue the active goal using the progress file and
session-handoff.md. Confirm the latest valid gate before resuming the next
WIP=1 unit.
```

**Expected behavior:** the durable lifecycle phase, feature state, findings,
ledger, and handoff persist in the repository. The new session rereads
context and checks whether evidence is still valid; stale or missing reports
fail closed.

**Common mistakes:** relying on chat history; marking `passing` without
output; reusing a report after its source changed.

## High-risk or security work

**When to use:** authentication, credentials, payments, permissions,
migrations, infrastructure, or paths matching `high_risk_paths`.

**Example prompt:**

```text
/prevc prepare Fix session validation. Classify it as high risk, limit scope
to auth, include abuse tests, and require full security review.
```

**Expected behavior:** the risk router selects full review; unavailable
metrics prevent downgrade; specialist reviewers return typed findings; the
red-team quickcheck runs per lane. A Refine proposal with a high-risk effect
preserves operator confirmation before it can become a rule.

**Common mistakes:** treating permissions as a sandbox; lowering the tier
because unit tests passed; placing a secret in evidence or a finding.

## Docs-only work

**When to use:** content, navigation, or examples with no runtime change.

**Example prompt:**

```text
/prevc prepare Update the bilingual installation guide, validate links and
build, do not change runtime or declare governing numbers in prose.
```

**Expected behavior:** PREVC keeps ownership within docs, runs source, link,
and build validation, and records gaps. Governing numbers remain in
`quality-thresholds.json` keys, not documentation.

**Common mistakes:** skipping the build because it is docs-only; duplicating
config values in prose; claiming a configured capability has live
acceptance.

## Refine and learned-rule cycle

**When to use:** typed findings show a recurring failure and Judge has
already finished. Use `/refine --note` when the operator wants to record a
manual fix as evidence.

**Example prompt:**

```text
/refine
```

**Expected behavior:** Refine reads the gate-bound window and ledger,
proposes at most one improvement per component, and writes nothing. Literal
proposal text appears at `awaiting_confirmation`; rules that can block
require operator approval and land as a separate change. Active rules are
injected into matching lanes on the next run.

**Common mistakes:** treating a proposal as approval; letting the refiner
edit the ledger; giving Refine a Judge vote; claiming auto-activation (the
auto-activation control ships off).

## Session resume

**When to use:** a fresh session or an agent handoff, when re-reading every
state file is costly and the risk is injecting stale context.

**Example prompt:**

```text
/harness-session-start
```

**Expected behavior:** session start reads the global context and the durable
lifecycle phase, runs a small path-scoped briefing when available (stamped
with a source hash), and declares the active task. A stale or missing
briefing fails closed — a gap to name, never a pass. The checkout, tests, and
runtime always outrank the briefing; a conflict becomes a finding, not a
fact.

**Common mistakes:** trusting chat history over durable state; injecting a
briefing without revalidating against the checkout; treating a missing
progress file as "nothing pending".

See [Continual Harness](../concepts/continual-harness) for the full loop
contract.
