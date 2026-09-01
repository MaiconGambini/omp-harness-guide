---
sidebar_position: 3
---

# Artefatos

Arquivos que o harness lê e escreve durante o ciclo de vida.

## Estado

| Arquivo | Caminho | Propósito |
|---|---|---|
| `AGENTS.md` | raiz | Regras do projeto, entry points |
| `feature_list.json` | raiz | Fonte da verdade de WIP=1 |
| `tasks.md` | raiz ou `.specs/features/*/` | Alternativa de feature state |
| `progress.md` | `docs/harness/` | Progresso durável, blockers, decisões |
| arquivo de fase durável | projeto (escrito por `harness-prevc-state.mjs`) | Fase durável do ciclo de vida |
| `session-handoff.md` | `docs/harness/` | Transferência entre sessões |
| `sprint-contract.md` | `docs/harness/` | Escopo, AC, plano de verificação |
| `quality-thresholds.json` | `agent-os/` | Métricas, risk routing e chaves governantes |
| `learned-rules.json` | `agent-os/` | Ledger local de regras ativas, conflitos e aposentadorias |
| `security-contract.json` | `agent-os/` | Contrato de segurança: presença e evidência declarada (`authz_controls`) |
| janela de findings | projeto | Janela append-only de findings tipados ligada ao gate |
| recibo do Judge | projeto (arquivo datado) | Recibos do Judge (veredito, rubrica, critérios bloqueantes) |
| envelope de trace | projeto | Envelope redigido do rastreio nativo (`pi.on`) |
| `specs/<slug>/` | `agent-os/` | Spec, plan, verification, decisions e tickets |

## Feature list

Cada feature no `feature_list.json` usa os campos abaixo:

| Campo | Descrição |
|---|---|
| `id` | Identificador único |
| `priority` | Ordem de execução |
| `area` | Área do projeto |
| `title` | Nome curto |
| `user_visible_behavior` | O que o usuário/agente vê quando funciona |
| `dependencies` | IDs de features que devem ser concluídas antes |
| `status` | `not_started`, `in_progress`, `passing` ou `blocked` |
| `verification` | Comando que prova que funciona |
| `evidence` | Output real capturado após verificação |
| `notes` | Informação adicional |

## Regras de status

- Apenas UMA feature `in_progress` por vez.
- `passing` exige `evidence` preenchida com output real.
- `blocked` exige a causa exata no campo `evidence`.
- Nenhuma feature `in_progress` com dependências não resolvidas.

## Ownership dos artefatos

- O PREVC é o único escritor da fase do ciclo de vida (arquivo de fase durável); transições inválidas são recusadas (exit 2) sem escrita.
- Reviewers retornam records; o scheduler valida e grava cada arquivo de findings uma única vez.
- O PREVC grava os recibos do Judge; `refine → awaiting_confirmation` exige veredito `accept`.
- Refine lê findings e ledger, mas não escreve nenhum dos dois.
- Regras aprovadas entram depois do código, em mudança separada, porque o rulebook permanece dentro do hash de fonte do gate.
- Números governantes vivem em `quality-thresholds.json`, nunca na prosa.
- O rastreio é gravado apenas pelo adaptador `harness-omp-trace.ts` e por `--record` explícito através do contrato compartilhado.
