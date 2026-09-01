---
sidebar_position: 6
---

# Evidência e Handoff

> **Estado PREVC:** `validate → judge → confirm` — conclusão exige evidência real; confirmação exige o operador e um handoff.

O harness exige que toda conclusão tenha evidência — não basta "funcionou na minha máquina".

## Camadas de verificação

Antes de declarar uma feature como concluída, três camadas são verificadas:

1. **Static** — typecheck e lint passam.
2. **Runtime** — os critérios de aceite do contrato são observáveis; comandos foram rodados e o output foi registrado.
3. **System** — o comando de verificação do projeto sai com código 0, e `feature_list.json` e o arquivo de progresso refletem o novo estado.

## O envelope de evidência da lane

Cada lane devolve um envelope terminal pequeno e estruturado:

- status (`completed | blocked | needs_input`);
- arquivos realmente escritos;
- evidência (saída real de comando, não descrição);
- tentativas que falharam;
- decisão, blocker e próximo passo.

## Exemplo de evidência

```json
{
  "id": "feat-005",
  "status": "passing",
  "evidence": "curl /api/health -> 200 OK, typecheck: OK, pytest: 23 passed"
}
```

A evidência contém output real, não uma descrição do que deveria acontecer.

## Rastreio auditável

O rastreio nativo (`harness-omp-trace.ts`) grava o spine de runtime — sessões, runs, tools e modelos — em um envelope redigido. Ele consome apenas eventos do barramento de extensões (`pi.on`): `session_start`, `session_switch`, `agent_start`, `tool_execution_start`, `tool_execution_end`, `agent_end`, `session_shutdown`. Registros de ferramenta carregam apenas o nome e o id da chamada — nunca os corpos de entrada/saída.

O stream só é evidência de auditoria depois que a verificação passa:

```powershell
node ~/.omp/agent/scripts/harness-trace.mjs --verify --root .
```

Quebras de cadeia de hash ou linhas ilegíveis falham fechado (exit 2) e recusam novas gravações até o reparo.

## Handoff

Toda sessão termina com `/harness-clean-handoff`. Ele preenche:

- **Verified Now** — o que foi concluído nesta sessão.
- **Changed** — arquivos modificados.
- **Broken** — o que quebrou (se algo quebrou).
- **Next Best Step** — a única próxima ação.

Se o trabalho não terminou, o handoff ainda é feito — a feature vai para `blocked` com a causa exata e o `Next Best Step` diz exatamente o que fazer.

A conclusão do ciclo exige também um handoff presente: a transição `awaiting_confirmation → complete` só acontece com confirmação do operador **e** um `docs/harness/session-handoff.md` existente.
