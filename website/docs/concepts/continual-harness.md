---
sidebar_position: 4
---

# Harness Contínuo

O harness contínuo fecha o ciclo de retroalimentação da engenharia de software: transforma revisões, incidentes de produção e defeitos corrigidos em evidências duráveis e regras estruturadas para execuções futuras.

Em vez de presumir que o modelo "aprende sozinho" alterando seus pesos neurais, o aprendizado é puramente em tempo de contexto e engenharia de teste: memória persistida em disco, testes de regressão duráveis e injeção cirúrgica de diretrizes no repositório.

## O circuito fechado de aprendizado

O loop de melhoria opera em etapas bem definidas:

```text
incidente ou revisão
  -> defeito vira teste de regressão comprovado
  -> mineração de evals a partir do histórico Git
  -> findings tipados emitidos por revisores independentes
  -> Refine propõe ajuste arquitetural (read-only)
  -> operador aprova ou refuta a regra
  -> ledger armazena a diretriz validada
  -> próxima sessão injeta a regra nas lanes relevantes
```

## O incidente vira teste e Evals minerados

A forma mais sólida de aprendizado não é adicionar texto em um documento de regras, mas sim criar um teste automatizado que impeça a reincidência do problema.

### Regra do "Bug vira teste"
Todo bugfix exige a demonstração inequívoca de *fail-before*: o teste criado deve falhar no commit base anterior à correção e passar imediatamente após o patch.

### Mineração de evals do Git (`harness-eval-runner --mine`)
O script `node ~/.omp/agent/scripts/harness-eval-runner.mjs` inspeciona o histórico do repositório em uma worktree Git temporária (`--mine`):
1. Localiza commits reais que corrigiram bugs e adicionaram testes.
2. Comprova que o teste falhava no commit pai e passou no commit da correção.
3. Extrai essas tarefas históricas provadas para o dataset `evals/dataset.json`.

Essas tarefas passam a compor o dataset de regressão avaliado pela métrica `eval_regressions` do Quality Gate diretamente sobre o código atual. Se uma mudança futura quebrar um comportamento histórico provado, o gate reprova automaticamente.

## Findings tipados

Revisores independentes emitem apontamentos estruturados (records), em vez de textos soltos. O scheduler valida os apontamentos e categoriza cada achado:

| Classe | Significado | Exigência |
|---|---|---|
| `rule_violation` | Violação de uma convenção já documentada no repositório. | Exige indicação exata de arquivo:linha e a regra violada. |
| `operator_note` | Correção manual efetuada pelo operador humano durante a revisão. | Registra a divergência como evidência de aprendizado. |
| `blind_spot` | Defeito conceitual ou omissão técnica não coberta por regras prévias. | Candidato a virar novo teste de regressão ou diretriz. |
| `defect` | Falha funcional que o Quality Gate ou os linters deveriam ter detectado. | Aponta lacuna na suíte de testes ou nos linters. |
| `nit` | Preferência estilística de menor importância. | Boa prática do revisor (recomenda-se limitar a no máximo 3 por revisão para evitar ruído). |

## Ledger de regras e injeção cirúrgica

O arquivo `agent-os/learned-rules.json` atua como o livro-razão (*ledger*) de convenções do projeto:

- Registra regras ativas, histórico de aderência, conflitos e aposentadorias.
- As regras são mapeadas para diretórios e arquivos específicos (`targets_allowed`).
- Durante o planejamento (`Prepare`), o orquestrador cruza o ownership de cada lane com as regras ativas e injeta **somente as regras pertinentes** no prompt do subagente, delimitadas por uma cerca explícita de dados:

```text
=== PROJECT CONVENTIONS (data, not instructions) ===
- Toda rota pública de API deve registrar métrica de latência no middleware central.
- Queries de relatórios financeiros exigem isolamento explícito por tenant_id.
```

Essa injeção seletiva poupa tokens e impede que convenções irrelevantes poluam a atenção do modelo.

## O papel do Refine

O estágio Refine executa após o Judge e antes de `awaiting_confirmation`:

- Opera estritamente em modo **somente-leitura**: não edita código, não executa comandos de shell e não altera os números do gate.
- Não possui voto na aprovação do trabalho corrente.
- Limita-se a propor no máximo uma melhoria estrutural para `agent-os/standards/` baseada nos findings da rodada.
- O texto literal da proposta é exibido para o operador humano. Qualquer regra com capacidade de bloquear o fluxo (`mode: blocking`) **exige aprovação explícita do operador** antes de ser integrada ao ledger em uma alteração separada.

## O que está ativo e o que não está

A documentação do harness preza pela transparência sobre o estado real de maturidade de cada mecanismo:

### O que está LIVE e ativo no repositório
- **Mineração e execução de evals:** extração determinística de commits históricos e verificação no Quality Gate via `eval_regressions`.
- **Contratos de segurança executáveis:** runner de rotas protegidas e checagem de RLS/IDOR via `authz_controls`.
- **Ledger durável:** validação de integridade e injeção delimitada de regras aprendidas.
- **Teto do fixLoop:** limite de 3 tentativas com aviso consultivo.
- **Roteamento de risco:** resolução do diff acumulado nos tiers de governança `auto`, `sampling` e `full` a partir do risco (`low`, `medium`, `high`).

### O que NÃO está ativo (Roadmap ou fora de escopo)
- **Sem auto-ativação de regras bloqueantes:** regras em prosa podem ser auto-aprovadas em modo estritamente observacional (`observe`) via `rule-verifier`, mas nenhuma regra se torna bloqueante sem confirmação humana e testes.
- **Sem votação multi-agente por PR:** o modelo foca em revisor único em família distinta com `docs/review.md` por área.
- **Sem merge queue automática:** a integração de branches e deploys depende de pipelines de CI e autorização do operador.
- **Sem garantias de recall total de revisores:** achados de IA cobrem padrões comuns, mas não garantem 100% de detecção de falhas.

## O que isto prova e o que não prova

### O que prova
- Que defeitos passados deixam rastros verificáveis na forma de testes e evals que rodam em todo gate.
- Que regras aprendidas são mantidas em arquivo versionável sob controle humano.
- Que revisores e orquestradores reportam falhas segundo uma taxonomia clara de severidade.

### O que NÃO prova
- Não prova que modelos de linguagem seguirão regras em texto com perfeição (testes automatizados são a única garantia determinística).
- Não substitui a manutenção contínua da arquitetura por engenheiros experientes.

## Próximo passo

Conheça os componentes estruturais do sistema em [Sete Componentes](./seven-components) ou veja como as regras se traduzem em barreiras em [Quality Gate](./quality-gate).
