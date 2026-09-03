---
sidebar_position: 1
---

# Por que um harness?

Quando desenvolvedores começam a usar assistentes de IA diretamente no terminal, deparam-se rapidamente com quatro falhas estruturais:

1. **Edições descontroladas em múltiplos arquivos (runaway edits):** O agente tenta resolver um problema pontual e sai modificando dezenas de módulos não relacionados, criando diffs enormes e poluindo a árvore de trabalho.
2. **Builds quebrados (broken builds):** O agente declara vitória sem testar se o projeto compila ou se as dependências continuam íntegras.
3. **Alucinação de testes (test hallucination):** O modelo presume que suas mudanças funcionam e relata que "os testes passaram" sem sequer invocar o executor de testes no terminal.
4. **Perda de contexto entre sessões (context loss):** Ao encerrar ou reiniciar o terminal, o agente esquece tudo o que foi decidido, reescreve soluções anteriores e repete os mesmos erros.

O harness existe para transformar a assistência de IA em um fluxo de engenharia determinístico, governado por regras em disco, verificações executáveis e transições auditáveis.

## Comparativo estrutural

| Chat de IA sem assistência | Engenharia com Harness |
|---|---|
| **Edições descontroladas:** Altera dezenas de arquivos sem fronteira definida, gerando diffs gigantescos e imprevisíveis. | **Escopo delimitado:** Declara e restringe a posse de arquivos por lane; edições ocorrem apenas nos alvos autorizados. |
| **Build quebrado:** Afirma que a tarefa está pronta sem verificar se o projeto ainda compila ou empacota. | **Verificação obrigatória:** Bloqueia a conclusão até que checagens de tipos, linters e builds passem com código de saída zero. |
| **Alucinação de testes:** Inventa resultados de testes ("todos os testes passaram") sem executar comando algum no terminal. | **Evidência real:** Exige saída capturada do terminal e degraus de evidência auditáveis antes de declarar sucesso. |
| **Perda de contexto:** Cada nova sessão começa do zero, esquecendo decisões, bloqueios e tarefas pendentes. | **Continuidade durável:** Mantém estado em disco (WIP=1), registra bloqueios reais e produz handoff limpo para a próxima sessão. |

> **Contrato PREVC:** Somente após estabelecer essas garantias básicas é que introduzimos o ciclo formal: `prepare → plan → execute → validate → judge → refine → confirm`, onde cada transição exige a evidência da etapa anterior.
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
