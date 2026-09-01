---
name: harness-evaluator-rubric
description: Build a task-specific evaluator rubric from the active contract before Judge phase. Do not self-judge; produce rubric plus evidence.
---

# Harness Evaluator Rubric

Run after Execute + Validate and before claiming any verdict.

## Inputs

Find the best available contract:

1. `docs/harness/sprint-contract.md`
2. Feature spec/task AC under `.specs/features/*`
3. User-approved PREVC plan in current session

Also load available progress state, feature state, and startup path, plus the newest gate report
(`docs/harness/quality/*.json`) and the router tier.

## Two kinds of row

**Measured rows are copied from `agent-os/quality-thresholds.json` verbatim** — metric name,
direction, threshold — and scored from the gate report, not by reading code. Never restate a
number in prose here; a rubric with its own copy of a threshold becomes a second, drifting source
of truth within a sprint.

**Judgement rows** are the task-specific part, built from the contract. That is where this skill
adds value.

## Rubric

| Criterion | Kind | Weight | Pass Condition | Score (1-5) | Evidence | Notes |
|---|---|---|---|---|---|---|
| Functional completeness | judgement | high | All approved AC met | | | |
| Verification | measured | high | Gate exited 0 at the required mode | | | |
| Test strength | measured | high | `mutation_kill_ratio` meets threshold/baseline | | | |
| Regression | measured | high | `regression_suite` clean; bug fix has a new test | | | |
| Coverage floor | measured | medium | `line_coverage` / `branch_coverage` meet threshold | | | |
| Maintainability | measured | medium | `cyclomatic_max` / `module_lines_max` within threshold | | | |
| Boundaries | measured | medium | `boundary_violations` at threshold | | | |
| Scope discipline | judgement | high | Only approved scope changed | | | |
| Blind spots | judgement | high | `docs/review.md` items answered | | | |
| Handoff readiness | judgement | medium | State and handoff updated for fresh session | | | |

Add task-specific **judgement** rows from the contract. Do not invent measured rows — a metric
that is not in the thresholds file is not measured.

## Scoring

- 5: fully met with evidence.
- 3: partially met with documented gap.
- 1: not met or no evidence.
- Average ≥4.0 and no 1-scores: Accept candidate.
- Any 1-score: Block candidate.
- A measured row whose tool is absent scores **`unavailable`**, not 5 and not 1. It does not enter
  the average; it is listed as a gap. Scoring an unmeasured row as a pass is how a gate that
  measures almost nothing reads as green.
- **Any red measured row caps the candidate at Revise**, whatever the average says.

Do not self-approve. Send rubric and evidence to Judge.
