---
name: maestri-team
description: "Provision or reuse the standard ten-role OMP team in the current Maestri workspace via skill://maestri-workspace-team and harness-maestri-team.mjs."
---

Execute the `skill://maestri-workspace-team` skill.

This command provisions or reuses the standard ten-role OMP team in the current Maestri workspace.

## User invocation and consent

Executing this slash command provides explicit operator consent to recruit up to nine billable agent sessions in the active Maestri workspace. The command does not run before user invocation. Loading roles or viewing documentation never recruits terminals.

If the command invocation contains `--dry-run` or `preview`, the command runs only preflight discovery and never recruits terminals or calls `--apply`.

## Team roster

The provisioned roster contains ten profiles.
1. Maestro or OMP Orchestrator (current session, member 1)
2. OMP Explorer (read-only recon)
3. OMP Architecture Advisor (read-only architecture advisory)
4. OMP Implementer (implementation and coding)
5. OMP Backend Infra Engineer (default specialist) or OMP Vue Engineer (selected for Vue projects)
6. OMP Test Automation Engineer (test automation and verification)
7. OMP Code Reviewer (read-only review)
8. OMP Security Analyst (read-only security analysis)
9. OMP Refiner (read-only rule refinement)
10. OMP Judge (read-only verification gate receipts)

## Execution procedure

When invoked, the command follows these steps.

1. Confirm Maestro is active. If Maestro is not enabled or the current session is not Maestro, halt immediately with an actionable error message.
2. Resolve the active workspace root path via `--root "<active-workspace-root>"`. Quote the path to handle spaces in project directories.
3. Analyze the active project briefly or consume prior codebase analysis.
   - Select `--specialist vue` if the project uses Vue or Nuxt.
   - Select `--specialist backend-infra` for backend, systems, or standard projects.
4. Execute preflight validation with dry run.
   ```bash
   node ~/.omp/agent/scripts/harness-maestri-team.mjs --dry-run --root "<active-workspace-root>" --specialist <backend-infra|vue> --json
   ```
5. Check for dry-run or preview mode. If the operator invocation contains `--dry-run` or `preview`, present the planned roster report and stop here. Never execute `--apply`.
6. Execute recruitment with apply for standard invocations.
   ```bash
   node ~/.omp/agent/scripts/harness-maestri-team.mjs --apply --root "<active-workspace-root>" --specialist <backend-infra|vue> --json
   ```
   When the operator names a model (e.g. "gemini 3.8 flash high"), add `--model <provider/model> --thinking <level>` to both the dry run and the apply (e.g. `--model google-antigravity/gemini-3.8-flash --thinking high`; resolve the id with `omp models find <name>`). Every new recruit then launches `omp --model=… --thinking=…`; read-only roles keep `--tools=read,grep,glob`. Reused terminals keep whatever model they run.
7. Inspecionar o bloco `onboarding` no JSON retornado:
   - Se `missing` apontar ausência de `agent-os` ou do harness: rodar `harness-initializer` (auditoria) e, com aprovação do operador, `harness-bootstrap`.
   - Se `registered` for `false` ou `null`: rodar `novo-projeto` (registro no `~/.task-pipeline/projects.json`) e depois `cerebro-carga-inicial`; se já registrado e sem cérebro atualizado, rodar `cerebro-carga-inicial`.
   - Revisar se `autoConfirm` está `false`, se `.github/pull_request_template.md` existe e se `docs/review.md` cobre as falhas críticas da área.

## Reinício de contexto (`--reset`)

Para reiniciar o contexto dos agentes sem matar os processos nem perder os limites de permissão (`--tools`):
```bash
node ~/.omp/agent/scripts/harness-maestri-team.mjs --apply --root "<active-workspace-root>" --reset --json
```
- Envia `/new` via `maestri ask "<nome>" --raw "/new\n"` a cada membro reutilizado e conectado (timeout curto por membro).
- Membros recém-recrutados não precisam de reset pois já iniciam limpos.
- O Maestro nunca é resetado e continua na sessão atual; deve reler `docs/harness/session-handoff.md`.
- `--dry-run --reset` apenas lista quem seria resetado, sem emitir comandos reais.

## Security and operational rules

- Connected agents from other workspaces are ignored. Only same-workspace roles are evaluated or reused.
- Name collisions do not cause role duplication or replacement.
- Avoid configuring a blanket all-peer mesh. Establish only necessary pairwise links.
- Maestri role prose is operational guidance, not a security sandbox. Newly recruited read-only roles receive runtime tool restriction flags via `--command "omp --tools=read,grep,glob"`.
- Because Maestri does not expose launch commands of existing terminals, reused matching read-only roles cannot be attested and are reported as unverified. Operators should not treat pre-existing reused terminals as an enforced sandbox.
- The CLI invokes subprocesses directly with argv arrays and never invokes a shell.
- No product source or CI files are modified; Maestri creates terminal metadata under the workspace. No git branches, commits, pushes, or quality gates are run by this command.
- First invocation creates the roster. Repeated invocations detect existing connected roles and recruit nothing.
- If recruitment fails partway, the created subset is reported and running the command again resumes without duplicating members.
