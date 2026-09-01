---
sidebar_position: 5
---

# WIP=1

> **Estado PREVC:** `execute` — apenas uma unidade ativa por vez; a evidência da fronteira é a feature concluída ou bloqueada com causa exata.

WIP=1 significa que apenas uma unidade de trabalho pode estar ativa por vez. É a disciplina central do harness.

## Por que WIP=1?

| Com WIP=1 | Sem WIP=1 |
|---|---|
| Uma feature é concluída por vez | Várias features são iniciadas e nenhuma termina |
| Bloqueios são registrados com causa exata | Bloqueios se acumulam sem registro |
| O escopo de cada sessão é claro | A sessão pula entre tarefas |
| Handoff descreve exatamente uma próxima ação | Handoff lista várias coisas "em andamento" |

## Como funciona

No Oh My Pi, a ferramenta `todo` mantém a unidade ativa da sessão; `feature_list.json` (ou `tasks.md`) mantém o estado de cada feature:

```json
{
  "id": "feat-001",
  "status": "in_progress",
  "title": "Health endpoint"
}
```

Apenas uma unidade pode estar `in_progress`. Quando termina, vai para `passing` (com evidência) ou `blocked` (com razão exata).

## Durante a execução

Se você descobrir trabalho adjacente durante uma tarefa:

1. Adicione a nova tarefa como `not_started`.
2. Continue trabalhando apenas na tarefa ativa.
3. A nova tarefa será puxada na próxima sessão.

Não expanda o escopo silenciosamente. Se o escopo crescer, pare, atualize o contrato e peça aprovação.

## Dispatch e lanes

No despacho paralelo, WIP=1 vale por lane: uma lane tem um único dono por arquivo e dependências declaradas. Lanes que tocam o mesmo arquivo não são independentes — são serializadas ou fundidas. O scheduler nunca absorve mudanças de escopo; apenas o escopo aprovado executa.

## Próximo passo

Veja [Evidência e Handoff](./evidence-and-handoff) para entender o que conta como conclusão.
