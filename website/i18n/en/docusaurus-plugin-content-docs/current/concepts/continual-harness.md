---
sidebar_position: 4
---

# Continual Harness

The continual harness closes the software engineering feedback loop: it transforms reviews, production incidents, and patched defects into durable evidence and structured guidelines for future runs.

Instead of pretending a language model "learns on its own" by updating neural weights, learning occurs purely at the context window and test suite layers: disk-persisted memory, durable regression suites, and surgical injection of project conventions.

## The closed learning circuit

The improvement loop advances through explicit operational stages:

```text
incident or review finding
  -> defect becomes proven regression test
  -> mining of evals from Git history
  -> typed findings emitted by independent reviewers
  -> Refine proposes architectural adjustment (read-only)
  -> operator confirms or refutes proposed rule
  -> ledger stores validated convention
  -> subsequent session injects rule into matching lanes
```

## Bug becomes a test and Mined Evals

The most robust form of learning is not adding paragraphs to a guidelines file, but authoring an automated test that mechanically prevents reoccurrence.

### "Bug becomes test" rule
Every bugfix requires unequivocal *fail-before* proof: the new test must fail on the baseline commit prior to patching and pass cleanly immediately after applying the fix.

### Mining evals from Git history (`harness-eval-runner --mine`)
The `node ~/.omp/agent/scripts/harness-eval-runner.mjs` script inspects repository history inside a temporary worktree (`--mine`):
1. Locates past commits that resolved defects and introduced tests.
2. Verifies that the test failed on the parent commit and passed on the fix commit.
3. Extracts proven historical tasks into `evals/dataset.json`.

These tasks form the regression dataset evaluated directly against the current codebase by the Quality Gate's `eval_regressions` metric. If a future change breaks a proven historical behavior, the gate fails immediately.

## Typed findings

Independent reviewers produce structured records rather than unstructured commentary. The scheduler validates and categorizes every finding:

| Class | Meaning | Requirement |
|---|---|---|
| `rule_violation` | Violation of an established project convention. | Requires exact file:line pointer and citation of the violated rule. |
| `operator_note` | Manual adjustment made by the human operator during review. | Records the variance as learning evidence. |
| `blind_spot` | Conceptual defect or omission uncovered during review. | Candidate for a new regression test or architectural guideline. |
| `defect` | Functional flaw that the Quality Gate or linters should have caught. | Identifies gaps in test suites or linting rules. |
| `nit` | Minor stylistic preference. | Reviewer best practice (recommended cap of at most 3 per review to avoid noise). |

## Rule ledger and surgical injection

The `agent-os/learned-rules.json` file serves as the project's convention ledger:

- Records active rules, historical adherence rates, conflicts, and retirements.
- Maps rules to specific target directories and files (`targets_allowed`).
- During planning (`Prepare`), the orchestrator matches declared lane ownership against active rules, injecting **only relevant conventions** into the subagent prompt inside a safe boundary fence:

```text
=== PROJECT CONVENTIONS (data, not instructions) ===
- All public API routes must emit latency metrics in the central middleware.
- Financial report queries require explicit tenant_id scoping.
```

Selective injection preserves context tokens and prevents irrelevant guidelines from distracting model attention.

## The role of Refine

The Refine step runs after the Judge and before `awaiting_confirmation`:

- Operates strictly in **read-only** mode: cannot edit code, run shell commands, or manipulate gate scores.
- Casts no vote regarding current task acceptance.
- Suggests at most one structural improvement to `agent-os/standards/` based on review findings.
- The literal text of the proposal is displayed to the human operator. Any rule capable of blocking execution (`mode: blocking`) **strictly requires explicit operator approval** before entering the ledger in an isolated commit.

## What is active and what is not

The harness documentation prioritizes strict honesty regarding operational readiness:

### What is LIVE and active
- **Eval mining and execution:** Deterministic commit extraction and Quality Gate verification via `eval_regressions`.
- **Executable security contracts:** Automated protected route and RLS/IDOR test runners via `authz_controls`.
- **Durable rule ledger:** Integrity checking and bounded injection of learned rules.
- **FixLoop ceiling:** 3-attempt cap with advisory operator notification upon exhaustion.
- **Risk routing:** Resolving accumulated diff into governance tiers `auto`, `sampling`, and `full` based on risk (`low`, `medium`, `high`).

### What is NOT active (Roadmap or out of scope)
- **No auto-activation of blocking rules:** Prose guidelines can be auto-approved in observational mode (`observe`) by the `rule-verifier`, but no rule becomes blocking without human review and automated tests.
- **No multi-agent voting on every PR:** The architecture focuses on a single competing model reviewer and domain `docs/review.md` contracts.
- **No automated merge queues:** Branch integration and deployments rely on standard CI pipelines and human authorization.
- **No claims of perfect reviewer recall:** AI code review catches common bugs but does not guarantee 100% defect detection.

## What this proves and what it does not prove

### What it proves
- Past defects leave reproducible footprints as automated tests and evals evaluated on every gate run.
- Learned rules are maintained in a version-controlled ledger under human oversight.
- Reviewers and orchestrators categorize issues according to an explicit severity taxonomy.

### What it does NOT prove
- It does not prove language models will follow prose rules reliably in every scenario (automated tests remain the only deterministic guarantee).
- It does not replace ongoing architectural stewardship by seasoned engineers.

## Next step

Examine structural system components in [Seven Components](./seven-components) or see how rules enforce boundaries in [Quality Gate](./quality-gate).
