---
name: harness-bootstrap
description: "Installs or merges the complete Agent OS harness into a repo. Use when adopting the full harness suite after approval. Do NOT use for read-only harness audits (use harness-initializer)."
---
# Harness Bootstrap

Install a full harness into any project, but only after explicit user approval (or pre-authorized when invoked via `novo-projeto`).

## Portable Onboarding Integration

Full bootstrap installs the entire package while preserving project-specific files, then delegates environment detection, baseline setup, and service drafting to the shared onboarding CLI:

```bash
node "<harnessHome>/scripts/harness-project-onboarding.mjs" --root "<path-to-repo>" --write [--json]
```

### Path & Environment Resolution
- `<harnessHome>` dynamically resolves to the installed harness home (`~/.omp/agent` in Oh My Pi, or canonical `~/.config/opencode` in OpenCode).
- Commands must be absolute and quoted to safely support paths with spaces. Never hardcode machine-specific usernames.
- Dry-run is the default when `--write` is omitted.

### Automated Onboarding Execution
The shared onboarding CLI automates four essential artifacts without inventing data:
1. **Project Profile & Cérebro (`agent-os/project-profile.json`)**: Detects test components, containerization, CI, and delivery config via `harness-project-profile.mjs`, publishing automatically to the Obsidian project cérebro (`--publish-cerebro`).
2. **Bounded Eval Mining (`evals/dataset.json`)**: Mines bugfix commits and corresponding test pairs from git history via `harness-eval-runner.mjs --mine --write`. If the repository is fresh or lacks bugfix commits, it leaves an explicit empty dataset/gap; it never fabricates synthetic tests or fake passing suites.
3. **Evidence-Backed Security Contract (`agent-os/security-contract.json`)**: Scans for routes and policy files to draft tenant isolation, authz, and IDOR targets. Entries specify `{ "path": "<file>", "command"?: "<runner>", "requires"?: [{ "host": "127.0.0.1", "port": 5432 }], "envFile"?: "<path>", "requireNoSkips"?: true }`. If no contract or security tests exist, it records an explicit gap with the status returned by the tool (`status: "unavailable"` when the contract file is absent, or `status: "not_applicable"` when no executable tests are declared); it never invents placeholder tests.
4. **Quality Thresholds (`agent-os/quality-thresholds.json`)**: Configures the repository in **Phase A**, where all metrics are set to `observe` except `regression_suite` (which is `blocking`). Existing blocking settings, tighter ratchets, and custom operator fields survive repeat onboarding unchanged; onboarding never downgrades an existing blocker.
## Full Package

Propose these files:

- `AGENTS.md`
- `feature_list.json`
- `docs/harness/progress.md`
- `docs/harness/session-handoff.md`
- `docs/harness/sprint-contract.md`
- `docs/harness/matt-pocock-tracker.md`
- `docs/harness/refine-log.md`
- `docs/harness/findings/README.md`
- `docs/harness/licoes-aprendidas.md`
- `docs/ARCHITECTURE.md`
- `docs/PRODUCT.md`
- `docs/RELIABILITY.md`
- `agent-os/judges/project-judge.md`
- `agent-os/standards/*`
- `agent-os/specs/_template/*`
- `agent-os/quality-thresholds.json`
- `agent-os/learned-rules.json`
- `agent-os/prevc-autonomy.json`
- `agent-os/skills-proposals/`
- `agent-os/dependency-ledger.json`
- `agent-os/redteam-allowlist.json`
- `agent-os/quality-decisions.md`
- `docs/review.md`
- `docs/pull-request.md`
- `.github/pull_request_template.md`
- `docs/review-area.md`

### Install mapping — quality and continual-harness files

| Global template | Installs to |
|---|---|
| `templates/agent-os/quality-thresholds.json` | `agent-os/quality-thresholds.json` |
| `templates/agent-os/quality-decisions.md` | `agent-os/quality-decisions.md` |
| `templates/docs/review.md` | `docs/review.md` |
| `templates/docs/pull-request.md` | `docs/pull-request.md` |
| `templates/agent-os/learned-rules.json` | `agent-os/learned-rules.json` |
| `templates/agent-os/prevc-autonomy.json` | `agent-os/prevc-autonomy.json` |
| `templates/agent-os/skills-proposals/` | `agent-os/skills-proposals/` |
| `templates/agent-os/dependency-ledger.json` | `agent-os/dependency-ledger.json` |
| `templates/agent-os/redteam-allowlist.json` | `agent-os/redteam-allowlist.json` |
| `templates/docs/harness/refine-log.md` | `docs/harness/refine-log.md` |
| `templates/docs/harness/findings/README.md` | `docs/harness/findings/README.md` |
| `templates/docs/harness/licoes-aprendidas.md` | `docs/harness/licoes-aprendidas.md` |
| `templates/github/pull_request_template.md` | `.github/pull_request_template.md` (somente GitHub; para projeto com tracker Azure não crie `.azuredevops/` — registre como pendência futura) |
| `templates/docs/review-area.md` | `docs/review.md` (só se não existir; nunca sobrescrever arquivo existente) |

The thresholds template now carries `learned_rules` (the loop's governing knobs), so the first row
installs the knob block with the thresholds. The ledger itself is the separate row above. Bootstrap
also installs the project-local dependency ledger as a fresh starting point. These ledgers contain no
history, approvals, or rules from another project; they are owned by the target project after install.
Bootstrap also provisions `agent-os/skills-proposals/` for project-local skill proposals mined from failure traces.

Install the thresholds file **at Phase A**, with every metric `observe` except
`regression_suite`. The `memory_available` metric is retired. Never carry another project's numbers into this one. The global template is a
reusable source only and owns no project tree. After bootstrap, recommend
`harness-project-calibration`: calibration is the project rollout boundary and derives the
repository's own thresholds, high-risk paths, and tool-availability list from its layout and
history, then writes that project's `agent-os/quality-thresholds.json`.

The `redteam_findings` and `dependency_cooldown` rows remain observe-only with null baselines until
calibration replaces them with measurements from the target repository.

The `bypass_findings` metric is installed in `observe` with a null command by default (like `skill_lint`). The `skill_lint` metric is `observe` with a null command by default; projects that ship skills set `commands.skill_lint` to: `node "<home>/.omp/agent/scripts/harness-skill-lint.mjs" --root . --json` (the linter resolves `agent/skills` or `.omp/skills`; `--global` lints `~/.omp/agent/skills`); red-team allowlist entries are content-hash keyed, require `reason`/`allowedBy`/`expires`, and are an operator decision, never an agent's.

## Workflow

1. Detect repo root and existing files.
2. Run `harness-stack-router` to identify stack signals.
3. Run `harness-startup-path` to find startup/verification commands.
4. Compare target files with global templates in `~/.config/opencode/templates`.
5. Print a change plan: create, merge, skip, or preserve.
6. Authorization check:
   - If invoked via `novo-projeto`: explicit authorization to create and onboard the project is already granted; proceed directly.
   - If invoked directly: Ask: `Apply this full harness to the current repo? yes/no`. If no, stop with the plan only.
7. Create missing directories and write template files from `templates/` into the repo, strictly preserving existing files and proposing merges where appropriate.
8. Execute shared onboarding CLI: `node "<harnessHome>/scripts/harness-project-onboarding.mjs" --root "<path-to-repo>" --write`.
9. Run discovered startup verification if safe.
10. End with next recommendation: `harness-project-calibration` (to derive project-specific baselines). Recomendar `cerebro-carga-inicial` quando o projeto estiver registrado em `~/.task-pipeline/projects.json`, e `novo-projeto` quando não estiver; ou `/harness-session-start`.
## Rules

- Never write before confirmation (unless pre-authorized by `novo-projeto`).
- Always install the full package, not minimal modes. The shared CLI complements the package; it does not replace full template installation.
- Preserve project-specific content, existing blockers, and operator configuration.
- If a file exists, propose a merge instead of overwriting.
- Do not assume `init.ps1`, `feature_list.json`, or `.specs/project/STATE.md` exist.
- No tests or history means an explicit gap with the status returned by the tool (`unavailable` or `not_applicable`), never an invented test or fake passing suite.
