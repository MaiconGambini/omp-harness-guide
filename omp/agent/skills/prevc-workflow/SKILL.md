---
name: prevc-workflow
description: "Orchestrate PREVC lifecycle phases. Use when running multi-phase tasks with gates. Do NOT use for single-file tasks."
---

# PREVC Workflow

PREVC is the sole lifecycle owner:

```text
prepare -> awaiting_plan_approval -> execute -> validate -> judge
-> refine -> awaiting_confirmation -> confirm | revise | abort -> handoff
Recovery/loop edges: validate -> execute (autofix loop), judge -> validate, refine -> validate, blocked -> execute
```

PREVC does not apply when all three conditions hold: the router tier is `auto`, risk
is `low`, and the ownership set contains a single file. The session todo is the
record, and no `agent-os/specs/<slug>/` directory is created. This is a floor, not
a loophole: if any one condition fails, the change is under PREVC. The operator
may always require PREVC regardless.

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
The plan/spec must contain explicit `## Blast radius` and `## Rollback` sections (or a combined `## Blast radius / rollback`) before transitioning to `awaiting_plan_approval`.

- `low`: proportional plan and fresh objective evidence.
- `medium`: plan, review, declared validation, and context/security evidence or a
  documented skip.
- `high` and `untrusted`: full gates, explicit risk acknowledgement, constrained
  permissions, and rollback considerations before execution.

### Plan artifacts

When PREVC applies, every plan writes the canonical Agent OS `spec.md` under
`agent-os/specs/<slug>/` before `awaiting_plan_approval`. `plan.md`,
`verification.md`, `decisions.md` and `tickets/` are required from tier
`sampling` upward. At tier `auto`, those four artifacts are optional; write any
that a conditional stage or execution scope requires.

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

Both `spec.md` and `plan.md` must ensure that blast radius and rollback are explicitly addressed: the plan/spec must contain `## Blast radius` and `## Rollback` (or a combined `## Blast radius / rollback`) before `awaiting_plan_approval`.
Planning artifact writes are the sole pre-approval edits; product and
implementation edits remain forbidden until approval.

### Upstream routing

Resolve the idea before planning:

1. **Clarify.** If the input is an idea rather than an objective, run
   `skill://brainstorming` to turn it into a goal plus observable acceptance
   criteria. Never plan against a vague idea.
2. **Research (conditional).** Run `skill://research` ONLY when an external
   claim (dependency, platform, regulation) changes the requirements. Save
   primary sources to `agent-os/specs/<slug>/research.md`. At tier `sampling` or
   `full`, record `research: required` in `decisions.md` with a concise
   result/verdict and the research.md pointer. At tier `auto`, record it in
   `decisions.md` only when that artifact is written; otherwise keep the result,
   verdict, and pointer in the session todo.
3. **Prototype (conditional).** Build a disposable prototype ONLY when a
   logic/UI question cannot be answered from code or docs. Write it under
   `agent-os/specs/<slug>/prototype/` — never beside real module/page code.
   A throwaway branch or worktree requires explicit operator authorization;
   otherwise the `prototype/` directory is the only allowed location. At tier
   `sampling` or `full`, record `prototype: required` in `decisions.md` with the
   question, the verdict, and the artifact pointer. At tier `auto`, record it in
   `decisions.md` only when that artifact is written; otherwise keep the
   question, verdict, and pointer in the session todo.
4. **Decide.** Run `skill://to-spec` over the resolved decisions; it writes
   `spec.md`. At tier `sampling` or `full`, `decisions.md` records every resolved
   decision. When research or prototype was skipped, it records the literal lines
   `research: not-needed` and/or `prototype: not-needed`, so the optional stages
   never vanish silently. At tier `auto`, record those decisions in
   `decisions.md` only when that artifact is written; otherwise the session todo
   records them.
5. **Decompose.** At tier `sampling` or `full`, only after to-spec: run
   `skill://to-tickets` to publish the lane table under `tickets/`. At tier
   `auto`, publish tickets only when the execution scope requires a lane table.

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

If validation fails (exit 1), PREVC routes back through `validate -> execute` for targeted repair (see Validate section). The state `blocked` is entered only by an explicit transition (`--to blocked`) or a Judge receipt verdict `block`, never automatically from a gate reading. Scope change or permission escalation pauses for operator input (`needs_input`).

### Lane Briefings and Project Conventions

Every dispatched lane must receive an explicit lane briefing containing:
- Objective, constraints, and declared file ownership set.
- Verification command and expected output envelope.
- Project conventions: the scheduler runs `node agent/scripts/harness-learned-rules.mjs --root . --query` scoped to the lane's ownership via `--scope <path>` (querying each owned path or common directory scope), and injects the output into the lane briefing fenced as:

```text
=== PROJECT CONVENTIONS ===
<output of node agent/scripts/harness-learned-rules.mjs --root . --query --scope <path>>
=== END ===
```

Lane workers must treat these project conventions as binding constraints for their assigned scope.

## Validate — the numeric backbone

The existing hierarchy stands: static → unit → integration → E2E → runtime. The quality gate
**quantifies** it; it does not replace it.

- Leaving Validate for Judge requires the gate green at `--mode full` (`harness-quality-gate`).
- **Red gate is a loop, not a work stopper (GS-01..GS-04)**: Exit 1 triggers the `validate -> execute` loop where agents exchange failure diagnostics and iterate until passing. Transition to Judge is refused without modifying phase. Nothing persists `blocked` automatically from a gate result.
- **Fix-loop exhaustion is advisory (GS-04)**: When autofix attempts reach `fixLoop.maxAttempts` (default 3, clamped 1-10), the transition `validate -> execute` is accepted with `advisory: "fix-loop-exhausted (N/max)"` and the diagnostic is reported to the operator while work continues.
- **Recovery edges (GS-05)**: `judge -> validate` and `refine -> validate` allow re-validation when reports are stale or tree changed; `blocked -> execute` allows resuming code work from an explicit block without re-approving the plan.
- **Exit 2 is a harness blocker, not a code failure.** Report it as a harness diagnostic.
- Non-green gates withhold only delivery claims (confirming completion or readiness); they never prevent reading, exploring, running locally, or coding.

### Review depth follows the tier

| Tier | Path |
|---|---|
| `auto` | no diff read. Validate → Judge → `awaiting_confirmation` with the gate report as evidence. |
| `sampling` | review over the sampled files only; tests and docs required for them. |
| `full` | full review plus `security-analyst`; a human reads the diff. Never auto-advances. |

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

## Auto-Confirm Loop

When the autonomy policy (`prevc-autonomy.json` in `agent-os`) enables `autoConfirm`, the autonomous cycle loops revise → validate → judge:
- On receipt verdict `revise`: dispatch the fixes and loop back through validate and judge.
- On receipt verdict `accept`: write `docs/harness/session-handoff.md` and execute `auto-confirm`.
- On refusal or `blocked`: stop immediately and call the operator. Plan approval remains with the operator; push and remote operations remain out of scope.

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
