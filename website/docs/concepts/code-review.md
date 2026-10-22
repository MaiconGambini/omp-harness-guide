---
sidebar_position: 8
---

# Code Review com Agentes

Code review em engenharia assistida por agentes não consiste em pedir a um modelo que "leia o diff e diga se está bom". O harness implementa uma arquitetura de revisão contínua em camadas, combinando verificações determinísticas, modelos de famílias concorrentes, regras locais por área e limites de convergência.

O objetivo do modelo de revisão é proteger o recurso mais escasso do processo: a atenção humana. Em vez de forçar o desenvolvedor a caçar problemas de formatação ou checagens triviais, os agentes e o Quality Gate eliminam defeitos mecânicos antes que o pull request alcance o operador.

## As camadas da revisão

Inspirado nas práticas de engenharia de software em larga escala com agentes, o pipeline de revisão estrutura-se em camadas sequenciais:

| Camada | Mecanismo | Responsabilidade |
|---|---|---|
| **L1 — Verificação antes do PR** | Comandos locais de linters, compilador e testes | Exigir saída executável real antes de abrir o código para revisão externa. |
| **L2 — Revisor de outra família** | Modelo concorrente (ex.: GPT Luna vs Gemini Flash) | Avaliar a lógica sob uma arquitetura de modelo diferente para eliminar pontos cegos do autor. |
| **L3 — REVIEW por área** | `docs/review.md` com falhas críticas catalogadas | Direcionar o foco do revisor para os defeitos que historicamente mais escapam naquele domínio. |
| **L4 — Template de PR padronizado** | Quatro seções obrigatórias no Pull Request | Declarar Tier, Evidência de Teste, Procedimento de Reversão e Responsável humano. |
| **L5 — Teto de convergência** | `fixLoop.maxAttempts` fixado em 3 | Limitar os ciclos de vaivém entre autor e revisor, alertando o operador em caso de esgotamento. |
| **L6 — Regra "Bug vira teste"** | Teste de regressão com prova de falha prévia | Impedir que correções de defeitos sejam fechadas sem teste automatizado durável. |
| **L7 — Métricas de fluxo** | `harness-flow-metrics` sobre o histórico Git | Medir reversões reais, correções subsequentes e taxa de aprovação sem métricas de vaidade. |

## Revisor em família de modelos concorrente

Quando o mesmo modelo implementa a solução e revisa o próprio diff, ele tende a reproduzir as mesmas suposições incorretas e ignorar as mesmas omissões.

Para quebrar essa correlação de erros, o harness separa os papéis de modelo em `config.yml`:

```yaml
modelRoles:
  implement: google-antigravity/gemini-3.8-flash
  review: openai-codex/gpt-6-luna:high
```

O revisor recebe o diff completo, a intenção do PR e a árvore de contexto sem herdar o histórico de conversa do implementador. Ele analisa a mudança de forma autônoma e emite achados objetivos ancorados no código.

## REVIEW por área (`docs/review.md`)

Revisores de IA sem foco produzem excesso de ruído: comentários puramente estilísticos, sugestões triviais de refatoração ou reescritas de preferências pessoais.

O harness neutraliza esse comportamento por meio de arquivos de governança locais (`docs/review.md` ou `docs/review-<area>.md`):

1. **O que o gate já cobre:** Instrução explícita para o revisor não comentar sobre tipagem, formatação ou cobertura básica que já é aferida pelos linters.
2. **Falhas críticas da área:** Lista das classes de defeitos mais graves naquele subsistema (por exemplo: esquecer de fechar transações, concorrência desprotegida, consultas sem filtro de tenant ou falhas de autorização).
3. **Regras rígidas de evidência:**
   - Todo achado substantivo deve conter a indicação exata `arquivo:linha`.
   - O parecer deve iniciar com a contagem de achados por severidade.
   - O limite máximo é de 3 comentários de menor importância (*nits*); itens puramente cosméticos devem ser descartados.

## Template de Pull Request

Todo repositório governado adota o arquivo `.github/pull_request_template.md` estruturado em cinco seções obrigatórias na ordem canônica:

```markdown
## O que muda e por quê
<!-- 2 a 4 linhas explicando o que muda e o motivo. Link da task no Linear ou issue. -->

## Tier
<!-- Regra de bolso: se hesitar, suba um tier. -->
- [ ] auto — docs, copy, config sem lógica
- [ ] sampling — baixo risco, revisão por amostra
- [ ] full — auth, pagamento, banco, migração, segurança, dados de cliente

## Testing
<!-- Comando exato executado e saída real. Para bugfix: teste de regressão que falhava antes e passa depois (ou justificativa escrita). -->

## Como reverter
<!-- Passo exato de reversão: git revert <sha>, feature flag, rollback de migração. Sem reversão automática exige justificativa. -->

## Responsável
<!-- Nome do humano que responde por este merge. O agente não é responsável. -->
```
O preenchimento dessas seções garante rastreabilidade imediata: qualquer engenheiro que inspecionar o histórico sabe como o código foi validado e como reverter a mudança em caso de incidente.

## Roteamento por risco e triagem

A profundidade de revisão é definida pela **natureza da mudança**, e não pela identidade ou senioridade do autor:

- `risk:low` — alterações estritamente de documentação ou arquivos de configuração periféricos.
- `risk:medium` — adições de funcionalidades bem isoladas com cobertura de testes unitários.
- `risk:high` — toques em autenticação, transações financeiras, migrações de dados ou políticas do próprio harness.

Durante a triagem de tarefas (seja por rotinas de planejamento PREVC ou pela skill de triagem do operador), a primeira pergunta obrigatória antes de qualquer plano é: *"Vale construir?"*. Trata-se de uma checagem que, se a resposta for negativa ou duvidosa, orienta a entrega a começar pela recomendação explícita de não implementação ou redefinição de produto, deixando a elaboração de um plano de código opcional; a pergunta não encerra a tarefa de forma automática.

## Autoconfirmação com critérios (auto-confirm)

Para tarefas de baixo risco ou pipelines repetíveis, o PREVC suporta autoconfirmação governada (`auto-confirm`), configurada em `agent-os/prevc-autonomy.json`:

```json
{
  "schemaVersion": 1,
  "autoConfirm": false,
  "maxRevisionCycles": 3
}
```

Por padrão, a política de autoconfirmação vem **estritamente desligada** (`autoConfirm: false`) em todos os projetos. Quando habilitada explicitamente pelo operador, a aprovação autônoma exige, cumulativamente:

1. **Política de autonomia:** arquivo `agent-os/prevc-autonomy.json` presente com `autoConfirm: true` e `maxRevisionCycles` válido (inteiro de 0 a 10).
2. **Orçamento de revisões:** a contagem de ciclos `revision_requested` no histórico não ultrapassa `maxRevisionCycles` (caso ultrapasse, o auto-confirm é recusado com "revision budget exhausted, operator required").
3. **Recibo do Judge:** recibo formal registrado pelo Judge com veredito `accept` e lista `blockingCriteria` estritamente vazia.
4. **Quality Gate verde e fresco:** relatório do gate em modo `full` com veredito favorável e sem falhas bloqueantes, amarrado ao mesmo `sourceHash` da árvore inspecionada.
5. **Revisões com aprovação:** pelo menos uma revisão nos arquivos de review e recibos do ciclo PREVC do projeto posterior ao último ciclo de validate com a linha `Verdict: APPROVE` (e nenhuma linha contendo veredito divergente de APPROVE).
6. **Handoff de sessão:** arquivo regular `session-handoff.md` presente e fresco (posterior ao ciclo atual de `awaiting_confirmation`).

Se qualquer uma dessas condições falhar, a autoconfirmação é recusada imediatamente (*fail-closed*) e a decisão é escalada para o operador humano.

## Teto de ciclos do fixLoop

Em tarefas automatizadas, um autor e um revisor de IA podem entrar em ciclos circulares de correção intermináveis.

O harness define o valor padrão de `fixLoop.maxAttempts` como **3 tentativas**. O esgotamento desse limite é estritamente **consultivo**:

- Ao atingir ou ultrapassar o teto de tentativas, a transição `validate -> execute` continua sendo aceita pelo orquestrador.
- O orquestrador emite o aviso consultivo `fix-loop-exhausted (N/max)` acompanhado do diagnóstico detalhado da métrica reprovada.
- O trabalho segue em andamento; nada é abortado nem parado sozinho de forma destrutiva. O operador humano recebe o diagnóstico para decidir se intervém, reorienta a abordagem ou confirma a entrega.
## Bug vira teste

Nenhuma correção de defeito (*bugfix*) é considerada concluída sem a criação de um teste automatizado durável que comprove a falha:

1. **Prova de fail-before:** Antes de aplicar o patch, executa-se o teste contra o código original, registrando formalmente que a asserção falha com o erro esperado.
2. **Resolução:** O patch é aplicado na implementação.
3. **Prova de pass-after:** O mesmo teste é executado novamente, demonstrando que agora passa com código de saída zero.

Essa disciplina assegura que o problema resolvido jamais voltará a ocorrer silenciosamente em versões futuras do projeto.

## Métricas de fluxo

Em vez de contar linhas de código ou números de commits como métricas de vaidade, o script `harness-flow-metrics.mjs` extrai indicadores objetivos diretamente do histórico Git:

```bash
node ~/.omp/agent/scripts/harness-flow-metrics.mjs --root <projeto> --since 28d --json
```

O comando retorna um objeto JSON com os campos reais:
- `status`: indicador de integridade da execução (`ok`).
- `root`: caminho base do repositório avaliado.
- `since`: janela temporal analisada (padrão `28d`).
- `definition`: definição explícita do cálculo de `fixFollowups`.
- `weeks`: array de semanas com contagens de commits, reversões, fixFollowups e suas razões percentuais.
- `totals`: agregados do período (`commits`, `reverts`, `fixFollowups`, `revertRatio`, `followupRatio`).

É fundamental compreender que `fixFollowups` opera como um **proxy** (definido como commit fix/hotfix/bugfix que altera arquivo modificado por outro commit nos 7 dias anteriores); ele **não prova** que a correção ocorreu após um merge em produção, mas serve como alerta de retrabalho em módulos instáveis.
## Exemplo ilustrativo de parecer de revisão

O parecer do revisor não é salvo no arquivo de política `docs/review.md` (que define as regras, checklist e falhas críticas da área), mas sim emitido na resposta do agente revisor e registrado nos arquivos de review e recibos do ciclo PREVC do projeto.

Exemplo ilustrativo de parecer emitido pelo revisor independente:

```markdown
# Review: Endpoint de Relatórios Financeiros

Achados: 0 blockers, 1 warning, 1 nit

## Warnings
- src/services/reports.ts:42 — Consulta a dados de pagamento sem parâmetro explícito de tenant_id. Risco de vazamento entre contas caso a sessão seja reutilizada.

## Nits
- src/services/reports.ts:89 — Nome da variável `tempTot` pode ser renomeada para `accumulatedTotal` para manter o padrão do módulo.

Verdict: REQUEST CHANGES
```

## O que isto prova e o que não prova

### O que prova
- Que o código passou pelo crivo de uma família diferente de modelos com foco restrito às falhas críticas daquela pasta.
- Que o PR possui documentação reproduzível de teste e procedimento explícito de reversão.
- Que defeitos corrigidos possuem testes automatizados que comprovadamente falhavam antes da mudança.
- Que o loop de vaivém respeita tetos rigorosos de convergência para não consumir recursos indefinidamente.

### O que NÃO prova
- Não prova que a funcionalidade deve ser construída: a decisão de oportunidade e valor de negócio permanece com o desenvolvedor humano ("you land it, you own it").
- Não garante ausência de vulnerabilidades conceituais profundas não previstas nos catálogos de revisão do repositório.
- A aprovação de um agente revisor não substitui a responsabilidade do operador que autoriza o merge.

## Próximo passo

Veja as métricas automatizadas que sustentam essa revisão em [Quality Gate](./quality-gate) ou estude o loop contínuo de aprendizado em [Harness Contínuo](./continual-harness).
