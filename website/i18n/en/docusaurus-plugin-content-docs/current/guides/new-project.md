---
sidebar_position: 0
---

# New Project

How to structure a repository from its initial commit with the Oh My Pi harness, integrating delivery governance, code review, and continuous operational memory.

![New project operational loop](/omp-harness-guide/img/diagrams/onboarding-loop-fase-a.png)
*New project operational loop: from clean repository to continuous governance cycle.*

## From empty repository to continuous operations

Bootstrapping a new project with the harness establishes delivery discipline from day one. Rather than retrofitting checks and quality gates after production incidents occur, this onboarding sequence structures the codebase in five stages:

1. **Base structure and initialization:** Git repository initialization, dependency management, and baseline test suite.
2. **Audit and bootstrap (`/harness-init` and `/harness-bootstrap`):** operational contracts and subagent instruction scaffolding.
3. **Registration and knowledge graph:** indexing the repository into the project graph to support architectural reasoning.
4. **Delivery contracts and code review:** pull request template configuration, area review standards, and risk labeling.
5. **Autonomy and loop boundaries:** `autoConfirm` calibration and `fixLoop` failure bounds.

## Step-by-step setup procedure

### 1. Initialize the repository and baseline

Create the repository directory and establish initial test tooling:

```bash
mkdir <projeto>
cd <projeto>
git init
```

Introduce an initial passing test suite (such as `npm test` or `pytest`). The harness requires an established, green baseline before authorizing new feature tasks.

### 2. Run initialization audit and bootstrap

Within Oh My Pi or the Maestro terminal:

```text
/harness-init
```

The command evaluates the workspace non-destructively and reports missing harness layers. Next, approve bootstrap installation:

```text
/harness-bootstrap
```

Bootstrap generates core project artifacts:

- `AGENTS.md`: repository guidelines, coding conventions, and canonical test commands.
- `feature_list.json`: operational task backlog enforcing strict WIP=1 execution.
- `agent-os/prevc-autonomy.json`: PREVC autonomy limits and auto-confirm safeguards.
- `agent-os/quality-thresholds.json`: governing quality metric keys.

### 3. Project registration and second brain

To enable long-term context retrieval through the knowledge graph:

1. Register the new repository in the local projects registry (`projects.json`).
2. Run initial context indexing (`cerebro-carga-inicial`) to map modules and dependencies into Obsidian and graphify.
3. This allows planning and architecture subagents to query past architectural decisions without re-reading the entire repository on every session start.

### 4. Delivery contracts and code review

Configure code governance to safeguard the default branch:

#### Pull Request template (`.github/pull_request_template.md`)

```markdown
### Risk Tier
- [ ] risk:low — Cosmetic or documentation change
- [ ] risk:medium — Business logic or internal API change
- [ ] risk:high — Data schema, authentication, or infrastructure change

### Testing
- Reproducible command: `<command>`
- Observed evidence: `<terminal output>`

### Rollback Procedure
- Explicit rollback steps: `<instructions>`

### Assignee
- Delivery owner: `<name>`
```

#### Area review guidelines (`docs/review.md`)

Create `docs/review.md` to capture cumulative technical domain knowledge:

- **Observed critical failures:** record common failure modes and ecosystem pitfalls.
- **Reviewer checklist:** mandatory verification items for the `code-reviewer` agent.
- **Escaped defect log:** tabular log documenting future regressions and preventive actions.

### 5. Profile detection and loop bounds

Run the detection script to inspect discovered verification commands:

```bash
node ~/.omp/agent/scripts/harness-project-profile.mjs --detect --root <projeto>
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

The `fixLoop.maxAttempts = 3` setting prevents infinite automated correction cycles when tests fail repeatedly, escalating blockers directly to the human operator. Use `--write` to persist settings to `<projeto>/agent-os/project-profile.json`.

## Executing the first feature

With the project structure established, proceed with the first task:

1. Begin the session using `/harness-session-start`.
2. Add the first work unit to `feature_list.json` with status `in_progress`.
3. Plan implementation using `/planner <feature-name>`.
4. Approve the plan and execute using `/prevc run`.
5. Prior to opening a Pull Request, run `/quality full` and ensure that measurement coverage reports honestly (`Measured: N/M`).

## What this proves and what it does not prove

- **What it proves:** initializing a project through this workflow guarantees that test tooling, code review checklists, traceable delivery templates, and remediation loop boundaries are active from the very first commit.
- **What it DOES NOT prove:** having the harness configured does not guarantee that initial domain architecture is optimal. The harness guarantees operational discipline, while domain correctness depends on the thoroughness of specifications and test suites.

## Related documentation

- [Existing Project](./existing-project.md) — Introducing the harness into legacy codebases.
- [Maestri Team Guide](./maestri-team.md) — Operating persistent specialists on the canvas.
- [Quality Gate](../concepts/quality-gate.md) — Detailed mechanics of thresholds and risk tiers.
