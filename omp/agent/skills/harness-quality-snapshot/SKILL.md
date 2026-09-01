---
name: harness-quality-snapshot
description: Create a milestone quality scorecard with evidence. Use for release, capstone, or major sprint review; not for every small task.
---

# Harness Quality Snapshot

Track project health over time with evidence.

## Artifact

Preferred file: `docs/harness/quality-document.md`.

Create or update only after approval.

## Relationship to `harness-quality-gate`

**The gate is per-change and binary; this snapshot is per-milestone and qualitative.** They are not
two scorecards competing — the gate produces the numbers, the snapshot interprets the trend.

So the measured dimensions below **cite the latest gate report** rather than re-running anything.
Do not re-derive coverage, mutation, complexity, module size, boundaries or security findings by
inspection; read `docs/harness/quality/*.json` and quote it. What this skill adds is the part no
single run shows: direction over time, and which risk is worth acting on next.

## Dimensions

| Dimension | Evidence |
|---|---|
| Build health | startup/build command output, plus the gate's verdict |
| Feature completeness | feature state and AC evidence |
| Test strength | gate report: `mutation_kill_ratio` (the real number) with `line_coverage` as the floor |
| Regression health | gate report: `regression_suite` — failing plus quarantined |
| Documentation | root instructions, context docs, handoff |
| Harness quality | startup, WIP, Judge, state, handoff |
| Architecture boundaries | gate report: `boundary_violations`, plus documented boundaries |
| Measurement coverage | how many metrics are `unavailable` — a gate measuring three of nine rows is the risk, not the reassurance |
| Cleanup priority | scanner findings |

## Output

```markdown
## Quality Snapshot
Date: ...
Overall score: .../10
Evidence table: ...
Top risks: ...
Next improvement: ...
```

## Rules

- Use actual command output or file evidence.
- Mark unknowns as unknown.
- Do not inflate score when verification is missing.
- Intended for milestones, not every small task.
- Cite the gate report for every measured dimension; never restate a threshold.
- An `unavailable` metric lowers confidence in the whole snapshot — say so instead of scoring
  around it.
- Trend beats level: "mutation 62% → 69% over four milestones" is worth more than any single 7/10.
