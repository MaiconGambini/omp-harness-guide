---
sidebar_position: 7
---

# Quality Gate

The Quality Gate is the harness's empirical verification mechanism. It evaluates generated code against the policies declared in `agent-os/quality-thresholds.json`, producing auditable reports pinned to the working tree hash (`sourceHash`).

Instead of assuming code is ready because a language model declared completion, the gate measures static analysis metrics, test suites, regressions, and security controls using deterministic commands.

## Metric statuses

Every metric evaluated by the gate receives one of six formal statuses:

| Status | Meaning | Behavior in gate |
|---|---|---|
| `pass` | The metric was measured and satisfied the configured threshold. | Contributes to a passing verdict. |
| `fail` | The metric was measured and violated the quality threshold. | Blocks phase completion. |
| `observe` | The metric was measured for monitoring and historical tracking only. | Records the numeric value without failing the gate. |
| `unavailable` | The tool failed, the scanner crashed, or output was corrupted. | Blocks compulsorily if the metric is required by the active profile (fail-closed). |
| `not_configured` | The metric exists in the catalog but lacks configured tooling in the project. | Recorded as a gap; does not fail by default. |
| `not_applicable` | The metric does not apply to this project type (e.g., database checks on a static package). | Ignored in compliance calculations. |

Treating statuses like `unavailable` follows the fail-closed principle: missing tools or commands that fail during execution are never masked as zero counts or treated as tacit compliance.

## Risk router and tiers

The `harness-risk-router` classifies the initiative by determining the governance tier (`auto`, `sampling`, or `full`). While the tier normally tracks the diff's risk classification (`low`, `medium`, `high`), routing is not a simple 1:1 mapping because it jointly evaluates repository context and gate health:

- **High-risk paths (`high_risk_paths`):** Any change touching authentication, authorization, database migrations, infrastructure, or the harness's own governance compulsorily assigns risk as `high` and forces tier `full`, regardless of line count.
- **Unconfigured gate (`gate.unconfigured`):** If the repository does not yet have configured quality tools or thresholds, the router falls back to `sampling` to mandate sampled inspection, preventing `auto` approval without real measurements.
- **Unavailable or incomplete metrics:** If the full gate is green but instrumented metrics returned `unavailable`, or if validation was only executed at `--mode local`, the tier falls back to `sampling`.
- **Tier `auto`:** Strictly reserved for low-risk (`risk:low`), low-complexity changes evaluated against a credibly green and complete full Quality Gate.
## The gate as an operational signal

The Quality Gate result acts strictly as an engineering signal, rather than a destructive interruption:

![Quality Gate as a signal in the PREVC lifecycle](/omp-harness-guide/img/diagrams/prevc-fase-a-fase.png)
*The Quality Gate acts as a measurement signal between micro and macro-loops in PREVC.*

When the gate returns a `fail` verdict:
1. The completion assertion and transition to the confirmation phase are blocked.
2. The development session **remains open**, and the working tree is not discarded.
3. The orchestrator and agents inspect the failure causes in the metric table and start a new remediation cycle (*macro-loop*).

The red signal prevents early delivery of broken code without penalizing exploratory debugging workflows.

## Measurement coverage: Measured N/M

A green gate (`pass`) does not necessarily mean high test coverage. If a new project only configures linters and disables tests and security scanners, almost all metrics will resolve to `not_configured` or `unavailable`.

To counter the false illusion of robustness ("false green"), the report header transparently exposes the coverage ratio and a formal warning:

```text
- Verdict: **pass** (exit 0)
- Measured: 8/28 metrics
- WARNING: most metrics unmeasured (8/28); pass is not evidence of quality
```

Whenever the count of measured metrics is under 50% of monitored metrics, a formal warning alerts reviewers that measurement was partial.

## Evals, security, and delivery preflight

The Quality Gate integrates structural checks directly into the validation cycle:

### Eval regressions (`eval_regressions`)
The `node ~/.omp/agent/scripts/harness-eval-runner.mjs` script mines proven historical tasks in a temporary worktree (`--mine`) and, in regression mode (`--regression --metric`), runs each proven task from `evals/dataset.json` directly against the current repository code. If any historical behavior with an existing test breaks, the metric records the failure and blocks the gate.

### Security contract (`authz_controls`)
The `node ~/.omp/agent/scripts/harness-security-contract.mjs --run --metric` script executes tests declared in `agent-os/security-contract.json` for protected routes, authentication integrity, and multi-tenant isolation. Unavailable tools or dependencies produce an `unavailable` status, ensuring infrastructure failures never pass unnoticed.

### Delivery preflight (`delivery_config`)
The `node ~/.omp/agent/scripts/harness-delivery-preflight.mjs --config-check --metric` script verifies the syntax and structural integrity of container manifests (`docker-compose.yml`, Dockerfiles, cloud configs) without triggering slow image builds, pushes, or real deployments. The metric operates in `observe` mode, ensuring deployment configurations are verified before merging.
## Usage example

Running the quality gate from the command line:

```bash
node ~/.omp/agent/scripts/harness-quality-gate.mjs --mode full
```

Real output observed in the terminal:

```text
# Quality Gate — full

- Date: 2026-10-22T14:34:28.143Z
- Verdict: **pass** (exit 0)
- Label: session
- Phase: A
- Source hash: f4785ee8c1e0a83e
- Measured: 8/28 metrics
- WARNING: most metrics unmeasured (8/28); pass is not evidence of quality
- Config fingerprint: b998ddc88421f438
- Project commands: enabled

## Metrics

Metric                       Value  Threshold  Status
regression_suite             0      <= 0       pass
redteam_quickcheck           0      <= 0       pass
dependency_cooldown          0      <= 0       pass
skill_lint                   0      <= 0       pass
file_growth_delta            0      -          pass
module_lines_max             12991  <= 300     observe
prose_tells                  856    -          observe
security_findings            -      -          unavailable
authz_controls               -      -          unavailable
eval_regressions             -      -          not_applicable
delivery_config              -      -          not_applicable
line_coverage                -      -          not_configured

## Notes

- 14 of 30 metric(s) unavailable — these SHOULD have measured and did not. A green exit code over 8 measured rows means little. Read the table.
- 6 of 30 metric(s) not_configured — no instrument exists for them in this project.
- 2 metric(s) not_applicable to this project or diff (eval_regressions, delivery_config).
```

## What this proves and what it does not prove

### What it proves
- That configured commands executed in the test environment with expected exit codes.
- That active metrics respected configured numerical thresholds for the project.
- That the report is cryptographically bound to the working tree state (`sourceHash`).
- Which metrics were omitted due to missing tools or unconfigured scanners.

### What it does NOT prove
- A gate with `pass` status and low coverage ratio (`Measured: 7/28`) **does not prove** the absence of vulnerabilities or architectural defects in unmeasured metrics.
- It does not replace human evaluation of logical requirements and complex business rules.
- It does not guarantee software functions in external production environments if runtime variables or third-party services deviate from the test environment.

## Next step

Learn how the gate coordinates with human and agent inspection in [Code Review](./code-review) or explore lifecycle mechanics in [PREVC](./prevc).
