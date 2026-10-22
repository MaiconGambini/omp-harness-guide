---
name: harness-benchmark
description: "Creates benchmark scripts and threshold checks. Use when establishing performance baselines or regression gates. Do NOT use for ad-hoc Python profiling (use python-performance-optimization)."
---

# Harness Benchmark

Benchmarks must match the product's critical paths.

## Discovery

1. Identify core user or system flows from docs, routes, commands, or tests.
2. Find existing benchmark, load test, Lighthouse, or timing scripts.
3. Pick one critical path first.
4. Define explicit pass/fail thresholds.

## Possible Outputs

- benchmark runner script (`benchmark.ps1` or `benchmark.sh`)
- package script proposal
- docs-only benchmark plan

## Output

```markdown
## Benchmark Proposal
Critical path: ...
Metric: ...
Threshold: ...
Command: ...
Data setup: ...
Approval needed before writing: yes
```

## Rules

- Do not create benchmark scripts without approval.
- Thresholds must be explicit.
- Prefer repeatable local checks before external services.
- Record environment assumptions.
