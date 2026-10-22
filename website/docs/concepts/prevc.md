---
sidebar_position: 3
---

# PREVC

O PREVC é o contrato fundamental de engenharia do harness para tarefas de software. Ele define fronteiras de escopo, transições válidas de estado, evidências obrigatórias e critérios de confirmação humana ou governada.

Nenhum agente de execução possui autoridade para desviar desse fluxo, alterar fases arbitrariamente ou declarar trabalho pronto sem apresentar as evidências exigidas por cada etapa.

## Quatro fases e sete etapas

O ciclo divide-se em quatro fases operacionais que agrupam sete etapas sequenciais:

| Fase | Etapas agrupadas | Objetivo e evidência exigida |
|---|---|---|
| **Prepare** | `prepare` + `plan` | Reconhecimento do repositório, classificação de risco pelo diff acumulado e especificação aprovada pelo operador. |
| **Execute** | `execute` | Implementação estrita com WIP=1 e posse declarada de arquivos em cada lane. |
| **Validate** | `validate` + `judge` | Execução do Quality Gate, testes de regressão e emissão do recibo independente do Judge (somente-leitura). |
| **Confirm** | `refine` + `confirm` | Proposta de melhoria em prosa (Refine) e confirmação formal (humana ou por autoconfirmação governada). |

A sequência conceitual das sete etapas no contrato PREVC:

```text
prepare → plan → execute → validate → judge → refine → confirm
```

No estado durável gerenciado por `harness-prevc-state.mjs`, esse enquadramento conceitual mapeia diretamente para os estados canônicos da máquina de estados: `prepare` → `awaiting_plan_approval` → `execute` → `validate` → `judge` → `refine` → `awaiting_confirmation` → `complete`.
![Ciclo de vida do PREVC](/omp-harness-guide/img/diagrams/ciclo-prevc.png)
*As quatro fases do ciclo PREVC e suas transições controladas.*

## Tiers e roteador de risco

Antes da execução, o `harness-risk-router` avalia o escopo e classifica a iniciativa em um de três tiers de governança (`auto`, `sampling` ou `full`). Embora o tier normalmente acompanhe a classificação de risco do diff (`low`, `medium`, `high`), o roteador também considera o estado do gate (um gate não configurado recai em `sampling` e caminhos de alto risco forçam compulsoriamente o tier `full`):

- **Tier `auto` (risco `low`):** Alterações pontuais com baixo diff acumulado em arquivos não sensíveis e com gate full comprovadamente verde e medido. Dispensa leitura prévia de diff.
- **Tier `sampling` (risco `medium`):** Tarefas médias, gates com métricas indisponíveis ou projetos sem calibração prévia. Dispara amostragens da suíte de testes e validação cruzada.
- **Tier `full` (risco `high`):** Disparado compulsoriamente se a mudança tocar caminhos críticos (`high_risk_paths` como autenticação, autorização, migrações de banco, infraestrutura ou regras do próprio harness) ou ultrapassar limites seguros de complexidade. Exige auditoria humana do diff e suíte completa.

### Red-team obrigatório no tier full
No tier `full` (ou risco `high`), o script `harness-prevc-state.mjs` recusa compulsoriamente a transição `judge -> refine` caso não exista uma revisão de red-team aprovada, amarrada ao mesmo `sourceHash` do gate e contendo a linha `Red-team: N tentativas` (com N no mínimo 3) e `Verdict: APPROVE`. No ambiente de trabalho do operador, esses testes na superfície alterada são conduzidos pelo agente de segurança do operador; a distribuição pública do harness não inclui o subagente ofensivo `security-analyst`.

## O que roda em cada fase

![PREVC ponta a ponta](/omp-harness-guide/img/diagrams/prevc-ponta-a-ponta.png)
*Detalhamento operacional de ponta a ponta de cada fase do PREVC.*

1. **Prepare:** Agentes realizam exploração somente-leitura. O plano formal é elaborado contendo objetivos, não-escopo, arquivos afetados, comandos de verificação e critérios de aceite. O estado para em `awaiting_plan_approval`.
2. **Execute:** O scheduler despacha lanes para agentes de implementação (`implementer` ou `fixer`), cada um restrito aos seus arquivos declarados.
3. **Validate:** O Quality Gate completo roda todas as métricas aplicáveis. O agente `judge` avalia o resultado contra os critérios de aceite e gera um recibo em formato JSON.
4. **Confirm:** O agente `refine` propõe no máximo uma melhoria de padrão arquitetural (sem editar o repositório). O operador revisa o handoff e o relatório de evidências para autorizar a conclusão.

## Micro-loop vs Macro-loop e o teto do fixLoop

Durante o desenvolvimento, falhas em testes ou verificações acionam dois circuitos distintos de correção:

![Gate de qualidade e micro e macro-loops no PREVC](/omp-harness-guide/img/diagrams/prevc-fase-a-fase.png)
*O Quality Gate atua como sinal operacional entre o micro-loop local e o macro-loop de validação.*

- **Micro-loop (dentro de Execute):** Um agente especializado (`fixer`) tem direito a exatamente 1 tentativa imediata por shard de teste para ajustar falhas locais triviais antes de devolver o controle ao orquestrador.
- **Macro-loop (Validate &rarr; Execute):** Quando o Quality Gate ou o Judge reprovam o conjunto integrado, o orquestrador devolve a tarefa para uma nova rodada de implementação.
- **Teto de rodadas (`fixLoop.maxAttempts`):** O número padrão de ciclos no macro-loop é fixado em **3 tentativas**. O esgotamento do teto é **consultivo**: a transição `validate -> execute` continua sendo aceita pelo orquestrador acompanhada do aviso `fix-loop-exhausted (N/max)` e de diagnóstico da métrica reprovada, permitindo que o trabalho siga sem paradas destrutivas ou abortos involuntários.

## O gate como sinal operacional

O Quality Gate opera como um sinal de trânsito:
- Um gate verde (`pass`) sinaliza que o código atende às métricas mínimas para prosseguir à avaliação do Judge.
- Um gate vermelho (`fail`) **barra exclusivamente a conclusão** e a transição para `awaiting_confirmation`. Ele não encerra a sessão, não destrói o terminal nem reverte alterações; o estado permanece aberto para que as correções sejam efetuadas.

## O status blocked

O status `blocked` não é gerado automaticamente por falhas de teste ou reprovação de gate. Ele só é alcançado no ciclo de vida por meio de uma transição explícita para `blocked` informando a justificativa `--blocker <texto>` (acionada pelo operador ou pelo orquestrador ao encontrar um impedimento real de escopo) ou mediante recibo formal do Judge com veredito `block` listando `blockingCriteria`.
## Autoconfirmação com critérios (auto-confirm)

Para tarefas rotineiras, o PREVC suporta a transição autônoma `awaiting_confirmation → complete` via ação `auto-confirm`.

Por padrão, a política é **estritamente desativada** (`autoConfirm: false` em `agent-os/prevc-autonomy.json`). Quando habilitada pelo operador, a aprovação automática exige compulsoriamente as seguintes condições simultâneas (*fail-closed*):

1. **Política de autonomia:** arquivo `agent-os/prevc-autonomy.json` presente com `autoConfirm: true` e `maxRevisionCycles` válido (0 a 10).
2. **Orçamento de revisões:** contagem de ciclos `revision_requested` não ultrapassa `maxRevisionCycles`.
3. **Recibo do Judge:** veredito formal `accept` sem pendências em `blockingCriteria`.
4. **Quality Gate Full verde e fresco:** relatório verde (`pass`), amarrado ao mesmo `sourceHash` da árvore inspecionada.
5. **Revisão independente aprovada:** parecer nos arquivos de review do projeto posterior ao validate contendo `Verdict: APPROVE`.
6. **Handoff durável e recente:** arquivo regular `session-handoff.md` presente e atualizado após a entrada em `awaiting_confirmation`.
### Governança em tarefas de tier alto
Mesmo quando o repositório possui `autoConfirm: true`, a boa prática de governança determina que em iniciativas classificadas no tier `full` (ou com etiqueta `risk:high`), o operador humano desative temporariamente a autoconfirmação para realizar a inspeção visual final antes da entrega.

## Comandos do ciclo de vida

O comando slash `/prevc` fornece os pontos de entrada para planejamento e execução:

Início do planejamento de uma tarefa:
```bash
/prevc prepare Adicionar autenticação com token de sessão
```

Após aprovação do plano pelo operador, o disparo da execução autônoma:
```bash
/prevc run
```

A confirmação final ou solicitação de revisão em `awaiting_confirmation` é feita pelo operador em linguagem natural no chat ("confirmado", "revisar") ou diretamente via script de estado:

```bash
# Confirmar conclusão
node ~/.omp/agent/scripts/harness-prevc-state.mjs transition --to complete --operator-action confirm

# Solicitar revisão com motivo
node ~/.omp/agent/scripts/harness-prevc-state.mjs transition --to revision_requested --operator-action revise
```
## O que isto prova e o que não prova

### O que prova
- Que o fluxo seguiu uma ordem auditável sem pular do pedido diretamente para a escrita de código.
- Que o escopo foi delimitado antes da execução e verificado contra critérios formais.
- Que a validação foi executada por agentes e ferramentas desvinculados do autor do código.

### O que NÃO prova
- Não prova que a solução arquitetural escolhida é a mais elegante ou escalável do mercado.
- Não elimina a necessidade de julgamento de valor de produto por parte do desenvolvedor.
- Não garante que branches externas ou ambientes remotos aceitarão a alteração sem conflitos de rede ou credenciais.

## Próximo passo

Aprofunde-se no controle de foco em [WIP=1](./wip-one) ou veja como as evidências são estruturadas em [Evidência e Handoff](./evidence-and-handoff).
