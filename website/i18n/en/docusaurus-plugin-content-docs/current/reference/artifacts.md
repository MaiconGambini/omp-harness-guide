---
sidebar_position: 3
---

# Artifacts

Durable files and schemas read and written by the harness across the operational lifecycle.
Artifact governance guarantees that decisions, quality metrics, and execution state
persist across separate agent sessions.

## Core artifact inventory

| Artifact | Location | Purpose |
|---|---|---|
| `AGENTS.md` | project root | Project instructions, coding conventions, and repository entry points |
| `feature_list.json` | project root | Source of truth for strict WIP=1 execution |
| `agent-os/prevc-autonomy.json` | `agent-os/` | PREVC autonomy settings, auto-confirm policies (`autoConfirm`, disabled by default), and gate criteria |
| `agent-os/project-profile.json` | `agent-os/` | Detected project profile: stack, test commands, linter, and `fixLoop` policy |
| `agent-os/quality-thresholds.json` | `agent-os/` | Metric keys and risk routing configurations (referenced by key without published numbers) |
| `docs/review.md` | `docs/` (or per area) | Mapped historical failures, reviewer checklist, and escaped defect log |
| `.github/pull_request_template.md` | `.github/` | Pull request template with Risk Tier, Testing, Rollback Instructions, and Assignee |
| Judge Receipts | report directory | Typed verdicts (`accept`, `reject`, `revise`), evaluated rubric, and evidence citations |
| Gate Reports | report directory | Metric evaluation statuses, measurement coverage (`measurementCoverage`), and coverage label (`coverageLabel`) |
| Session Handoff | `docs/harness/session-handoff.md` | Durable continuity record capturing blockers, progress, and actionable next steps |

## Structured artifact specifications

### 1. PREVC autonomy configuration (`agent-os/prevc-autonomy.json`)

Controls autonomy boundaries during PREVC execution. Auto-confirmation (`autoConfirm`)
is strictly opt-in and disabled by default.

```json
{
  "schemaVersion": 1,
  "autoConfirm": false,
  "maxRevisionCycles": 3
}
```

When disabled, execution automatically halts upon reaching `awaiting_confirmation`,
handing control and accumulated evidence back to the human operator.

### 2. Project profile (`agent-os/project-profile.json`)

Maintained by `harness-project-profile.mjs` at `agent-os/project-profile.json`. Records canonical test, lint, and security
audit commands alongside remediation loop bounds (`fixLoop`).

```json
{
  "schemaVersion": 1,
  "stack": [
    "node",
    "typescript"
  ],
  "test": {
    "command": "npm test",
    "detected": true
  },
  "evals": {
    "isolation": "process",
    "detected": true
  },
  "ci": {
    "provider": "github",
    "detected": true
  },
  "delivery": {
    "mode": "none",
    "detected": true
  },
  "fixLoop": {
    "maxAttempts": 3,
    "escalateOn": [
      "attempts_exhausted",
      "secret_or_credential",
      "production_deploy",
      "scope_change",
      "dependency_cooldown"
    ],
    "detected": true
  }
}
```

The `fixLoop.maxAttempts` property sets a default ceiling of 3 attempts for automated
fix loops within a lane. When attempts are exhausted, the system issues a structured warning
and logs the blocker for operator guidance rather than entering an infinite retry loop.

### 3. Quality thresholds (`agent-os/quality-thresholds.json`)

Defines metric keys evaluated by `harness-quality-gate.mjs` and blast-radius tiers
evaluated by `harness-risk-router.mjs`.

- **Governing metric keys:** evaluated per project key (such as `eval_regressions`,
  `authz_controls`, `coverageLabel`, `measurementCoverage`). Numeric threshold values
  are calibrated within individual repositories.
- **Risk classification:** diffs route across `risk:low`, `risk:medium`, and `risk:high`
  based on modified line volume, path sensitivity, and affected data seams.

### 4. Code review standards by area (`docs/review.md`)

Captures cumulative domain lessons and failure modes. Each critical component maintains
an area `review.md` divided into three sections:

1. **Observed critical failures:** documented defects or outages that previously affected the area.
2. **Reviewer checklists:** mandatory checks required of the `code-reviewer` agent prior to sign-off.
3. **Escaped defect log:** concise post-incident record documenting regressions that escaped review and corrective actions taken.

### 5. Pull request template (`.github/pull_request_template.md`)

Enforces delivery traceability:

- **Risk Tier:** classification into `low`, `medium`, or `high`.
- **Testing:** reproducible command and veridical output validating the change.
- **Rollback steps:** explicit commands and procedure required to revert in case of failure.
- **Assignee:** owner accountable for delivery and monitoring.

### 6. Gate report and measurement coverage

The quality gate outputs measurement honesty alongside pass/fail indicators:

- **Metric statuses:** metrics report as `pass`, `fail`, `observe`, `unavailable`,
  `not_configured`, or `not_applicable`.
- **`measurementCoverage`:** ratio between measured metrics (`pass`, `fail`, `observe`)
  and applicable declared metrics. The gate prints `Measured: N/M` and flags a warning
  whenever fewer than half of declared metrics are measured (`unmeasuredMajority: true`).
- **`coverageLabel`:** descriptive label classifying coverage scope (`unmeasured`,
  `smoke_only`, `partial`, `standard`, or `comprehensive`).

### 7. Judge receipt

Produced by the `judge` subagent at the completion of verification. Contains formal
verdict, task rubric scores, and acceptance criteria confirmation. PREVC advances
to confirmation only when the receipt carries an `accept` verdict.

## Ownership and concurrency rules

1. **Sole phase writer:** only `harness-prevc-state.mjs` writes durable PREVC lifecycle states.
   Invalid state transitions are rejected.
2. **No direct finding writes:** review agents return structured payloads to the scheduler,
   which validates content before committing findings records.
3. **Strict WIP=1:** at most one active task unit may report `in_progress` in `feature_list.json` at any point.

## What this proves and what it does not prove

- **What it proves:** persistent artifacts prove that audits ran, metrics were queried,
  and reproducible rollback and testing evidence exists.
- **What it DOES NOT prove:** the presence of configuration files does not guarantee that
  underlying rules fully prevent bugs. Efficacy requires regular calibration and regression tests.

## Related documentation

- [Commands](./commands.md) — Commands that inspect and update harness artifacts.
- [Repository Structure](./repository-structure.md) — Directory layout for harness files.
- [Quality Gate](../concepts/quality-gate.md) — Operational mechanics of gate metrics.
