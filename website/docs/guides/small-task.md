---
sidebar_position: 1
---

# Tarefa Pequena

> **Estado PREVC:** `prepare → execute → validate → confirm` — até 3 arquivos, sem scheduler nem cerimônia de spec.

Este guia mostra o fluxo para tarefas de escopo óbvio e até 3 arquivos.

## Quando usar o modo rápido

Use quando o prompt tem:

- Uma sentença clara.
- Escopo óbvio (1-3 arquivos).
- Nenhuma ambiguidade de design.

## Exemplo

**Prompt:** `Adiciona um endpoint GET /api/health`

**Fluxo:**

1. `/harness-session-start` — lê o estado atual, declara a task ativa.

2. `/prevc prepare Adiciona um endpoint GET /api/health`
   - Plan: escopo (1 arquivo), AC (`curl retorna 200`), non-goals.
   - Operator approval: "sim".

3. Execute — cria o arquivo com o endpoint.

4. Validate:
   - Typecheck: OK.
   - Testes da área: OK.
   - Curl /api/health: retorna o payload esperado.
   - Gate local (`/quality`): OK.

5. Judge — recibo `accept`.

6. Confirm — feature vai para `passing` com evidência.

7. Handoff — `/harness-clean-handoff` registra a conclusão.

**Tempo:** ~2-5 minutos.

## O que NÃO fazer

- Não pular a verificação. Mesmo uma tarefa de 2 minutos precisa de evidência.
- Não expandir o escopo. Se perceber que precisa de mais, pare, planeje de novo e peça aprovação.
