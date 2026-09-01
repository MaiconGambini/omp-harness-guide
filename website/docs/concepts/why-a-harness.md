---
sidebar_position: 1
---

# Por que um harness?

> **Estado PREVC:** `prepare → plan → execute → validate → judge → refine → confirm` — cada fronteira exige a evidência da fase anterior.

Sem um harness, o agente responde a um prompt, mas não sabe o que aconteceu na sessão anterior, qual tarefa ficou aberta, qual comando prova uma mudança ou quando deve parar.

O harness resolve isso com regras, estado durável, verificação e handoff.

## O problema que ele evita

| Sem Harness | Com Harness |
|---|---|
| Cada sessão redescobre o projeto | A sessão lê instruções, estado e handoff |
| Várias ideias viram trabalho paralelo | WIP=1 mantém uma única unidade ativa |
| "Pronto" é uma opinião | Conclusão exige evidência e Judge |
| Um erro se perde no histórico do chat | O blocker é registrado para a próxima sessão |
| Skills e agents acumulam comportamento | PREVC controla o ciclo de vida |

## O que o harness responde

Antes de qualquer mudança importante, o harness responde:

1. Onde estou e quais regras este repositório tem?
2. O que já foi feito e o que está bloqueado?
3. Qual é a única unidade de trabalho ativa?
4. Como vou provar que a alteração funcionou?
5. Quem decide se o resultado pode ser aceito?
6. O que uma próxima sessão precisa ler para continuar?

## Como isso é implementado no Oh My Pi

- **Estado** — a ferramenta `todo` mantém a unidade WIP=1 da sessão; `harness-prevc-state.mjs` grava a fase do ciclo de vida no arquivo de fase durável do projeto, com lock local e sobrevivência entre sessões.
- **Despacho** — o `scheduler` usa o mecanismo nativo `task` com uma onda `tasks[]` e coordena com `hub`; resultados são entregues automaticamente, sem stub de background.
- **Rastreio** — `harness-omp-trace.ts` consome eventos nativos do barramento de extensões (`pi.on`) e grava um envelope redigido, sem ler corpos de mensagens nem bancos locais.

## O que o harness NÃO faz

- Não torna o agente autônomo.
- Não substitui revisão humana.
- Não fornece sandbox de sistema operacional.
- Não garante qualidade de código — garante rastreabilidade.

## Princípio fundamental

O repositório é o sistema de registro. Estado que vive somente no chat não é estado confiável.
