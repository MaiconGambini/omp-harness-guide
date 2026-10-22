---
sidebar_position: 3
---

# Primeira Sessão

A primeira sessão orienta o desenvolvedor passo a passo a auditar, inicializar e conduzir uma tarefa sob o ciclo PREVC com o pacote público do Oh My Pi. O fluxo pressupõe uma instalação base do Oh My Pi e a cópia da distribuição pública `omp/agent/` para `~/.omp/agent`.

![Fluxo de início de sessão e perfil automático](/omp-harness-guide/img/diagrams/inicio-de-sessao.png)
*Detecção de perfil de projeto, carregamento de cérebro e inicialização da sessão.*


## 1. Auditar o projeto

Dentro do Oh My Pi, execute:

```text
/harness-init
```

Esse comando inspeciona o projeto sem modificar nada. Ele procura por:

- Instruções do projeto (AGENTS.md, CLAUDE.md, CONTEXT.md).
- Estado de progresso (`docs/harness/progress.md`, STATE.md).
- Estado de features (`feature_list.json`, `tasks.md`).
- Comandos de verificação e startup.
- Skills, extensões, MCPs e postura de segurança.

O resultado é um relatório de gaps — o que existe, o que falta e o que seria criado.

## 2. Instalar o pacote completo (opcional)

Se o projeto é novo ou você quer padronizá-lo:

```text
/harness-bootstrap
```

O bootstrap propõe um pacote completo com confirmação explícita. Ele detecta a stack do projeto e mostra cada arquivo como **create**, **merge** ou **skip** antes de escrever.

## 3. Onboarding automático e início de sessão

No primeiro turno de qualquer sessão aberta dentro de um repositório, o harness detecta a stack técnica, identifica o perfil do projeto e consulta o registro do segundo cérebro (Obsidian + Graphify). Regras de arquitetura e preferências do projeto são carregadas automaticamente na memória operacional antes de qualquer pedido.

Para formalizar a sessão de trabalho e alinhar o contexto:

```text
/harness-session-start
```

Esse comando lê o estado corrente, a lista de features (`feature_list.json`), o último handoff e os comandos de verificação configurados. Em seguida, declara a tarefa ativa com seus critérios de aceitação:

```text
Active task: feat-001 — Health endpoint. AC: curl /health returns 200.
```

## 4. Montar o time de especialistas com `/maestri-team` (opcional)

Se o seu ambiente inclui o Maestri para coordenação multiagente em canvas, monte a equipe especializada para o projeto:

```text
/maestri-team --dry-run
```

O script `harness-maestri-team.mjs` exige explicitamente a opção `--dry-run` ou `--apply`. O comando slash `/maestri-team` gerencia essa escolha com base no consentimento do operador: ao passar `--dry-run` (ou `preview`), ele executa apenas a descoberta e exibe o relatório de papéis planejados sem criar terminais. Quando invocado sem `--dry-run`, o comando constitui consentimento explícito para recrutar a equipe e executa o script com `--apply`, provisionando os especialistas necessários. Em sessões posteriores, a flag `--reset` permite reiniciar terminais reutilizados mantendo as restrições de ferramentas e o histórico compartilhado.

## 5. Executar trabalho com PREVC

Para trabalho significativo:

```text
/prevc prepare Adicionar endpoint de health check
```

`/prevc prepare` inicia a fase **Prepare**, que agrupa `prepare` e `plan`.
Depois da aprovação explícita do operador, `/prevc run` coloca o runtime em **Execute**,
despachando lanes independentes com `task` em `tasks[]` e coordenando mensagens com
`hub` quando o plano permitir. A fase **Validate** reúne `validate` e `judge`, avaliando os
critérios de aceitação contra um Judge read-only.

A fase **Confirm** reúne `refine` e `confirm`:

```text
prepare → plan → execute → validate → judge → refine → confirm
```

No arquivo de estado durável do lifecycle (`harness-prevc-state.mjs`), essa esteira conceitual mapeia diretamente para os estados canônicos: `prepare` → `awaiting_plan_approval` → `execute` → `validate` → `judge` → `refine` → `awaiting_confirmation` → `complete`.

Por padrão, o **`autoConfirm` está desligado**: a transição final para conclusão exige confirmação deliberada do operador humano (`--operator-action confirm`). Nenhum agente se autoconfirma tacitamente. O recurso de autoconfirmação com critérios é estritamente opt-in e, mesmo quando habilitado, exige que todas as métricas críticas do gate estejam verdes e medidas.

Cada transição de fase é durável, gravada por `harness-prevc-state.mjs` no arquivo de estado do projeto, sobrevivendo a reinicializações ou quedas de conexão.

## 6. Encerrar a sessão com handoff limpo

Ao final, sempre execute:

```text
/harness-clean-handoff
```

Ele registra o que foi feito, o que quebrou e a próxima ação. A próxima sessão lê esses arquivos e sabe exatamente onde continuar.

## O que isto prova e o que não prova

- **O que prova:** que o ciclo de trabalho avança por etapas auditáveis gravadas em disco, que o onboarding recupera o perfil e o cérebro do projeto na inicialização e que o encerramento preserva o contexto exato para o próximo turno.
- **O que não prova:** não prova que a solução arquitetural implementada é a mais eficiente nem que a cobertura de testes é suficiente para todos os cenários de produção.

## Próximo passo

Leia [Por que um harness?](../concepts/why-a-harness) para entender os princípios fundamentais e os componentes de isolamento e continuidade.
