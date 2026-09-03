---
sidebar_position: 1
---

# Comandos

Comandos globais disponíveis no Oh My Pi após a instalação do pacote público,
instalados em `~/.omp/agent/commands/`. Há duas camadas:

- **Comandos compartilhados pelo contrato:** `/prevc`, `/quality`, `/refine`,
  `/harness-session-start` e `/harness-clean-handoff` expressam lifecycle,
  qualidade, continuidade e confirmação independentemente do adaptador
  metodológico.
- **Comandos e superfícies nativas do OMP:** `/planner`, `/harness-status`,
  `/score`, `/capabilities`, `/fallback`, `/trace`, `/harness-security-scan`,
  `/harness-mcp-inventory` e `/harness-context-budget` usam o scheduler,
  observabilidade ou coordenação do runtime Oh My Pi. Não há comandos públicos
  `omp:*`.

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

### Comandos nativos do OMP

| Comando | Quando usar | O que faz |
|---|---|---|
| `/planner` | Planejar trabalho significativo no OMP | Pipeline size-gated do papel Planning do scheduler: `wayfinder` para esforços grandes, `grill-with-docs` em AUTO e `to-tickets` para decompor; termina em `awaiting_plan_approval` |
| `/harness-spec` | Feature média ou grande no OMP | Cria ou propõe uma spec Agent OS em `agent-os/specs/<slug>/` a partir dos templates globais |
| `/propose-skill` | Processo recorrente no histórico do OMP | Analisa sequências repetidas de comandos e propõe uma skill gerada. A ativação (`--activate`) é manual, valida a candidata e instala somente após a ação explícita do operador; nunca há autoativação |
| `/trace` | Inspecionar o rastreio nativo do OMP | Verifica (`--verify`), lê (`--read`), poda (`--prune`) ou grava (`--record`) o envelope redigido de eventos `pi.on` |
| `/harness-status` | Verificar readiness | Imprime git, fase PREVC durável, handoff, orçamento de contexto, segurança e as superfícies observáveis; cada superfície ausente vira `unavailable` nomeado |
| `/score` | Ver a pontuação agregada | Mostra o agregado 0-10 derivado dos relatórios de gate mais recentes; nunca é entrada de gate |
| `/capabilities` | Conferir fatos de capacidade | Resume os fatos multimodais por papel de modelo a partir do probe de capacidades |
| `/fallback` | Conferir eventos de fallback | Resume o log de eventos de fallback de provedor |
| `/harness-security-scan` | Auditar superfície de segurança | Escaneia o harness e o projeto buscando riscos de supply-chain e secrets; resume PASS/WARN/FAIL sem imprimir valores |
| `/harness-mcp-inventory` | Inventariar MCPs | Lista servidores MCP, detecta drift e sinaliza chaves com secret sem expor valores |
| `/harness-context-budget` | Auditar carga de contexto | Reporta o orçamento de contexto de skills, comandos e MCPs; recomenda lazy-loading |

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

Os scripts ficam em `~/.omp/agent/scripts/` e executam com Node:

```powershell
node ~/.omp/agent/scripts/harness-prevc-state.mjs init|transition|inspect
node ~/.omp/agent/scripts/harness-quality-gate.mjs --mode local|full
node ~/.omp/agent/scripts/harness-risk-router.mjs
node ~/.omp/agent/scripts/harness-trace.mjs --verify|--read|--prune|--record
node ~/.omp/agent/scripts/harness-findings.mjs --window|--json
node ~/.omp/agent/scripts/harness-score.mjs
node ~/.omp/agent/scripts/harness-status.mjs
node ~/.omp/agent/scripts/harness-redteam-scan.mjs
node ~/.omp/agent/scripts/harness-security-scan.mjs
node ~/.omp/agent/scripts/harness-briefing.mjs
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
- Automatiza Execute → Validate → Judge dentro do escopo aprovado. O `scheduler` despacha lanes via `task` (uma onda `tasks[]`) com `hub`.
- Preserva os caminhos de risco `low`, `medium`, `high` e `untrusted`: medium+ exige evidência de contexto/segurança ou skip documentado; high/untrusted exige reconhecimento explícito de risco antes de executar.
- Nunca faz push, deploy, troca de branch ou operações Git remotas automaticamente — o operador autoriza cada uma.

### 2. Auditar um projeto — `/harness-init`

```text
/harness-init
```

- Executa a skill global `harness-initializer`.
- Detecta a raiz do repo, instruções raiz, estado de progresso, feature state, caminho de startup, camada de Judge/avaliação, skills de harness, postura de segurança, higiene de MCP, orçamento de contexto e worktrees.
- Produz um gap report não-mutatório com correções recomendadas.
- Não cria nem edita arquivos a menos que o usuário aprove uma correção específica.

### 3. Instalar o harness completo — `/harness-bootstrap`

```text
/harness-bootstrap
```

- Executa a skill global `harness-bootstrap`.
- Sempre propõe o pacote completo: `AGENTS.md`, `feature_list.json`, `docs/harness/{progress,session-handoff,sprint-contract}.md`, `docs/{ARCHITECTURE,PRODUCT,RELIABILITY}.md`, `agent-os/judges/project-judge.md`, `agent-os/standards/`, `agent-os/quality-thresholds.json` e `agent-os/specs/_template/`.
- Primeiro audita o repo atual e descobre o caminho de startup.
- Mostra os arquivos exatos a criar, mesclar ou pular e pede confirmação explícita antes de escrever qualquer coisa.

### 4. Iniciar a sessão — `/harness-session-start`

```text
/harness-session-start
```

- Executa a skill global `harness-session-start` como operação de rotina direta, não como trabalho de PREVC.
- Lê o contexto global em `~/.omp/agent/docs/context.md` (ou reporta o gap), a fase PREVC durável com `harness-prevc-state.mjs inspect --json`, o feature state (`feature_list.json`, `agent-os/specs/*/` ou `.specs/features/*/tasks.md`) e o handoff anterior (`docs/harness/session-handoff.md`).
- Descobre o comando de startup e o roda se for seguro.
- Aplica WIP=1 quando há estado durável.
- Termina declarando: Active task, AC (critérios observáveis). Se o startup falhar, registra o erro exato no arquivo de progresso e para.

### 5. Fechar a sessão — `/harness-clean-handoff`

```text
/harness-clean-handoff
```

- Executa a skill global `harness-clean-handoff` como subrotina de handoff do PREVC.
- Coleta evidência, blockers, notas de progresso, um session handoff, resultados de verificação aprovada e git status.
- Apenas o PREVC escreve transições de ciclo de vida após o desfecho do operador.
- Quando invocado diretamente, devolve apenas um relatório de handoff: não marca feature state, não infere confirmação nem afirma conclusão.

### 6. Planejar trabalho significativo — `/planner`

```text
/planner <objetivo>
```

- Executa o pipeline de planejamento no papel de Planning do scheduler: size-gate (`wayfinder` para esforços grandes), refinamento (`grill-with-docs` em AUTO) e decomposição (`to-tickets`).
- Escreve os artefatos canônicos em `agent-os/specs/<slug>/` antes da aprovação.
- Exibe o plano revisável e para em `awaiting_plan_approval`; não edita o produto antes da aprovação.


### 7. Qualidade — `/quality`

```text
/quality
/quality full
```

- Roda o gate medido (`--mode local` por padrão; `--mode full` antes de commit) e o risk router.
- Ambos leem `agent-os/quality-thresholds.json` do projeto.
- Exit 1 = corrija a métrica; exit 2 = blocker do harness; métrica `unavailable` = gap nomeado, nunca pass.
- Para suites grandes, faça sharding entre agents `test-runner` paralelos antes de ler cobertura.

### 8. Refine — `/refine`

```text
/refine
/refine --note "<o que corrigi à mão>"
```

- Reúne a janela de findings, o gate mais recente e o ledger de regras; despacha o `refiner` read-only e encaminha propostas por blast radius.
- Nunca propõe editar `~/.omp/agent/**` ou os scripts do harness; propostas têm como alvo apenas `agent-os/standards/`.
- `--note` registra um finding `operator_note` pelo caminho de escrita única e termina.

### 9. Rastreio — `/trace`

```text
/trace
```

- Verifica a cadeia de hash do envelope (`harness-trace.mjs --verify`), lê registros recentes, poda por retenção ou grava registros de lifecycle a partir dos comandos donos.
- O stream só é evidência de auditoria após `--verify` passar.

## Comandos rápidos (cheat-sheet)

```text
# Projeto desconhecido: auditar sem escrever
/harness-init

# Projeto sem harness: propor instalação completa
/harness-bootstrap

# Início de uma sessão normal
/harness-session-start

# Preparar trabalho significativo
/prevc prepare <objetivo>

# Aprovar o plano preparado (linguagem natural) e executar
/prevc run

# Execução autônoma: instrução para executar um plano/spec nomeado de ponta a
# ponta já é a autorização — sem /prevc run separado, sem aprovação por task

# Pausar ou encerrar com contexto durável
/harness-clean-handoff

# Planejar trabalho significativo
/planner <objetivo>

# Qualidade, refine e observabilidade
/quality              # gate medido + risk router (/quality full antes de commit)
/refine               # fase Refine pós-Judge (ou --note "<o que corrigi à mão>")
/score                # agregado 0-10 derivado dos gates mais recentes
/trace                # verificar/ler/podar o rastreio redigido de eventos

# Diagnósticos globais
/harness-status
/harness-security-scan
/harness-context-budget
/harness-mcp-inventory
```
