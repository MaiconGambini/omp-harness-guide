---
name: harness-capstone-audit
description: Score harness maturity from 0-10 across entry, context, state, feedback, evaluation, runtime, benchmark, cleanup, and plugin readiness.
---

# Harness Capstone Audit

Use to evaluate harness maturity and identify the next best improvement.

## Score Dimensions

| Dimension | Checks |
|---|---|
| Entry | root instructions, command routing |
| Context | architecture, product, reliability docs |
| State | WIP=1, progress, feature state |
| Feedback | startup path, verification command |
| Evaluation | Judge profiles and rubric use |
| Runtime observability | logs, health, error signals |
| Benchmark | critical-path benchmarks and thresholds |
| Cleanup | scanner and cleanup protocol |
| Plugin readiness | warnings, no unsafe mutation |

## Output

```markdown
## Harness Capstone Audit
Overall: .../10
Dimension scores: ...
Minimal harness gaps: ...
Capstone maturity gaps: ...
Next best improvement: ...
Evidence: ...
```

## Rules

- Score from file and command evidence, not optimism.
- Distinguish baseline readiness from 9+ maturity.
- A missing startup path caps score at 6.
- Missing state or Judge caps score at 7.
- Unsafe auto-mutating plugins cap score at 8.
