---
sidebar_position: 4
---

# Existing Project

Adding the harness to an existing codebase requires prior non-mutating diagnostics and non-destructive installation, respecting established team conventions and CI pipelines.

![Onboarding and installation](/omp-harness-guide/img/diagrams/onboarding-instalacao.png)
*Onboarding and installation: from repository diagnostics to profile generation and harness bootstrap.*

## Modern automated onboarding

Rather than manual file creation, the harness provides automated tools to detect project profiles, register verification commands, and integrate knowledge graphs without overwriting existing files without consent.

The onboarding process follows four structured phases:

1. **Non-mutating diagnostic (`/harness-init`):** layer-by-layer audit without modifying repository files.
2. **Detection and profiling (`harness-project-profile.mjs`):** extraction of stack, test suites, linters, and remediation limits (`fixLoop`).
3. **Assisted bootstrap (`/harness-bootstrap`):** creation of `AGENTS.md`, `feature_list.json`, pull request templates, and quality contracts.
4. **Review governance and knowledge graph:** setup of `docs/review.md` by area and knowledge graph registration.

## Step-by-step integration

### 1. Initial diagnostics with `/harness-init`

Within Oh My Pi chat, execute the inspection command:

```text
/harness-init
```

The initializer inspects the repository in read-only mode and produces a gap report:

- **Root instructions:** identifies existing `AGENTS.md`, `CLAUDE.md`, or `README.md` files.
- **Startup and verification paths:** detects package managers and test commands (e.g. `npm test`, `pytest`, `cargo test`).
- **Progress tracking:** inspects presence of feature state trackers (`feature_list.json`).
- **Security and MCPs:** audits exposed secrets across local configuration files.

### 2. Generating the project profile

The `harness-project-profile.mjs` utility allows inspecting detected settings with `--detect` and saving them to disk with `--write`:

```bash
# Inspect detected profile (prints to terminal only, no files modified)
node ~/.omp/agent/scripts/harness-project-profile.mjs --detect --root <projeto>

# Persist profile to <projeto>/agent-os/project-profile.json
node ~/.omp/agent/scripts/harness-project-profile.mjs --write --root <projeto>
```

Real output returned by the detection script:
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
The `fixLoop.maxAttempts` property ensures automated fix attempts inside implementation lanes stop after 3 iterations, alerting the operator instead of looping indefinitely. When executed with `--write`, the profile is persisted to `<projeto>/agent-os/project-profile.json`.

### 3. Assisted installation with `/harness-bootstrap`

Once the diagnostic plan is approved, invoke the bootstrap command:

```text
/harness-bootstrap
```

The bootstrap command presents an action plan categorized as create, merge, or retain:

| File | Default Action | Purpose |
|---|---|---|
| `AGENTS.md` | Create or Merge | Project guidelines, conventions, and entry points |
| `feature_list.json` | Create | Active work backlog with strict WIP=1 enforcement |
| `agent-os/prevc-autonomy.json` | Create | Autonomy constraints configured with `autoConfirm: false` |
| `agent-os/quality-thresholds.json` | Create | Metric key mappings and risk routing boundaries |
| `.github/pull_request_template.md` | Create | PR template with Risk Tier, Testing, and Rollback steps |
| `docs/review.md` | Create | Code review guidelines, critical failure log, escaped defect tracker |
| `docs/harness/session-handoff.md` | Create | Inter-session handoff and continuity artifact |

No existing files are overwritten without explicit operator confirmation.

### 4. Running the first operational session

After bootstrap completion, proceed with standard workflows:

1. Run the discovered test command to establish a clean, green baseline.
2. Begin the session using `/harness-session-start`.
3. Add the initial task unit to `feature_list.json` with status `in_progress`.
4. Wrap up the session with structured handoff using `/harness-clean-handoff`.

## What this proves and what it does not prove

- **What it proves:** onboarding confirms that the repository has standardized entry points, audited test commands, and explicit quality thresholds.
- **What it DOES NOT prove:** installing the harness does not resolve existing technical debt or ensure test suite coverage is comprehensive. Blind spots in tests remain unmeasured until test suites are updated.

## Related documentation

- [New Project](./new-project.md) — Creating repositories from scratch with the harness.
- [Maestri Team Guide](./maestri-team.md) — Operating persistent canvas agents.
- [Repository Structure](../reference/repository-structure.md) — Full layout of harness files.
