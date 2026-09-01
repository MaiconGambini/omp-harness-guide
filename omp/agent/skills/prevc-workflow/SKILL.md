---
name: prevc-workflow
description: PREVC lifecycle contract (runtime-neutral). Use for planning, approved-plan execution, evidence-based validation, Judge review, operator confirmation, and handoff. Dispatch and state persistence are delegated to the runtime adapter.
---

# PREVC Workflow

PREVC is the sole lifecycle owner:

```text
prepare -> awaiting_plan_approval -> execute -> validate -> judge
-> refine -> awaiting_confirmation -> confirm | revise | abort -> handoff
```

The runtime adapter owns objective/state persistence and lane dispatch; this
contract defines only the phases, their gates, and the artifacts. Agents and
skills are bounded capabilities; they cannot transition lifecycle state,
approve evidence, or self-confirm completion. Only the adapter may write the
lifecycle phase.

## Prepare

Discover only relevant instructions, state, specs, standards, Judge profiles, and
startup or verification paths. Classify risk as `low`, `medium`, `high`, or
`untrusted`. Produce a reviewable plan with scope, non-goals, acceptance criteria,
files or boundaries affected, validation, rollback notes, and execution budgets.

Risk classification is **informed by `harness-risk-router`**, not replaced by it. Run the router
over the intended scope (or the plan's file ownership sets when no diff exists yet) and record the
tier with its reason. How the two compose:

- The router **produces** `low`, `medium`, `high` — deterministically, from high-risk path globs and
  complexity signals in the diff. A high-risk path match forces `high`.
- `untrusted` is **never computed.** It describes provenance — untrusted input, third-party or
  generated code, an external contributor — and only the operator or this phase declares it.
- The router may **raise** a declared class, never lower it. A human who said `untrusted` outranks
  a green diff.

Wiring the classification blindly to a router that only emitted `low`/`high` would make the
medium-risk evidence rule below unreachable and collapse `untrusted` into `low`.

Stop at `awaiting_plan_approval`. Do not edit before explicit operator approval.

- `low`: proportional plan and fresh objective evidence.
- `medium`: plan, review, declared validation, and context/security evidence or a
  documented skip.
- `high` and `untrusted`: full gates, explicit risk acknowledgement, constrained
  permissions, and rollback considerations before execution.

### Plan artifacts

Every plan writes the canonical Agent OS artifacts under
`agent-os/specs/<slug>/` before `awaiting_plan_approval`:

- `spec.md` — the canonical PRD: objective, requirements, acceptance criteria.
  No other file plays that role.
- `plan.md` — approach, file boundaries, lane table, validation, rollback, risks.
- `verification.md` — how each acceptance criterion is proven, with commands.
- `decisions.md` — every resolved decision, including the optional-stage
  records below.
- `prototype/` — disposable prototypes only, written only when the
  conditional prototype stage ran.
- `tickets/` — the tracer-bullet lane table. The scheduler
  may not publish tickets without a `spec.md`.

Planning artifact writes are the sole pre-approval edits; product and
implementation edits remain forbidden until approval.

### Upstream routing

Resolve the idea before planning:

1. **Clarify.** If the input is an idea rather than an objective, run
   `skill://brainstorming` to turn it into a goal plus observable acceptance
   criteria. Never plan against a vague idea.
2. **Research (conditional).** Run `skill://research` ONLY when an external
   claim (dependency, platform, regulation) changes the requirements. Save
   primary sources to `agent-os/specs/<slug>/research.md` and record
   `research: required` in `decisions.md` with a concise result/verdict and
   the research.md pointer.
3. **Prototype (conditional).** Build a disposable prototype ONLY when a
   logic/UI question cannot be answered from code or docs. Write it under
   `agent-os/specs/<slug>/prototype/` — never beside real module/page code.
   A throwaway branch or worktree requires explicit operator authorization;
   otherwise the `prototype/` directory is the only allowed location. Record
   `prototype: required` in `decisions.md` with the question, the verdict,
   and the artifact pointer.
4. **Decide.** Run `skill://to-spec` over the resolved decisions; it writes
   `spec.md`. When research or prototype was skipped, `decisions.md` records
   the literal lines `research: not-needed` and/or `prototype: not-needed`,
   so the optional stages never vanish silently.
5. **Decompose.** Only after to-spec: run `skill://to-tickets` to publish the
   lane table under `tickets/`.

Planning/specification input and the Execute-phase scheduler role are provided by
the runtime adapter.

When a plan proposes parallel execution, it must declare a lane table. The lane table
**is** the `to-tickets` output: each tracer-bullet ticket is a lane, carrying lane ID
(ticket number), objective, exact file ownership set, dependencies (its blocking
edges), verification command, risk tier, and owning capability. One write-capable lane owns a file
at a time; lanes with intersecting ownership sets are not independent. The ticket set
is reviewed before approval, not decided at dispatch time.

## Run

A run is valid only when PREVC has recorded explicit approval for the current plan.
Execute only the approved scope and declared permissions, files, checks, retries,
tool, and duration budgets.

A run may automate:

```text
Review -> Execute -> Validate -> Judge -> Refine
```

During Execute of an approved plan that declared a lane table, the runtime's
scheduler dispatches independent lanes in parallel and reconciles results within
the approved scope, files, permissions, and budgets. Dispatch uses the runtime's
native parallel mechanism; results auto-deliver and there is no background stub.
The scheduler does not transition lifecycle state; PREVC resumes at Validate with
the reconciled result.

Stop immediately as `blocked` or `needs_input` on failed validation, missing
evidence, ambiguity, scope change, permission escalation, or exhausted budget. Do
not start an open-ended repair loop.

## Validate — the numeric backbone

The existing hierarchy stands: static → unit → integration → E2E → runtime. The quality gate
**quantifies** it; it does not replace it.

- Leaving Validate requires the gate green at `--mode full` (`harness-quality-gate`). Exit 1 stops
  the run as `blocked`, naming the failing metric, its value, and its threshold — "tests failed" is
  not evidence, a number is.
- **Exit 2 is a harness blocker, not a code failure.** Say which it is. Conflating them sends agents
  to "fix" working code.
- An `unavailable` metric is a named gap, never a pass. A gate exiting 0 while measuring a handful
  of rows has not validated much.
- A missing or stale report is not a pass. The router returns tier `full` for those, and the
  approval recommendation is withheld rather than granted by default.

### Review depth follows the tier

| Tier | Path |
|---|---|
| `auto` | no diff read. Validate → Judge → `awaiting_confirmation` with the gate report as evidence. |
| `sampling` | review over the sampled files only; tests and docs required for them. |
| `full` | full review plus operator-approved security review; a human reads the diff. Never auto-advances. |

At `auto` no reviewer ran, so there are no 0–10 scores: the approval input is the green full-mode
gate report plus the Judge verdict, and the absence of reviewer scores is recorded explicitly
("tier auto — reviewers not run, gate report is the evidence"). Operator confirmation at
`awaiting_confirmation` is unchanged and still mandatory in every tier.

At `full`, the review must be **recorded** to `docs/harness/review/`, citing the gate report's
`sourceHash`. `harness-ship-evidence --commit-trailer` refuses without it — and it refuses on a review
that names a *different* change, because otherwise one stale review artifact satisfies the
mandatory-review tier forever.

## Refine

Refine — after Judge, before awaiting_confirmation. Dispatch the refiner subagent over the trajectory
window. It writes nothing and has no vote in the verdict; the Judge's dispatch payload must contain no
Refine output.

Route each proposal by blast radius (D21):
  - enforcement == prose AND target is not a high_risk_path → dispatch the rule-verifier (distinct from
    the refiner) to REFUTE it against agent-os/standards/ and the diff. If it cannot refute, the proposal
    is auto-approved: the scheduler writes it in the post-confirmation step below with no operator stop,
    and it is logged to refine-log.md as auto-activated with the verifier's report. If it refutes, the
    proposal returns to candidate with the refutation recorded.
  - enforcement can block (lint | test | gate_metric) OR target is a high_risk_path → present inside
    awaiting_confirmation as a separately-rejectable item, rendering the LITERAL text to be written, the
    target file and anchor, source findings with file:line, and refuted_by. `confirmo` applies code and
    proposal; `confirmo, sem a regra` applies the code and defers the proposal to candidate.

Auto-activated prose rules are surfaced in the next run's tier-full high_risk_path read (learned-rules.json
and standards/** are high_risk_paths) so the operator retains a retroactive veto — the blocking pre-approval
is removed, the human read is not.

Post-confirmation write — the scheduler applies approved prose as a SEPARATE rulebook commit, after the
code commit and its trailer have already been emitted. agent-os/standards/, docs/review.md and
learned-rules.json are inside sourceHash, so writing them before the trailer stales the report and
ship-evidence refuses. Record every outcome in docs/harness/refine-log.md, including rejections with the
operator's reason, which binds future proposals.

If no findings exist for this run — tier auto runs no reviewer — say so. Absence is a gap to name, never
a clean run.

The full procedure lives in the `harness-refine` skill. The post-confirmation write is owned by the
Confirm phase: after the operator confirms, the scheduler applies it before handoff.

## Autonomous Plan Run

An operator instruction to execute a named plan or spec end to end is itself the run
authorization — no separate approval step, no per-task approval. In this mode PREVC
automates every task's Review -> Execute -> Validate -> Judge -> Refine to the end of the plan
and transitions to `awaiting_confirmation` **once**, for the whole spec, rather than
per task.

The autonomy is bounded — halt mid-run only for a real blocker: a task needing
operator/live action, a scope change beyond the plan, `push`/deploy/branch/worktree/
remote Git, or an unrecoverable validation failure after one bounded repair. Medium+
scope changes and high/untrusted risk acknowledgement still apply and still stop the
run when triggered.

After Judge and the Refine phase, always transition to `awaiting_confirmation` at the end of the run (per
task for ad-hoc work; once for a full autonomous plan run). Present changed files, a
diff summary, validation evidence, Judge verdict, residual risks, and rollback
information for operator review.

## Confirm And Handoff

Only the operator may confirm, request revision, or abort from
`awaiting_confirmation`. Confirmation records the outcome and invokes
`harness-clean-handoff`. Revision returns to planning or review as appropriate.
Abort records the reason and performs no further work.

**The post-confirmation write is owned by the Confirm phase.** After the operator confirms — and
**before** handoff — the scheduler applies any approved Refine prose as a separate rulebook commit,
after the code commit and its trailer have already been emitted (see the Refine section). The handoff
subroutine never performs this write.

Local commits of reconciled, validated work are allowed once a run is authorized —
the scheduler may commit the approved changes with a clear message. Pushes,
deployments, branch changes, worktree creation, remote Git operations, and permission
elevation are never automatic; the operator performs or explicitly authorizes each.
Low-risk non-PREVC operational checks may auto-complete only through their separate,
objective evidence policy.
