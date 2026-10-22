---
sidebar_position: 1
---

# Casos de Uso

A seção de casos de uso orienta a seleção do workflow adequado com base na classificação de risco, dependências e impacto arquitetural de cada tarefa. Escolha o fluxo pelo risco e pelas dependências, não apenas pelo número de arquivos. O Quality Gate avalia as métricas declaradas em `agent-os/quality-thresholds.json`, e sinais ausentes ou ferramentas com falha configuram lacunas explícitas (*fail-closed*), nunca aprovação tácita.

| Cenário | Seleção recomendada | Governança e evidência |
|---|---|---|
| Tarefa simples em um arquivo | Uma lane curta, WIP=1 | Tier `low`, verificação local e gate rápido. |
| Correção de bug | Reprodução, fail-before e regressão | Regra "bug vira teste": prova de falha no commit base antes do patch. |
| Feature complexa | Spec, contrato e lanes por ownership | Tier `sampling` ou `full`, gate completo e recibo formal do Judge. |
| Multitarefa independente | Lanes paralelas (`tasks[]`) | Propriedade disjunta de arquivos; envelopes individuais reconciliados. |
| Multitarefa dependente | Lanes serializadas por dependência | Execução sequencial; liberação após evidência da etapa anterior. |
| Trabalho multi-sessão | Estado durável e handoff | `session-handoff.md` com seções `Verified Now` e `Broken Or Unverified`. |
| Alto risco ou segurança | Tier `full` e auditoria de segurança | Red-team obrigatório (N >= 3 tentativas comprovadas) e contrato `authz_controls`. |
| Onboarding de projeto | `/maestri-team` e inicialização | Setup de perfil, cérebro com Obsidian + Graphify e template de PR. |
| Triagem de tarefas | Planejamento PREVC ou skill local | Pergunta "Vale construir?", tier de risco (`risk:*`) e procedimento de reversão. |
| Documentação apenas | Lane de docs e checagem de links | Validação de build estático sem alterar runtime nem expor dados privados. |
| Ciclo Refine e regras | Judge, Refine e aprovação humana | Proposta somente-leitura; inclusão no ledger em alteração separada. |
| Retomada de sessão | `/harness-session-start` | Briefing path-scoped delimitado ancorado em `sourceHash`. |

## Tarefa simples em um arquivo

**Quando usar:** alteração localizada, requisito claro, sem adição de dependências externas, migrações de banco ou impacto em caminhos críticos.

**Exemplo de prompt:**
```text
/prevc prepare Corrija o texto vazio em src/components/EmptyState.tsx. Altere
somente esse arquivo e rode o teste da área e o gate local.
```

**Comportamento esperado:** O PREVC cria a unidade WIP=1, valida o escopo estrito, executa os testes do módulo e afere o gate local. Se o diff acumulado for baixo e não tocar áreas sensíveis, o router mantém o tier `low`.

## Correção de bug ("Bug vira teste")

**Quando usar:** qualquer correção de defeito funcional reportado.

**Exemplo de prompt:**
```text
/prevc prepare Reproduza o erro de paginação com offset negativo. Crie um teste
de regressão demonstrando a falha antes da correção, aplique o patch mínimo e valide.
```

**Comportamento esperado:**
1. O agente elabora o teste que comprova o erro no código original (*fail-before*).
2. O patch é aplicado na implementação.
3. O teste é executado novamente comprovando a resolução (*pass-after*).
4. O Quality Gate afere se a métrica `eval_regressions` permanece limpa.

## Feature complexa

**Quando usar:** múltiplos módulos afetados, novos contratos de API, alterações de esquema ou integrações entre serviços.

**Exemplo de prompt:**
```text
/prevc prepare Projete e implemente o fluxo de exportação de relatórios assíncronos.
Especifique contratos, separe ownership entre worker e API, e aguarde aprovação.
```

**Comportamento esperado:** PREVC produz especificação em `agent-os/specs/`, define não-escopo e critérios de aceite. O scheduler divide a implementação em lanes com arquivos disjuntos. O gate completo roda no tier `sampling` ou `full`, o revisor em modelo concorrente analisa o diff com base em `docs/review.md`, e o Judge emite o recibo final.

## Alto risco ou segurança

**Quando usar:** toques em rotas de autenticação, validação de tokens, autorização de usuários, faturamento ou regras de governança do próprio harness.

**Exemplo de prompt:**
```text
/prevc prepare Atualize a expiração de tokens de sessão. Classifique como alto
risco, exija tier full, execute os testes de autorização e o red-team de segurança.
```

**Comportamento esperado:**
- O roteador classifica a iniciativa compulsoriamente como tier `full`.
- O runner `harness-security-contract` executa as checagens declaradas de `authz_controls`.
- O auditor de segurança do operador executa os testes na superfície alterada (red-team com N >= 3 tentativas comprovadas), registrando o parecer amarrado ao `sourceHash`.
- A conclusão exige aprovação humana explícita do operador; a autoconfirmação é desativada para tarefas críticas.

## Onboarding de novo projeto com time Maestri

**Quando usar:** ao introduzir o harness em um repositório existente ou inicializar uma nova aplicação.

**Exemplo de prompt:**
```text
/maestri-team --apply
```

**Comportamento esperado:** O harness recruta e organiza os papéis de agentes especializados no Maestri, audita se o projeto possui template de PR, contratos de revisão por área (`docs/review.md`), perfil em `agent-os/` e inicializa o segundo cérebro (Obsidian + Graphify).

## Triagem de tarefas e classificação de risco

**Quando usar:** ao receber uma nova demanda técnica ou issue de produto no Linear ou rastreador de tarefas.

**Exemplo de prompt (via comando PREVC nativo ou skill local do operador `triagem-task`, mantida fora do pacote público):**
```text
/prevc prepare Fazer triagem da migração para WebSocket avaliando se vale construir, risco e reversão
```

**Comportamento esperado:** O fluxo (apoiado pela rotina de triagem do operador ou pelas diretrizes de planejamento) questiona formalmente se a demanda "vale a pena ser construída", define a etiqueta de risco (`risk:low`, `risk:medium`, `risk:high`), antecipa o procedimento de reversão (`Como reverter`) e especifica qual teste de regressão durável deverá ser entregue.
## O que isto prova e o que não prova

### O que prova
- Que cada tipo de tarefa recebe o nível proporcional de rigor, teste e validação de segurança.
- Que procedimentos de reversão e testes de regressão são planejados antes de tocar no código de produção.

### O que NÃO prova
- A categorização não substitui o julgamento crítico do engenheiro humano caso um bug complexo exija refatoração profunda de arquitetura.

## Próximo passo

Entenda os compromissos e custos operacionais desse modelo em [Prós e Contras](./pros-and-cons) ou veja as salvaguardas em [Segurança](./security).
