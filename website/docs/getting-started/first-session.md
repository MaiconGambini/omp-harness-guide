---
sidebar_position: 3
---

# Primeira Sessão

Este guia mostra como usar o harness em um projeto pela primeira vez.

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

## 3. Começar a sessão

Toda sessão produtiva começa com:

```text
/harness-session-start
```

Ele lê o estado, a lista de features, o handoff anterior e o comando de verificação. Ao final, declara a task ativa:

```text
Active task: feat-001 — Health endpoint. AC: curl /health returns 200.
```

## 4. Executar trabalho com PREVC

Para trabalho significativo:

```text
/prevc prepare Adicionar endpoint de health check
```

O PREVC gerencia o ciclo de vida: planeja, revisa, executa, valida, julga, refina e confirma. Cada fase mantém o escopo aprovado. A fase é durável — cada transição é gravada por `harness-prevc-state.mjs` no arquivo de fase durável do projeto e sobrevive entre sessões.

## 5. Encerrar a sessão

Ao final, sempre execute:

```text
/harness-clean-handoff
```

Ele registra o que foi feito, o que quebrou e a próxima ação. A próxima sessão lê esses arquivos e sabe exatamente onde continuar.

## Próximo passo

Leia [Por que um harness?](../concepts/why-a-harness) para entender o problema que o harness resolve.
