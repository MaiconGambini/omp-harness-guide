---
sidebar_position: 6
---

# Evidência e Handoff

Uma conclusão confiável não é uma frase como "funcionou na minha máquina". É uma sequência de provas que sobe da afirmação até o comportamento observado em um sistema rodando. O handoff transforma essa prova em contexto consumível pela próxima sessão.

## Os cinco degraus da evidência

Os degraus são cumulativos e estão ordenados do mais fraco ao mais forte:

1. **Rung 1 — Assertion (afirmação):** o agente declara que terminou ou que algo deveria funcionar. A prova esperada é apenas o texto da afirmação. Serve como intenção, mas não demonstra execução.
2. **Rung 2 — Artifact (artefato):** arquivos, diff ou estado persistido mostram o que mudou. A prova esperada é o caminho dos arquivos e o conteúdo revisável. Demonstra mudança, não comportamento.
3. **Rung 3 — Command output (saída de comando):** um comando de verificação foi executado e sua saída e código de saída foram registrados. A prova esperada identifica comando, diretório, resultado e falhas. Demonstra uma checagem reproduzível.
4. **Rung 4 — Acceptance (aceite observável):** cada critério de aceite é ligado a um resultado observado, com revisão ou gate apropriado ao risco. A prova esperada é uma tabela ou registro critério → evidência, incluindo o que ficou bloqueado.
5. **Rung 5 — Live running verification (verificação ao vivo):** o sistema real é iniciado e o caminho alterado é exercitado. A prova esperada inclui comando de inicialização, ação ou requisição, resposta observada, logs relevantes e código de saída. Este é o degrau mais forte.

Não promova uma conclusão para um degrau sem a prova correspondente. Um Rung 1 não substitui um Rung 5, e uma saída de teste não prova por si só que o fluxo ao vivo foi exercitado.

## Camadas de verificação

Antes de declarar uma feature como concluída, três camadas estruturadas são verificadas:

1. **Static (Rung 3)** — typecheck, linters e validações de schema passam.
2. **Runtime (Rungs 4–5)** — critérios de aceite são demonstrados com comandos reais rodados no terminal e saída capturada.
3. **System** — o comando de verificação unificado do projeto sai com código 0, e o estado persistido reflete a conclusão.

## O envelope de evidência da lane

Cada lane retorna ao pai um envelope curto com exatamente quatro chaves:

```json
{
  "status": "ok",
  "summary": "resultado conciso da lane",
  "artifact": "local://evidencia-completa",
  "failures": []
}
```

`status` aceita `ok` ou `error`; `artifact` e `failures` são opcionais. O
envelope filho não inclui `files`, `verification`, `blocker` nem `next_step`.
Esses dados pertencem ao scheduler e ao registro da sessão pai, que
reconcilia arquivos, verificações, bloqueios e a próxima ação. O envelope
filho deve apontar logs longos para `local://` ou `artifact://`.

## Handoff para a próxima sessão

Use esta estrutura, mesmo quando o trabalho está bloqueado:

```text
Verified now: resultado concluído e maior rung alcançado
Changed: arquivos modificados e contrato afetado
Evidence: comandos, saídas, códigos de saída e links para artefatos
Broken: falhas reproduzíveis ou "none"
Decisions: escolhas que a próxima sessão deve preservar
Next best step: uma única ação, com pré-condição se houver
```

O próximo agente deve conseguir retomar sem reconstruir decisões pela memória da conversa. Se nada foi concluído, registre `blocked`, a causa exata e a ação exata que destrava o trabalho. O handoff não transforma uma afirmação em prova.


## Identidade e continuidade

O **OpenCode** fornece a metodologia e a referência para interpretar esses degraus, além da continuidade entre sessões. O **Oh My Pi** fornece o motor nativo de **32 subagentes**, fan-out paralelo e sharding para coletar provas de lanes independentes. O caminho OMP é relevante quando a verificação pode ser dividida sem compartilhar arquivos ou contexto; a evidência de cada lane continua separada e deve ser reconciliada.

## Próximo passo

A conclusão do ciclo exige também um handoff presente: a transição `awaiting_confirmation → complete` só acontece com confirmação do operador **e** um `docs/harness/session-handoff.md` existente.

## PREVC, OpenCode e Oh My Pi na coleta de evidências

PREVC define a evidência exigida como contrato comum. O OpenCode atua como
adaptador metodológico e de continuidade, organizando artefatos e handoffs. O
Oh My Pi fornece o motor nativo para coletar evidência no runtime: por exemplo,
`hub(op="start")` supervisiona processos, portas e logs quando a lane tem essa
capacidade autorizada.

O uso de processos vivos e Rung 5 é condicionado ao critério de aceite e ao
plano da tarefa. O fato de uma ferramenta existir não prova que uma execução
ocorreu; o recibo precisa conter a saída real e passar pela verificação
correspondente.

Veja [PREVC](./prevc) para o ciclo de entrega ou [Continual Harness](./continual-harness) para continuidade e melhoria.
