---
sidebar_position: 0
---

# Como os planos são feitos

> **Estado PREVC:** `prepare → plan` — o pipeline termina em `awaiting_plan_approval`, o único gate de aprovação do planejamento.

O pipeline de planejamento estrutura a fase Prepare do PREVC em uma sequência determinística de dimensionamento, detalhamento e decomposição em tickets de execução, garantindo planos consistentes antes de qualquer escrita de código.

## O pipeline (`/planner`)

O `planner` planeja em três passos, dimensionando a profundidade ao trabalho:

```text
/prevc prepare <objetivo>
        |
        v
1. SIZE-GATE  -> wayfinder  (só trabalho grande/nebuloso/cross-subsystem)
        |          mapa de decision-tickets; resolve as decisões antes
        v
2. SHARPEN    -> grill-with-docs (modo AUTO)
        |          auto-entrevista + domain-modeling, decide sozinho,
        |          rotula assumptions, escreve ADRs/glossário
        v
3. DECOMPOSE  -> to-tickets = a LANE TABLE
        |          tracer-bullet vertical slices com blocking edges
        v
awaiting_plan_approval  (o operador revisa e aprova uma única vez)
```

### 1. Size-gate → wayfinder (só quando grande)

Se o esforço é maior que uma sessão de agent, nebuloso ou cruza subsistemas, o `wayfinder` desenha um **mapa de decision-tickets** e resolve as decisões abertas primeiro. Trabalho normal **pula** esse passo — a própria regra do wayfinder é "sem fog, sem mapa".

### 2. Sharpen → grill-with-docs (AUTO)

O `grill-with-docs` roda em **modo AUTO**: não pausa para perguntar ao operador. Percorre cada ramo da árvore de decisão e **toma a própria resposta recomendada**, resolvendo a partir do código, ADRs, `CONTEXT.md` e requisitos. Cada resposta vira uma decisão; as que ele resolveu por conta própria são **rotuladas como assumptions** para o operador ver na revisão. ADRs e glossário são escritos via `domain-modeling`.

Ele só escala ao operador em um **blocker real**: ambiguidade que nenhuma fonte resolve, decisão difícil de reverter sem default defensável, ou mudança de escopo.

### 3. Decompose → to-tickets = a lane table

O `to-tickets` quebra o plano afiado em **tracer-bullet vertical slices** dentro de `agent-os/specs/<slug>/tickets/`, cada um declarando suas blocking edges. **Um ticket tracer-bullet é uma lane**: vertical, do tamanho de uma janela de contexto, com um único dono. De cada ticket sai o conjunto exato de arquivos da lane, as dependências (as blocking edges) e o comando de verificação.

## Onde os tickets ficam

Backend local-markdown, sem tracker externo:

```text
agent-os/specs/<YYYY-MM-DD-HHMM-slug>/
  spec.md            # do template
  plan.md            # abordagem aprovada
  verification.md    # evidência esperada
  decisions.md       # decisões e assumptions rotuladas
  tickets/           # a lista canônica de tarefas — um arquivo por ticket
    00-map.md        # mapa do wayfinder (só em esforços grandes)
    01-<slug>.md     # ticket (Blocked by: None)
    02-<slug>.md     # Blocked by: 01
  research.md        # (opcional) investigação
  prototype/         # (opcional) protótipo
```

O conjunto `tickets/` **é** a lista de tarefas: o scheduler o lê direto como lane table.

## Execute: implement, sem race

Depois da aprovação, o `scheduler` despacha cada lane para um implementer que segue a disciplina da skill `implement` — TDD nos seams combinados, typecheck e testes por arquivo, suíte completa no fim (veja [Dispatch Paralelo](./parallel-dispatch)).

**Implementers não commitam.** Só o scheduler commita, reconciliando todas as lanes num commit local — assim lanes paralelas nunca correm no git. Uma lane escreve um arquivo por vez.

## Resumo

| Etapa | Entrada | Saída |
|---|---|---|
| Size-gate | Objetivo | Pular ou mapa de decision-tickets |
| Sharpen | Objetivo + código | Decisões + assumptions rotuladas |
| Decompose | Decisões | Lane table (tickets com blocking edges) |
| Aprovação | Lane table | `awaiting_plan_approval` — um único gate |

## O que isto prova e o que não prova

- **O que prova:** que o plano foi decomposto em tickets verticais com dependências explícitas e verificação objetiva aprovada pelo operador.
- **O que não prova:** não garante que requisitos omitidos pelo usuário tenham sido magicamente adivinhados pelo agente.
