---
name: maestri-workspace-team
description: "Provision or reuse the ten-role OMP team in the active Maestri workspace. Use when provisioning or inspecting the standard OMP workspace roster. Do NOT use for automatic recruitment on role load or outside Maestri workspaces."
---

# Maestri workspace team

This skill defines how to provision and reuse the standard ten-role OMP team in the active Maestri workspace.

## Core contract and role model

The team consists of ten members.
1. Maestro or OMP Orchestrator (existing session, member 1)
2. OMP Explorer (read-only recon)
3. OMP Architecture Advisor (read-only advisory)
4. OMP Implementer (code changes and implementation)
5. OMP Backend Infra Engineer (default specialist) or OMP Vue Engineer (specialist when project uses Vue)
6. OMP Test Automation Engineer (test suite authoring and execution)
7. OMP Code Reviewer (read-only code review)
8. OMP Security Analyst (read-only security analysis)
9. OMP Refiner (read-only rule refinement)
10. OMP Judge (read-only gate verification and receipts)

Role loading never recruits terminals. Merely loading this skill or reading role documentation performs zero mutations. Recruitment occurs only upon explicit operator consent, provided when invoking the `/maestri-team` slash command or executing the CLI with the `--apply` flag. If the invocation includes `--dry-run` or `preview`, only the preflight dry-run executes and recruitment is never performed.

## Security boundaries and isolation

Maestri role prose provides operational instructions, not a security sandbox boundary. Newly recruited read-only terminals receive a runtime tool allowlist at launch via the `--command` option:
```bash
--command "omp --tools=read,grep,glob"
```

Because `maestri list` reports only agent names and role labels without effective launch flags or active tools, existing read-only roles reused by label matching cannot be authoritatively attested and are treated as unverified. Operators must not assume pre-existing reused roles run in an enforced sandbox.

Read-only roles include Explorer, Architecture Advisor, Code Reviewer, Security Analyst, Refiner, and Judge. Write permissions and PREVC lifecycle transitions remain strictly with the orchestrator and designated implementer roles.

Communication topology must remain minimal. Do not construct a blanket all-peer mesh where every agent links to every other agent. Configure only necessary pairwise links required for active tasks.

The CLI executes actions using subprocess argv arrays without a shell wrapper. It does not store credentials or execute git commits, pushes, or quality gates. No product source or CI files are modified; Maestri creates terminal metadata under the workspace.

Workspaces remain strictly isolated. Connected agents belonging to other workspaces are ignored. The CLI neither counts nor alters terminals in other workspaces.

## Provisioning procedure

When the user invokes `/maestri-team` or requests workspace team setup, execute these steps in order.

### 1. Precondition verification

Confirm Maestro is active and responsive.
- Verify Maestro CLI availability using `maestri list` and `maestri workspace list`.
- If Maestro is not enabled or the current session is not Maestro, stop immediately with an actionable message.
- Verify the active workspace and confirm the `omp` preset and all required role definitions exist using `maestri preset list` and `maestri role list`.
- If any prerequisite is missing, fail closed before recruiting any agents.

### 2. Specialist selection and workspace root discovery

- Identify the active workspace root path via `--root "<active-workspace-root>"`. Always quote the root argument to safely support spaces in project directories.
- Inspect project files or existing analysis to select the specialist profile.
  - If the project indicates Vue or Nuxt usage (such as `vue` dependencies in package configuration or `.vue` source files), choose `--specialist vue`.
  - Otherwise, choose `--specialist backend-infra`.

### 3. Preflight check with dry run

Run the CLI in dry-run mode to inspect planned roster decisions without modifying workspace state.
```bash
node ~/.omp/agent/scripts/harness-maestri-team.mjs --dry-run --root "<active-workspace-root>" --specialist <backend-infra|vue> --json
```

Evaluate the JSON output.
- Identify existing connected same-workspace roles marked for reuse.
- Identify missing roles scheduled for recruitment.
- Ensure no unexpected errors or prerequisite failures are reported.

If the operator invocation contains `--dry-run` or `preview`, present the planned roster decisions and stop immediately. Never proceed to step 4 when `--dry-run` or `preview` is requested.

### 4. Application with apply flag

For standard invocation without `--dry-run` or `preview`, user slash invocation constitutes explicit consent to recruit up to nine billable sessions. Execute the apply step.
```bash
node ~/.omp/agent/scripts/harness-maestri-team.mjs --apply --root "<active-workspace-root>" --specialist <backend-infra|vue> --json
```

Optional model pinning: `--model <provider/model>` (validated against `^[A-Za-z0-9._:/-]+$`) and `--thinking <off|minimal|low|medium|high|xhigh|max|auto>`. Each new recruit then launches with `--command "omp --model=<m> --thinking=<t>"` (read-only roles append `--tools=read,grep,glob`). Find the id with `omp models find <name>`, e.g. `--model google-antigravity/gemini-3.8-flash --thinking high`. Reused terminals are not relaunched.

The CLI performs idempotent recruitment.
- Existing connected same-workspace roles are reused idempotently. Reused read-only roles are unverified because Maestri does not expose launch arguments.
- Missing roles are recruited using `--preset omp --role <name> --dir <root>`.
- Newly recruited read-only roles receive the runtime `--tools` allowlist at launch.
- After each recruit, the current roster is validated.
- If an error occurs mid-process, the created subset is reported and the process stops cleanly.
- Rerunning the command resumes recruitment without duplicating already provisioned roles.
### 5. Onboarding de projeto novo

Após rodar dry-run e apply, inspecione o bloco `onboarding` retornado no JSON:
1. **Harness e governança**: se `missing` contiver `agent-os` ou itens do harness, execute a skill `harness-initializer` para auditar convenções e, com aprovação explícita do operador, aplique `harness-bootstrap`.
2. **Segundo cérebro**: se `registered` for `false` ou `null`, execute `novo-projeto` para cadastrar o repositório em `~/.task-pipeline/projects.json` e execute `cerebro-carga-inicial`. Se já estiver registrado mas desatualizado, execute `cerebro-carga-inicial`.
3. **Políticas e templates**: confirme que `autoConfirm` está `false`, que o template `.github/pull_request_template.md` existe e que `docs/review.md` define as falhas críticas do projeto.

### 6. Reinício de contexto de agentes (`--reset`)

Quando o operador desejar limpar o histórico dos terminais reutilizados sem reiniciar os processos:
```bash
node ~/.omp/agent/scripts/harness-maestri-team.mjs --apply --root "<active-workspace-root>" --reset --json
```
- Envia `/new\n` via `maestri ask` a cada membro já conectado (exceto Maestro).
- Preserva os processos em execução e os limites de ferramentas (`--tools=read,grep,glob`).
- Membros recém-recrutados não recebem reset por já iniciarem com contexto vazio.
- O Maestro permanece ativo na sessão corrente e deve reler `docs/harness/session-handoff.md`.
- `--dry-run --reset` apenas simula a lista de membros a resetar.

## Examples

### Example 1: Dry run preflight for backend service

```bash
node ~/.omp/agent/scripts/harness-maestri-team.mjs --dry-run --root "C:/work/backend-service" --specialist backend-infra --json
```

Output illustrates planned reuse of existing members and planned recruitment for missing members.

### Example 2: Applying team provisioning for Vue application

```bash
node ~/.omp/agent/scripts/harness-maestri-team.mjs --apply --root "C:/work/frontend-app" --specialist vue --json
```

Provisions missing roles, selecting OMP Vue Engineer rather than Backend Infra Engineer.

### Example 3: Repeated invocation

Running the apply command against an already provisioned workspace detects all connected roles, reports zero recruitments needed, and exits cleanly.

## Error handling

### Maestro unavailable

If `maestri` command execution fails or reports Maestro is not enabled:
- Stop immediately without recruiting agents.
- Notify the operator that Maestri runtime is required and provide instructions to start Maestro or run inside an active Maestri workspace.

### Missing preset or role definitions

If the `omp` preset or any required role definition is missing:
- Abort immediately with exit status indicating the missing assets.
- Direct the operator to install or restore the OMP role definitions before retrying.

### Workspace root mismatch or missing directory

If the declared `--root "<active-workspace-root>"` directory does not match the active workspace or does not exist:
- Abort before any mutation.
- Report the invalid root path to the operator.

### Partial recruitment failure

If network or runtime failure interrupts recruitment partway:
- The CLI reports the subset of successfully recruited roles.
- The operator can safely rerun the apply command once the underlying issue is resolved. The rerun reuses all successful recruits and provisions only the remaining roles.
