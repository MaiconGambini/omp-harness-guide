---
name: harness-project-setup
description: "Detects project stack, test runners, Docker, CI, and deploy signals to configure agent-os/project-profile.json. Use when bootstrapping or onboarding a repository. Do NOT use for mid-session execution."
---

# Harness Project Setup

This skill inspects a target repository (read-only), detects its technology stack, test commands, containerization, CI pipelines, and delivery configuration, and generates an idempotent `agent-os/project-profile.json` (schemaVersion 1 per amendment R6.1).

It is used during project onboarding or environment bootstrap. It ensures that downstream harness tools (eval runner, measured gates, preflight delivery, and the PREVC self-correction loop) adapt cleanly to repository characteristics rather than assuming hardcoded Docker or cloud platforms.

## Procedure

### 1. Read-Only Detection (Dry-Run)

Run the detection script with `--detect --json` against the target repository root:

```bash
node scripts/harness-project-profile.mjs --root <path-to-repo> --detect --json
```

The script inspects filesystem markers across root and subdirectories up to depth 2 (excluding ignored folders like node_modules, vendor, .git, dist, build, .venv, target):
- **Stack & Component Test Detection (`test.components`)**:
  - Detects each sub-project or root component: `[{ path, stack, command, cwd }]`.
  - `go.mod` → Go stack (`go test ./...`)
  - `pyproject.toml` / `requirements*.txt` → Python stack (`pytest -q` or `python -m unittest`)
  - `package.json` (`scripts.test`) → Node/TypeScript stack (`npm test`, or `command: null, reason: "no_test_script"`)
  - `Cargo.toml` → Rust stack (`cargo test`)
  - `*.csproj` / `*.sln` → .NET stack (`dotnet test`)
  - `test.command`: root command if root component has one, else `null` with `test.components` carrying the individual component commands.
  - `evals.runnerAllowlist`: union of all component test command prefixes.
- **Container Isolation (`evals.isolation`)**:
  - Matches `Dockerfile`, `Dockerfile.*`, `docker-compose*.yml`, `compose*.yaml` at any scanned depth → `"docker"`.
  - No container definitions → `"process"`.
- **Continuous Integration (`ci.provider` and `ci.evidence`)**:
  - Workflows in `.github/workflows/*.yml` → `"github"`, recording `ci.evidence: [list of matched workflows]`.
  - No workflows → `"none"`, `ci.evidence: []`.
- **Delivery Mode (`delivery.mode` and `delivery.evidence`)**:
  - Deploy markers (`vercel.json`, `fly.toml`, `render.yaml`, `Procfile`, `k8s/`, `helm/`, or `Dockerfile` + deploy workflow) → `"platform"`, recording `delivery.evidence: [list of matched files]`.
  - Otherwise → `"none"`, `delivery.evidence: []`.
- **Fix Loop (`fixLoop`)**:
  - `maxAttempts`: 3 (clamped between 1 and 10).
  - `escalateOn`: closed list `["attempts_exhausted", "secret_or_credential", "production_deploy", "scope_change", "dependency_cooldown"]`.
### 2. Operator Confirmation on Undetected Fields

All automatically detected fields are flagged with `"detected": true`.
If any field could not be detected (e.g., repository has multiple test suites or custom runners with `"detected": false`), ask the operator once for clarification.

Operator overrides are marked with `"detected": false`.

### 3. Idempotent Profile Persistence & Automatic Cérebro Publication

Persist the profile and publish it automatically to the Obsidian project cérebro:

```bash
node scripts/harness-project-profile.mjs --root <path-to-repo> --write --publish-cerebro
```

The write operation is atomic and idempotent:
- Re-running `--write` on an existing profile merges new detections while strictly preserving any section or field where `"detected": false` was set by an operator.
- `fixLoop.maxAttempts` is automatically clamped within the valid range of 1 to 10.
- Re-run whenever `--detect` differs from the stored profile in `agent-os/project-profile.json`.

### 4. Cérebro Publication Status & Self-Correction Flow

The `--publish-cerebro` flag outputs a structured JSON envelope:
`{ status, files, lintFindings, attempts }`

Handle the output status accordingly:
- `status: "published"`: Done. Profile rules and decision note are successfully published to the vault and clean in lint.
- `status: "not_registered"`: Done. The repository is not registered in `projects.json` (no cérebro configured). Mention the `novo-projeto` skill if the user wants to set up a project cérebro.
- `status: "needs_agent_fix"`: The agent fixes the listed notes inside staging at `~/.task-pipeline/staging/<name>/` (never directly in the vault; never edit inside `<!-- gerado -->` or `<!-- harness-profile -->` blocks). Re-run the same command (`--write --publish-cerebro`), up to a maximum of 3 attempts. If lint findings persist after 3 attempts, escalate with the findings.
- `status: "blocked_secret"`: Secrets detected by preflight scanning. Escalate immediately as `secret_or_credential`; do not publish to the vault.


Wrong profile command (exit 127, command not found, missing script): correct `agent-os/project-profile.json` marking the section with `"detected": false`, keep `evals.runnerAllowlist` aligned with the same runner, and re-run `node scripts/harness-project-profile.mjs --root . --write --publish-cerebro` in the same session so the cérebro hub does not stay stale. If the status reports the command was rejected in the hub, the runner is not in the trusted catalog: escalate as `scope_change`, do not edit the catalog. Any edit to `agent-os/project-profile.json`, manual or self-correction, is followed by `--write --publish-cerebro`.

### 5. Bootstrapping Evals and Security Contract

Bootstrap `evals/dataset.json` from git history:
```bash
node scripts/harness-eval-runner.mjs --root <path-to-repo> --mine --write
```
This mines bugfix commits with accompanying tests across repository history into `evals/dataset.json`. Each proven task is validated in an isolated temporary worktree without mutating the working tree.

Declare security validation targets in `agent-os/security-contract.json`:
- Declare executable test entries under `protectedRoutes.authzTests`, `idor.regressionCases`, or `tenantIsolation.tests` using:
  ```json
  {
    "path": "tests/authz/tenant.test.ts",
    "command": "node --test tests/authz/tenant.test.ts",
    "requires": [{ "host": "127.0.0.1", "port": 5432 }],
    "envFile": ".env.test",
    "requireNoSkips": true
  }
  ```
- Fields:
  - `requires`: array of `{ host, port }` service endpoints. The runner performs a 1500ms TCP probe; unreachable services cause fail-closed `status: "unavailable"` (exit 2).
  - `envFile`: path relative to repository root (must resolve strictly inside root; paths escaping root are rejected with exit 2). Keys matching `^[A-Z_][A-Z0-9_]*$` are merged into the child process environment and never printed to stdout.
  - `requireNoSkips`: when `true`, any skipped test (Go `--- SKIP`, pytest `\b\d+ skipped\b`, Node `#/# skipped` or `# SKIP`) is treated as a failure (count +1), logs a summary to stderr, and automatically appends `-v` to `go test` if missing.
- Set `tenantIsolation.rls.required: true` when PostgreSQL row-level security must be actively verified on tenant tables via `psql` or Docker.
- The gate runner (`harness-security-contract.mjs --run --metric`) checks required background services and executes test targets through the project's trusted runner catalog.
- **Never invent tests**: If the repository has no security contract or executable tests, record an explicit gap with the status returned by the tool (`status: "unavailable"` when the contract file is absent, or `status: "not_applicable: no executable security evidence declared"` with exit 0 when the contract declares no runnable tests). Never create fake or mock test files to pass the gate.

### 6. Unified Onboarding Automation

The portable onboarding CLI (`scripts/harness-project-onboarding.mjs`) orchestrates this setup flow end-to-end:

```bash
node "<harnessHome>/scripts/harness-project-onboarding.mjs" --root "<path-to-repo>" --write [--json]
```

It detects the profile, publishes to cérebro, mines historical evals into `evals/dataset.json`, drafts `agent-os/security-contract.json`, and installs Phase A thresholds with absolute, quoted command paths and dynamic harness resolution without machine-specific usernames.