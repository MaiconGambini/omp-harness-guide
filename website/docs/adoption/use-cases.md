---
sidebar_position: 1
---

# Casos de Uso

Escolha o workflow pelo risco, pelas dependências e pela duração do trabalho, não apenas pelo número de arquivos. Os gates medem somente as métricas declaradas em `agent-os/quality-thresholds.json#metrics`; sinal ausente é uma lacuna, não aprovação.

| Cenário | Seleção recomendada |
|---|---|
| Tarefa simples em um arquivo | Uma lane curta, WIP=1 |
| Bug pequeno | Reprodução, correção mínima e regressão |
| Feature complexa | Spec, contrato, lanes por ownership |
| Multitarefa independente | Lanes paralelas com ownership disjunto |
| Multitarefa dependente | Lanes serializadas por dependência |
| Multi-sessão | Estado e handoff duráveis |
| Alto risco ou segurança | Tier completo e revisão especializada |
| Apenas documentação | Lane de docs e validação de links/build |
| Refine e regra aprendida | Judge, Refine e confirmação separada |
| Retomada de sessão | `/harness-session-start` + briefing derivado |

## Tarefa simples em um arquivo

**Quando usar:** mudança localizada, requisito claro, sem dependência nova, migração ou efeito em caminho de alto risco.

**Prompt de exemplo:**

```text
/prevc prepare Corrija o texto vazio em src/components/EmptyState.tsx. Altere
somente esse arquivo e rode o teste da área e o gate local.
```

**Comportamento esperado:** PREVC cria uma unidade WIP=1, confirma o escopo, executa a verificação descoberta e o gate local. O scheduler só escala a revisão se o risk router ou uma lacuna exigir.

**Erros comuns:** abrir uma spec grande; tocar arquivos adjacentes; chamar um gate verde de prova quando métricas relevantes estão indisponíveis.

## Bug pequeno

**Quando usar:** comportamento reproduzível com causa provável limitada e uma regressão automatizável.

**Prompt de exemplo:**

```text
/prevc prepare Reproduza o erro de paginação duplicada, adicione um teste de
regressão, faça a menor correção e valide a rota afetada.
```

**Comportamento esperado:** Plan registra reprodução e critério de aceitação; Execute segue red-green; Validate roda regressão e gates; Judge compara a correção com o bug original. Uma violação de regra deve voltar como finding tipado com ponteiro resolvível.

**Erros comuns:** corrigir antes de reproduzir; ampliar a refatoração; registrar preferência como `rule_violation` sem citar uma regra real.

## Feature complexa

**Quando usar:** múltiplos componentes, decisões de design, mudanças de schema, integrações ou critérios de aceitação independentes.

**Prompt de exemplo:**

```text
/prevc prepare Projete e implemente exportação de relatórios. Especifique
contratos, separe ownership de API, worker e UI, e peça aprovação antes de executar.
```

**Comportamento esperado:** PREVC produz spec e contrato de avaliação, mapeia risco e ownership, divide o plano em lanes limitadas e mantém um único objetivo ativo. O scheduler roda o gate completo, o risk router escolhe a profundidade de revisão e o Judge usa evidência agregada.

**Erros comuns:** iniciar código antes da aprovação; compartilhar arquivos entre lanes; usar volume de testes como substituto dos critérios de aceitação.

## Multitarefa independente em paralelo

**Quando usar:** duas ou mais tarefas sem dependência entre si e com conjuntos de arquivos disjuntos.

**Prompt de exemplo:**

```text
/prevc prepare Execute em paralelo a correção do parser e a atualização do
componente de status. Declare ownership exclusivo e devolva evidência por lane.
```

**Comportamento esperado:** o scheduler cria o manifesto antes do dispatch, injeta somente regras ativas que combinam com cada ownership e executa lanes em paralelo em uma onda `tasks[]`. Cada lane roda seu gate local; o scheduler é o único escritor do arquivo de findings e executa o gate agregado.

**Erros comuns:** paralelizar tarefas que editam o mesmo arquivo; permitir que reviewers escrevam findings; misturar resultados sem identificar lane e capacidade.

## Multitarefa dependente serializada

**Quando usar:** uma tarefa produz contrato, schema ou artefato consumido pela seguinte.

**Prompt de exemplo:**

```text
/prevc prepare Primeiro estabilize o contrato da API; depois atualize o cliente;
por último adapte a UI. Não inicie uma lane antes da evidência da anterior.
```

**Comportamento esperado:** PREVC representa as arestas de bloqueio e mantém somente a lane liberada em execução. Cada fronteira valida seu artefato antes do próximo dispatch; gates agregados e Judge ocorrem quando a cadeia termina.

**Erros comuns:** chamar dependências de paralelas; iniciar consumidores contra um contrato provisório; esconder blocker para manter a execução avançando.

## Trabalho multi-sessão

**Quando usar:** o objetivo não cabe em uma sessão ou precisa sobreviver a pausas, troca de agent ou revisão posterior.

**Prompt de exemplo:**

```text
/prevc prepare Continue o objetivo ativo usando docs/harness/progress.md e
docs/harness/session-handoff.md. Confirme o último gate válido antes de retomar
a próxima unidade WIP=1.
```

**Comportamento esperado:** a fase PREVC, findings, ledger e handoff persistem no repositório. A nova sessão relê contexto e verifica se a evidência ainda é válida; relatórios stale ou ausentes falham fechados.

**Erros comuns:** confiar no histórico do chat; marcar `passing` sem output; reusar relatório cuja fonte mudou.

## Alto risco ou segurança

**Quando usar:** autenticação, credenciais, pagamentos, permissões, migrações, infraestrutura ou caminhos que combinam com `high_risk_paths`.

**Prompt de exemplo:**

```text
/prevc prepare Corrija a validação de sessão. Classifique como alto risco,
limite o escopo a auth, inclua testes de abuso e exija revisão de segurança
completa.
```

**Comportamento esperado:** o risk router seleciona revisão completa; métricas indisponíveis impedem downgrade; reviewers especializados retornam findings tipados. Uma proposta Refine com efeito de alto risco preserva a confirmação do operador antes de virar regra.

**Erros comuns:** tratar permissões como sandbox; reduzir o tier porque os testes unitários passaram; colocar segredo em evidence ou finding.

## Apenas documentação

**Quando usar:** conteúdo, navegação ou exemplos sem alteração de runtime.

**Prompt de exemplo:**

```text
/prevc prepare Atualize o guia bilíngue de instalação, valide links e build,
não altere runtime nem declare números governantes na prosa.
```

**Comportamento esperado:** PREVC mantém ownership nos docs, roda validação de fontes, links e build, e registra lacunas. Números governantes continuam nas chaves de `quality-thresholds.json`, não na documentação.

**Erros comuns:** pular build por ser docs-only; duplicar valores de config na prosa; afirmar que uma capacidade configurada já foi aceita ao vivo.

## Ciclo Refine e regra aprendida

**Quando usar:** findings tipados mostram uma falha recorrente e o Judge já terminou. Use `/refine --note` quando o operador quiser registrar uma correção manual como evidência.

**Prompt de exemplo:**

```text
/refine
```

**Comportamento esperado:** Refine lê a janela vinculada ao gate e o ledger, propõe no máximo uma melhoria por componente e não escreve. A proposta literal é mostrada em `awaiting_confirmation`; regras que podem bloquear exigem aprovação do operador e entram em mudança separada. Na próxima execução, regras ativas são injetadas nas lanes compatíveis.

**Erros comuns:** tratar proposta como aprovação; deixar o refiner editar o ledger; dar voto de Judge ao Refine; afirmar auto-ativação de regras em prosa.

## Retomada de sessão

**Quando usar:** uma sessão nova, uma troca de agent ou logo após a compaction, quando reler todos os arquivos de estado é caro e o risco é injetar contexto desatualizado.

**Prompt de exemplo:**

```text
/harness-session-start
```

**Comportamento esperado:** o harness lê o progresso, as decisões recentes e as regras ativas, derivando um briefing pequeno e path-scoped carimbado com um `sourceHash` sobre os bytes de origem. Um briefing stale ou ausente falha fechado — é uma lacuna a nomear, nunca um passe. O checkout, os testes e o runtime sempre vencem o briefing; conflito vira finding, não fato.

**Erros comuns:** confiar no histórico do chat em vez do estado durável; injetar um briefing sem revalidar contra o checkout; tratar ausência de `progress.md` como "nada pendente".

Veja [Harness Contínuo](../concepts/continual-harness) para o contrato completo do loop.
