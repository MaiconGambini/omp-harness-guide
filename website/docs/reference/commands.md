---
sidebar_position: 1
---

# Comandos

A referência de comandos reúne os comandos globais e scripts utilitários disponíveis no Oh My Pi após a instalação do pacote público em `~/.omp/agent/commands/`. Há duas camadas:

- **Comandos compartilhados pelo contrato:** `/prevc`, `/quality`, `/refine`,
  `/harness-session-start` e `/harness-clean-handoff` expressam lifecycle,
  qualidade, continuidade e confirmação independentemente do adaptador
  metodológico.
- **Comandos e superfícies nativas do OMP:** `/planner`, `/harness-status`,
  `/score`, `/capabilities`, `/fallback`, `/trace`, `/harness-security-scan`,
  `/harness-mcp-inventory`, `/harness-context-budget`, `/maestri-team` e `/agent`
  usam o scheduler, observabilidade ou coordenação do runtime Oh My Pi. Não há
  comandos públicos `omp:*`.

Os nomes começam com `/` quando invocados no chat do Oh My Pi (por exemplo,
`/prevc`). A lista abaixo agrupa os comandos por função; a separação acima
indica a camada a que cada comando pertence.

## Visão geral por família

### Ciclo de vida e qualidade

| Comando | Quando usar | O que faz |
|---|---|---|
| `/prevc` | Qualquer trabalho significativo | Controla o ciclo de vida completo: prepare, plan, execute, validate, judge, refine, confirm e handoff. É o único escritor da fase durável do ciclo de vida (via `harness-prevc-state.mjs`) |
| `/quality` | Antes de um commit (ou a qualquer momento) | Roda `harness-quality-gate.mjs --mode $ARGUMENTS` (padrão `local`; use `full` antes de commit) e `harness-risk-router.mjs`; imprime a tabela de métricas e o tier com a razão. Exit 1 = corrija a métrica, nunca relaxe o threshold; exit 2 = blocker do harness. Métrica indisponível ou relatório ausente/desatualizado = gap nomeado, não pass |
| `/refine` | Depois do Judge, ou para registrar nota do operador com `--note` | Dispara o refiner read-only sobre a janela de findings e roteia propostas por blast radius; não escreve nada. Com `--note`, registra um finding `operator_note` |

### Coordenação, time e persona

| Comando | Argumentos | Quando usar | O que faz |
|---|---|---|---|
| `/maestri-team` | `[--dry-run] [--apply] [--reset] [--root <dir>] [--specialist <backend-infra\|vue>] [--model <id>] [--thinking <level>]` | Orquestração multi-agente no Maestri | Provisiona ou reutiliza o time padrão de dez papéis no workspace ativo do Maestri via `skill://maestri-workspace-team` e `harness-maestri-team.mjs`. Exige consentimento explícito do operador para recrutar terminais |
| `/agent` | `<nome-do-perfil> \| clear \| reset` | Alternar ou inspecionar o papel ativo no OMP | Adota o perfil de agente em `~/.omp/agent/agents/<nome>.md`, gravando o papel ativo e ajustando instruções e capabilities da sessão |

### Comandos nativos do OMP

| Comando | Argumentos | Quando usar | O que faz |
|---|---|---|---|
| `/planner` | `<objetivo>` | Planejar trabalho significativo no OMP | Pipeline size-gated do papel Planning do scheduler: `wayfinder` para esforços grandes, `grill-with-docs` em AUTO e `to-tickets` para decompor; termina em `awaiting_plan_approval` |
| `/harness-spec` | `<slug ou objetivo>` | Feature média ou grande no OMP | Cria ou propõe uma spec Agent OS em `agent-os/specs/<slug>/` a partir dos templates globais |
| `/propose-skill` | `[--activate <nome>]` | Processo recorrente no histórico do OMP | Analisa sequências repetidas de comandos e propõe uma skill gerada. A ativação (`--activate`) é manual, valida a candidata e instala somente após a ação explícita do operador; nunca há autoativação |
| `/trace` | `--verify \| --read \| --prune \| --record` | Inspecionar o rastreio nativo do OMP | Verifica (`--verify`), lê (`--read`), poda (`--prune`) ou grava (`--record`) o envelope redigido de eventos `pi.on` |
| `/harness-status` | *(nenhum)* | Verificar readiness operacional | Imprime git, fase PREVC durável, handoff, orçamento de contexto, segurança e as superfícies observáveis; cada superfície ausente vira `unavailable` nomeado |
| `/score` | *(nenhum)* | Ver a pontuação agregada | Mostra o agregado 0-10 derivado dos relatórios de gate mais recentes; nunca é entrada de gate |
| `/capabilities` | *(nenhum)* | Conferir fatos de capacidade | Resume os fatos multimodais por papel de modelo a partir do probe de capacidades |
| `/fallback` | *(nenhum)* | Conferir eventos de fallback | Resume o log de eventos de fallback de provedor |
| `/harness-security-scan` | *(nenhum)* | Auditar superfície de segurança | Escaneia o harness e o projeto buscando riscos de supply-chain e segredos; resume PASS/WARN/FAIL sem imprimir valores |
| `/harness-mcp-inventory` | *(nenhum)* | Inventariar MCPs | Lista servidores MCP, detecta drift e sinaliza chaves com segredo sem expor valores |
| `/harness-context-budget` | *(nenhum)* | Auditar carga de contexto | Reporta o orçamento de contexto de skills, comandos e MCPs; recomenda lazy-loading |

### Sessão e projeto

| Comando | Quando usar | O que faz |
|---|---|---|
| `/harness-session-start` | No início de toda sessão | Descobre instruções raiz, estado de progresso, feature state e caminho de startup; roda o baseline se seguro; declara a task ativa |
| `/harness-clean-handoff` | No fim de toda sessão | Coleta evidência, blockers, notas de progresso, handoff e git status; devolve um relatório de handoff. Não marca feature state nem afirma conclusão |
| `/harness-init` | Primeira vez em um projeto | Audita as camadas do harness sem escrever nada; produz um gap report com correções recomendadas |
| `/harness-bootstrap` | Instalar o pacote completo do harness | Propõe o pacote completo (AGENTS.md, feature_list.json, docs/harness, agent-os) e escreve apenas após confirmação |
| `/harness-standards` | Antes de planejar ou implementar | Detecta o stack e carrega standards de projeto e globais; devolve perfis de risco, validação, permissão e skills aplicáveis |

## Validar e instalar o pacote público

O pacote real está em `omp/agent/`; não há scripts npm `omp:*` nem exportador
público. A distribuição não anuncia release semântica: use uma revisão Git
revisada e o manifesto com hashes para identificar o conteúdo. No checkout,
rode o validator e então copie a árvore para uma instalação limpa:

```powershell
node scripts/validate-public-subset.mjs --check-manifest
$target = Join-Path $env:USERPROFILE ".omp\agent"
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -Path ".\omp\agent\*" -Destination $target -Recurse -Force
```

## Scripts do harness

Os utilitários Node ficam em `~/.omp/agent/scripts/` e executam diretamente:

| Script | Uso representativo | Propósito |
|---|---|---|
| `harness-prevc-state.mjs` | `node ~/.omp/agent/scripts/harness-prevc-state.mjs init\|transition\|inspect` | Gerencia e persiste a fase durável do ciclo de vida PREVC |
| `harness-quality-gate.mjs` | `node ~/.omp/agent/scripts/harness-quality-gate.mjs --mode local\|full` | Executa o gate medido, calcula cobertura de medição e gera relatório |
| `harness-risk-router.mjs` | `node ~/.omp/agent/scripts/harness-risk-router.mjs` | Avalia o blast radius do diff e determina o tier de revisão (`auto`, `sampling`, `full`) a partir do risco (`low`, `medium`, `high`) |
| `harness-flow-metrics.mjs` | `node ~/.omp/agent/scripts/harness-flow-metrics.mjs --root <repo> --since 28d --json` | Coleta métricas de fluxo de código: commits, reversões e correções posteriores |
| `harness-maestri-team.mjs` | `node ~/.omp/agent/scripts/harness-maestri-team.mjs --dry-run\|--apply [--reset]` | Recruta e gerencia idempotentemente o time de dez papéis no Maestri |
| `harness-coverage-label.mjs` | *(módulo de suporte / importação)* | Calcula rótulo de cobertura de medição e sinaliza minoria de métricas medidas |
| `harness-delivery-preflight.mjs` | `node ~/.omp/agent/scripts/harness-delivery-preflight.mjs --root <repo>` | Valida pré-requisitos de entrega e autorização sem realizar deploy |
| `harness-project-onboarding.mjs` | `node ~/.omp/agent/scripts/harness-project-onboarding.mjs --root <repo>` | Executa o onboarding automático de perfil de projeto e checagem de harness |
| `harness-project-profile.mjs` | `node ~/.omp/agent/scripts/harness-project-profile.mjs [--detect] [--write] [--publish-cerebro] [--json] [--root <dir>]` | Extrai e mantém o `agent-os/project-profile.json` com stack, comandos e políticas de loop |
| `harness-trace.mjs` | `node ~/.omp/agent/scripts/harness-trace.mjs --verify\|--read\|--prune\|--record` | Gerencia o stream redigido de auditoria e telemetria de eventos |
| `harness-status.mjs` | `node ~/.omp/agent/scripts/harness-status.mjs` | Relata readiness de git, PREVC, handoff, orçamento de contexto e guardrails |
| `harness-size-gate.mjs` | `node ~/.omp/agent/scripts/harness-size-gate.mjs` | Avalia tamanho de lote de mudanças para prevenir PRs hipertrofiados |
| `harness-skill-lint.mjs` | `node ~/.omp/agent/scripts/harness-skill-lint.mjs` | Valida formatação e conformidade estrutural de skills instaladas |

### Exemplo real de execução: métricas de fluxo

Ao inspecionar a estabilidade do fluxo de desenvolvimento sem caminhos privados:

```bash
node ~/.omp/agent/scripts/harness-flow-metrics.mjs --root <projeto> --since 28d --json
```

Saída real retornada pelo script:

```json
{
  "status": "ok",
  "root": "<projeto>",
  "since": "28d",
  "definition": "fixFollowups = commit fix/hotfix/bugfix que altera arquivo mexido por outro commit nos 7 dias anteriores (proxy de correção posterior; não prova merge).",
  "weeks": [],
  "totals": {
    "commits": 0,
    "reverts": 0,
    "fixFollowups": 0,
    "revertRatio": 0,
    "followupRatio": 0
  }
}
```

## Passo a passo dos comandos principais

### 1. Trabalhar em algo significativo — `/prevc`

```text
/prevc prepare <objetivo>
```

- Executa a skill global `prevc-workflow`, o único controlador do ciclo de vida para trabalho significativo.
- `prepare <objetivo>` faz descoberta, classifica o risco (`harness-risk-router.mjs`) e cria um plano via `planner`, parando em `awaiting_plan_approval` na conversa.
- Nada é editado antes da aprovação explícita; a exceção é o próprio pipeline de planejamento (artefatos canônicos em `agent-os/specs/<slug>/`).
- Operações rotineiras de baixo risco (session-start, checagens de status, instalação explícita de dependência, formatação, reparos estreitos de teste) passam por um fast path com verificação objetiva, sem a cerimônia do PREVC.

```text
/prevc run
```

- Aceita aprovação explícita do operador em linguagem normal ou `/prevc run`; não exige goal ID.
- Uma instrução do operador para executar um plano ou spec **nomeado** de ponta a ponta já é a autorização do run autônomo: sem aprovação por task; o run para uma única vez em `awaiting_confirmation` para o spec inteiro.
- Automatiza Execute → Validate → Judge dentro do escopo aprovado. O `scheduler` despacha lanes via `task` (uma onda `tasks[]`).
- Preserva os caminhos de risco `low`, `medium`, `high` e `untrusted`: medium+ exige evidência de contexto/segurança ou skip documentado; high/untrusted exige reconhecimento explícito de risco antes de executar.
- Nunca faz push, deploy, troca de branch ou operações Git remotas automaticamente — o operador autoriza cada uma.

### 2. Time no Maestri — `/maestri-team`

```text
/maestri-team
```

- Invoca `harness-maestri-team.mjs` com `--dry-run` para inspecionar os agentes existentes no canvas e exibir o relatório prévio.
- Requer consentimento explícito do operador para rodar com `--apply`, evitando abertura desnecessária de novas sessões de modelo faturadas.
- Suporta `--reset` para enviar `/new` a cada terminal reutilizado sem matar os processos ou perder restrições de permissão `--tools`.

### 3. Seleção de persona — `/agent`

```text
/agent spec-lead
```

- Valida a existência de `~/.omp/agent/agents/spec-lead.md`, registra o nome no marcador de persona ativa e adota as instruções do perfil na sessão.
- Com `/agent clear`, remove o marcador ativo e retorna a sessão às instruções padrão do harness.

## O que isto prova e o que não prova

- **O que prova:** comandos fornecem pontos de entrada uniformes para o ciclo de vida PREVC, verificações estáticas, auditorias sem efeito colateral e coordenação entre agentes. Os scripts executam inspeções determinísticas sobre o estado do repositório.
- **O que NÃO prova:** a invocação de um comando não garante por si só que o código implementado esteja correto ou livre de regressões. O comando `/quality` com veredito favorável indica aprovação nas métricas configuradas, mas métricas em estado `unavailable` ou `not_configured` representam lacunas não medidas, e não evidência de correção.

## Páginas relacionadas

- [Skills e Agentes](./skills.md) — Relação completa de perfis de subagente e capacidades lazy-loaded.
- [Artefatos do Harness](./artifacts.md) — Documentação dos esquemas de estado, contratos e recibos.
- [Equipe no Maestri](../guides/maestri-team.md) — Guia de operação da equipe multi-agente de dez papéis.
