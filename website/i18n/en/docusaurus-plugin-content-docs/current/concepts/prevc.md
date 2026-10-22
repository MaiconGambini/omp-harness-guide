---
sidebar_position: 3
---

# PREVC

PREVC is the harness's core engineering contract for software tasks. It defines scope boundaries, valid state transitions, required evidence, and criteria for human or governed confirmation.

No execution agent possesses the authority to bypass this workflow, modify phases arbitrarily, or declare work complete without providing the evidence required by each phase.

## Four phases and seven steps

The lifecycle is organized into four operational phases grouping seven sequential steps:

| Phase | Grouped steps | Objective and required evidence |
|---|---|---|
| **Prepare** | `prepare` + `plan` | Repository reconnaissance, risk classification via accumulated diff, and formal specification approved by the operator. |
| **Execute** | `execute` | Strict implementation under WIP=1 with declared file ownership per lane. |
| **Validate** | `validate` + `judge` | Execution of the Quality Gate, regression tests, and receipt generation by the independent (read-only) Judge. |
| **Confirm** | `refine` + `confirm` | Prose improvement proposal (Refine) and formal confirmation (human or criteria-based autonomous). |

The conceptual seven-step sequence in the PREVC contract:

```text
prepare → plan → execute → validate → judge → refine → confirm
```

In the durable state managed by `harness-prevc-state.mjs`, this conceptual framework maps directly to the canonical state machine phases: `prepare` → `awaiting_plan_approval` → `execute` → `validate` → `judge` → `refine` → `awaiting_confirmation` → `complete`.
![PREVC lifecycle](/omp-harness-guide/img/diagrams/ciclo-prevc.png)
*The four PREVC lifecycle phases and their governed transitions.*

## Tiers and risk router

Prior to execution, the `harness-risk-router` analyzes scope and assigns one of three governance tiers (`auto`, `sampling`, or `full`). While the tier normally follows the diff's risk classification (`low`, `medium`, `high`), routing also accounts for gate health (an unconfigured gate falls back to `sampling`, and critical paths strictly mandate tier `full`):

- **Tier `auto` (`low` risk):** Small, localized changes in non-critical files evaluated against a credibly green, fully measured gate. Skips pre-merge diff reading.
- **Tier `sampling` (`medium` risk):** Medium-scope tasks, gates with unavailable metrics, or uncalibrated projects. Triggers sampled test suites and cross-checks.
- **Tier `full` (`high` risk):** Mandatory whenever the diff touches sensitive paths (`high_risk_paths` such as authentication, authorization, database migrations, infrastructure, or harness governance) or exceeds complexity limits. Mandates full test suites and human diff inspection.

### Mandatory red-team audit in full tier
In tier `full` (or `high` risk), `harness-prevc-state.mjs` compulsorily refuses the `judge -> refine` transition unless an approved red-team review exists, bound to the same gate `sourceHash`, carrying the line `Red-team: N tentativas` (with N >= 3) and `Verdict: APPROVE`. In the operator's workspace, these tests against the modified surface are executed by the operator's security agent; the public harness distribution does not include the offensive `security-analyst` subagent.

## What runs in each phase

![PREVC end-to-end](/omp-harness-guide/img/diagrams/prevc-ponta-a-ponta.png)
*Detailed end-to-end operational execution across each PREVC phase.*

1. **Prepare:** Agents perform read-only discovery. A formal specification plan is created detailing goals, non-goals, affected files, verification commands, and acceptance criteria. The phase pauses at `awaiting_plan_approval`.
2. **Execute:** The scheduler dispatches lanes to implementation workers (`implementer` or `fixer`), each strictly confined to its declared file ownership.
3. **Validate:** The full Quality Gate evaluates all applicable metrics. The `judge` agent reviews results against acceptance criteria and produces a structured JSON receipt.
4. **Confirm:** The `refine` agent proposes at most one architectural pattern improvement (without editing repository files). The human operator reviews the handoff and evidence report to authorize final completion.

## Micro-loop vs Macro-loop and the fixLoop ceiling

During development, verification failures activate two distinct remediation circuits:

![Quality gate and micro and macro loops in PREVC](/omp-harness-guide/img/diagrams/prevc-fase-a-fase.png)
*The Quality Gate acts as an operational signal between local micro-loops and the validation macro-loop.*

- **Micro-loop (inside Execute):** A dedicated worker (`fixer`) is granted exactly 1 immediate retry per test shard to resolve trivial local failures before returning control to the orchestrator.
- **Macro-loop (Validate &rarr; Execute):** When the integrated Quality Gate or Judge rejects the code, the orchestrator returns the initiative for a full implementation cycle.
- **Cycle ceiling (`fixLoop.maxAttempts`):** The default ceiling for macro-loop iterations is **3 attempts**. Exhaustion of this ceiling is **advisory**: the `validate -> execute` transition is still accepted by the orchestrator accompanied by the advisory notice `fix-loop-exhausted (N/max)` and diagnostic output for the failing metric, allowing work to proceed without destructive halts or accidental aborts.

## The gate as an operational signal

The Quality Gate acts like a traffic signal:
- A green gate (`pass`) signals that the codebase satisfies minimum metrics to advance to Judge evaluation.
- A red gate (`fail`) **only blocks completion** and the transition to `awaiting_confirmation`. It does not abort the session, destroy the terminal, or revert code; the state remains open for corrective iterations.

## The blocked status

The `blocked` status is not generated automatically by test or gate failures. It is reachable in the lifecycle solely through an explicit transition to `blocked` providing a `--blocker <text>` rationale (triggered by the operator or orchestrator upon identifying a genuine scope blocker) or via a formal Judge receipt with a `block` verdict listing `blockingCriteria`.
## Criteria-based auto-confirmation (auto-confirm)

For routine maintenance, PREVC supports autonomous completion (`awaiting_confirmation → complete`) via the `auto-confirm` action.

By default, auto-confirmation is **strictly disabled** (`autoConfirm: false` in `agent-os/prevc-autonomy.json`). When enabled by the operator, autonomous confirmation requires all of the following conditions simultaneously (*fail-closed*):

1. **Autonomy policy:** `agent-os/prevc-autonomy.json` file present with `autoConfirm: true` and valid `maxRevisionCycles` (0 to 10).
2. **Revision budget:** total `revision_requested` cycles do not exceed `maxRevisionCycles`.
3. **Judge receipt:** formal `accept` verdict with an empty `blockingCriteria` list.
4. **Full Quality Gate green and fresh:** passing report matching the exact `sourceHash` of the inspected working tree.
5. **Independent review approved:** report in project review records written after validate carrying `Verdict: APPROVE`.
6. **Durable, fresh handoff:** regular `session-handoff.md` present and updated after entry into `awaiting_confirmation`.
### High-tier governance
Even when a repository configures `autoConfirm: true`, governance guidelines recommend that for initiatives classified as `full` (or labeled `risk:high`), human operators temporarily disable auto-confirmation to conduct a manual review prior to merging.

## Lifecycle commands

The `/prevc` slash command provides entry points for planning and execution:

Initiating task planning:
```bash
/prevc prepare Add session token authentication
```

Executing an approved plan:
```bash
/prevc run
```

Final confirmation or revision requests in `awaiting_confirmation` are given by the operator in plain language in the chat ("confirm", "revise") or directly via the state script:

```bash
# Confirm completion
node ~/.omp/agent/scripts/harness-prevc-state.mjs transition --to complete --operator-action confirm

# Request revision with reason
node ~/.omp/agent/scripts/harness-prevc-state.mjs transition --to revision_requested --operator-action revise
```
## What this proves and what it does not prove

### What it proves
- That the workflow followed an auditable sequence rather than jumping from prompt directly to code writing.
- That scope was formally bounded prior to execution and evaluated against explicit acceptance criteria.
- That validation was performed by agents and tools distinct from the code author.

### What it does NOT prove
- It does not prove the architectural approach chosen is the most elegant or scalable possible.
- It does not replace human judgment regarding product value or user necessity.
- It does not guarantee remote environments or upstream branches will integrate the patch without network or credential errors.

## Next step

Learn about cognitive focus discipline in [WIP=1](./wip-one) or see how verification data is packaged in [Evidence and Handoff](./evidence-and-handoff).
