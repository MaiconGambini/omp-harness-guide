---
sidebar_position: 4
---

# Projeto Existente

> **Estado PREVC:** `prepare` — audite antes de instalar; o harness nunca sobrescreve um projeto sem confirmação.

Como adicionar o harness a um projeto que já existe.

## Passo 1: Auditar

```text
/harness-init
```

O inicializador inspeciona o projeto sem escrever arquivos. Ele descobre:

- Instruções existentes (AGENTS.md, CLAUDE.md, CONTEXT.md).
- Estado de progresso atual.
- Comandos de verificação e startup.
- Stack do projeto.

O resultado é um gap report — o que existe, o que falta.

## Passo 2: Instalar o mínimo viável

Para projetos pequenos, o mínimo útil é:

| Artefato | Por que existe |
|---|---|
| `AGENTS.md` curto | Regras, entry points e segurança |
| `feature_list.json` ou `tasks.md` | WIP e próximas unidades |
| Arquivo de progresso (`docs/harness/progress.md`) | Blockers e próxima ação |
| Comando de verificação | Baseline objetivo |
| `docs/harness/session-handoff.md` | Retomar em outro dia |

## Passo 3: Ou instalar o pacote completo

```text
/harness-bootstrap
```

O bootstrap propõe o pacote full com confirmação. Ele detecta a stack, descobre como verificar o projeto e mostra cada arquivo como create, merge ou skip.

## Passo 4: Primeira sessão com harness

1. Rode o comando de verificação descoberto.
2. Se falhar, registre o erro antes de criar features.
3. Preencha ou revise a lista de features.
4. Garanta WIP=1.
5. Comece toda sessão com `/harness-session-start`.

Adicione o restante dos artefatos apenas quando um failure mode real for observado — não crie burocracia sem necessidade.
