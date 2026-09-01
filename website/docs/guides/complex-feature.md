---
sidebar_position: 2
---

# Feature Complexa

> **Estado PREVC:** `plan → execute → validate → judge → confirm` — contrato preenchido antes do Execute, WIP=1 por subtask.

Para tarefas multi-componente, frontend + backend, ou com ambiguidade significativa.

## Quando usar o pipeline completo

- Prompt multi-componente (ex: frontend e backend).
- Ambiguidade nos requisitos.
- Mais de 3 arquivos esperados.

## Exemplo

**Prompt:** `Busca full-text nos produtos com filtros por categoria e preço, no backend (FastAPI) e frontend (Vue).`

**Fluxo:**

1. `/harness-session-start`

2. Decomposição WIP
   - Decompõe em 6 subtasks (feat-020 a feat-025).
   - Marca feat-020 como `in_progress`. Resto: `not_started`.

3. `/prevc prepare ...`
   - Planejamento com separação de papéis: planner define escopo, AC e plano de verificação; generator itera sobre as subtasks; evaluator aplica rubrica.
   - Aprovação do operador.

4. PREVC itera: Execute -> Validate -> Judge.

5. Confirm depois que todas as subtasks passam.

6. Handoff registra 6 features `passing` com evidência, 12 arquivos tocados.

**Tempo:** ~30-45 minutos.

## O sprint contract

Para features complexas, o contrato é preenchido ANTES do Execute:

- **Scope In** — o que será feito.
- **Scope Out** — o que NÃO será feito (ex: ElasticSearch, autocomplete).
- **AC** — critérios de aceite observáveis.
- **Verification Plan** — comandos e condições de sucesso para cada check.

Trabalho adjacente descoberto durante a execução vira uma próxima tarefa, não uma extensão silenciosa da tarefa ativa.
