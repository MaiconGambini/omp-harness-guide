---
sidebar_position: 3
---

# PREVC

> **Estado PREVC:** `prepare → plan → execute → validate → judge → refine → confirm` — PREVC é o único controlador; nenhum outro componente transiciona a fase.

PREVC é o controlador do ciclo de vida. Agents, skills e extensões fornecem capacidades limitadas; nenhum deles decide sozinho que o trabalho terminou.

## Fases

```text
OPERADOR FAZ UMA SOLICITAÇÃO
        |
        v
PREPARE
        |-- descobre contexto, lê regras, estado e handoff
        |-- classifica o risco (harness-risk-router.mjs)
        |-- planner cria o plano em agent-os/specs/<slug>/
        v
AWAITING_PLAN_APPROVAL
        |-- o operador revisa objetivo, escopo, não-escopo e AC
        v
EXECUTE
        |-- scheduler despacha lanes aprovadas (task + hub)
        |-- WIP=1: uma unidade ativa por vez
        v
VALIDATE
        |-- gate local por lane; gate full sobre a árvore reconciliada
        v
JUDGE
        |-- gate full verde e fresco; judge read-only devolve recibo
        v
REFINE
        |-- refiner read-only propõe melhorias; não escreve e não vota
        v
AWAITING_CONFIRMATION
        |-- o operador revisa evidência e texto literal das propostas
        v
CONFIRM | REVISE | ABORT
        |
        v
HANDOFF
```

## Estado durável

A fase do ciclo de vida é persistente e sobrevive entre sessões. Cada transição é gravada por `harness-prevc-state.mjs` no arquivo de fase durável do projeto, serializada por um lock local do repositório.

```powershell
# início em prepare
node ~/.omp/agent/scripts/harness-prevc-state.mjs init --objective "<objetivo>" --spec agent-os/specs/<slug> --risk <low|medium|high|untrusted>

# transições de fase
node ~/.omp/agent/scripts/harness-prevc-state.mjs transition --to <fase>

# leitura do estado
node ~/.omp/agent/scripts/harness-prevc-state.mjs inspect --json
```

Transições ilegais — aresta proibida, estado ou recibo inválido, gate ausente/desatualizado — são recusadas com código de saída 2 e não escrevem nada. A exceção é o guard de gate vermelho: `validate → judge` contra um gate full vermelho persiste atomicamente o estado `blocked` com a métrica/valor/limiar que bloqueou e ainda assim sai com código 2.

Nenhum agent além do PREVC escreve a fase do ciclo de vida. Agents e skills são capacidades limitadas: não podem transicionar estado, aprovar evidência ou autoconfirmar conclusão.

## Como usar

Inicie o PREVC com a descrição da tarefa:

```text
/prevc prepare Adicionar endpoint de health check
```

- Faz descoberta, classifica o risco e cria o plano via `planner`.
- Para em `awaiting_plan_approval` aguardando sua confirmação.
- Nada é editado antes da aprovação explícita; reconhecimento read-only é sempre permitido. A exceção de escrita pré-aprovação é o próprio pipeline de planejamento: o `planner` pode criar os artefatos canônicos em `agent-os/specs/<slug>/` (spec.md, plan.md, verification.md, decisions.md, tickets/, research.md, prototype/).

Depois que você aprovar (linguagem natural ou):

```text
/prevc run
```

- Executa dentro do escopo aprovado.
- Valida o resultado e entrega o handoff.

Uma instrução para executar um plano ou spec **nomeado** de ponta a ponta já é a autorização do run autônomo: sem aprovação por task; o run para uma única vez em `awaiting_confirmation` para o spec inteiro.

## O gate e o Judge

Antes de `validate → judge`, o gate completo deve estar **verde e fresco**:

```powershell
node ~/.omp/agent/scripts/harness-quality-gate.mjs --mode full
```

O `sourceHash` do relatório deve igualar o hash atual da árvore. Gate ausente, desatualizado, ilegível ou não configurado recusa a transição (exit 2) sem escrever; gate vermelho recusa e persiste `blocked` com o blocker derivado.

O `judge` é um agent **read-only**. Ele devolve um único recibo JSON com: `sourceHash`, relatório do gate, tier, veredito (`accept | revise | block`), pontuação de rubrica, critérios bloqueantes, caminhos de evidência, identidade do judge e data. O PREVC grava o recibo em um arquivo de recibo datado e só então avança para refine. O `sourceHash` do recibo precisa igualar o do último gate full verde.

- `refine → awaiting_confirmation` exige veredito `accept`; `revise`/`block` roteiam para `revision_requested`/`blocked`.
- `awaiting_confirmation → complete` exige `--operator-action confirm` **e** um `docs/harness/session-handoff.md` existente.

## Por que não há auto-conclusão

Uma mensagem do agent dizendo que rodou um comando não é um recibo confiável do runtime. A transição final exige ação explícita do operador (`confirm`) e um handoff durável. Esse limite é intencional: o sistema prefere parar em revisão a registrar uma conclusão que não consegue provar.

## Regras do PREVC

- WIP=1 sempre.
- Conclusão exige evidência real.
- Não tocar arquivos fora do escopo aprovado.
- Trabalho adjacente vira `not_started`.
- Se a verificação falhar, o trabalho é marcado como `blocked`.
- Se o Judge não for `accept`, não confirma.
- Refine não altera o resultado do Judge nem aprova regras.
- Operações rotineiras de baixo risco (início de sessão, checagens de status, instalação explícita de dependência, formatação, reparos estreitos de teste) usam um fast path com verificação objetiva, sem a cerimônia do PREVC.

## Próximo passo

Veja [Harness Contínuo](./continual-harness) para entender findings, Refine e injeção de regras, ou [WIP=1](./wip-one) para a disciplina de execução.
