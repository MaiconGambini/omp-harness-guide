---
name: harness-eval-contract
description: Use before medium or high risk implementation to define capability, regression, command, and Judge evaluation criteria for Agent OS specs.
---

# Harness Eval Contract

Add an `evals.md` section for medium+ specs with:

- Capability evals: what must become possible.
- Regression evals: what must remain true — and which regression test covers it. A bug fix must add
  one.
- Command evals: exact checks and expected outputs, including the quality gate at the mode this
  work requires.
- Judge evals: rubric and acceptance threshold.
- Evidence location: where results will be recorded.

**Numbers come from one place.** Command and Judge evals cite `agent-os/quality-thresholds.json` as
the source of expected values; they never restate a threshold. A spec that hardcodes one drifts from
the gate within a sprint, and then two documents disagree about what passing means.

Do not execute implementation until the eval contract is explicit.
