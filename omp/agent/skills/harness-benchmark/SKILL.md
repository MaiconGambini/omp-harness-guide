---
name: harness-benchmark
description: Propose project-specific benchmark scripts and thresholds. Use when performance or critical-path regression checks are needed.
---

# Harness Benchmark

Benchmarks must match the product's critical paths.

## Discovery

1. Identify core user or system flows from docs, routes, commands, or tests.
2. Find existing benchmark, load test, Lighthouse, or timing scripts.
3. Pick one critical path first.
4. Define explicit pass/fail thresholds.

## Possible Outputs

- `scripts/benchmark.ps1`
- `scripts/benchmark.sh`
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
