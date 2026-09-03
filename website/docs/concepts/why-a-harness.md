---
sidebar_position: 1
---

# Por que um harness?

Sem orientação, um agente pode editar arquivos demais, quebrar o build, declarar testes que nunca executou e esquecer o trabalho assim que a sessão termina. A sessão seguinte perde tempo reconstruindo o contexto e não sabe qual tarefa ficou aberta, qual comando prova a mudança ou quando deve parar.

O harness transforma esse fluxo em trabalho rastreável. Regras, estado durável, verificação e handoff tornam explícitos o escopo, a evidência e a continuidade.

## Comparativo direto

| Preocupação | Unassisted AI chat | Harness-guided engineering |
|---|---|---|
| Alterações fora de escopo | Edições em muitos arquivos podem escapar ao planejamento | Lanes têm propriedade declarada e fronteiras de arquivos |
| Build quebrado | Não há controle consistente antes de dizer “pronto” | Gates medidos validam a árvore reconciliada |
| Testes alegados | O modelo pode alucinar uma execução que não ocorreu | A conclusão exige comando, resultado e Judge independentes |
| Contexto entre sessões | O histórico do chat não é um registro durável | Estado em arquivo, WIP=1 e handoff orientam a próxima sessão |
| Execução lenta | Um único fluxo serial limita o throughput | `task` nativo, até 32 subagentes e sharding distribuem o trabalho |

## O que o harness responde

Antes de uma mudança importante, o harness responde:

1. Onde estou e quais regras este repositório tem?
2. O que já foi feito e o que está bloqueado?
3. Qual é a única unidade de trabalho ativa?
4. Como vou provar que a alteração funcionou?
5. Quem decide se o resultado pode ser aceito?
6. O que a próxima sessão precisa ler para continuar?

## Como isso é implementado no Oh My Pi

- **Estado** — `todo` mantém a unidade WIP=1; `harness-prevc-state.mjs` grava a fase em arquivo durável, com lock local e sobrevivência entre sessões.
- **Despacho** — o `scheduler` usa `task` com uma onda `tasks[]` e coordena com `hub`; os resultados são entregues automaticamente.
- **Escala** — o runtime nativo permite fan-out de até 32 subagentes e sharding paralelo de testes quando as lanes têm propriedade disjunta.
- **Rastreio** — `harness-omp-trace.ts` registra um envelope redigido a partir dos eventos nativos, sem ler corpos de mensagens nem bancos locais.

## O que o harness não faz

- Não torna o agente autônomo.
- Não substitui revisão humana.
- Não fornece sandbox de sistema operacional.
- Não garante qualidade de código; garante rastreabilidade.

## Princípio fundamental

O repositório é o sistema de registro. Estado que vive somente no chat não é estado confiável.
