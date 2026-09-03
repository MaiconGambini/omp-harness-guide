---
sidebar_position: 5
---

# WIP=1

WIP=1 é uma restrição de foco cognitivo para o LLM: apenas uma unidade de trabalho pode estar ativa por vez. Imagine um desenvolvedor em uma bancada com um único ticket aberto. Ele pode anotar outros pedidos numa fila, mas não abre três implementações ao mesmo tempo e depois tenta lembrar qual teste pertence a qual mudança.

## Por que isso importa para um LLM

Trocar entre tarefas mistura arquivos, requisitos e resultados no contexto. Isso aumenta a chance de o modelo confundir uma decisão com outra ou relatar progresso que nunca foi executado. Uma unidade ativa mantém objetivo, evidência e próximo passo ligados ao mesmo problema.

| Com WIP=1 | Sem WIP=1 |
|---|---|
| O contexto aponta para um objetivo | Contextos e critérios se misturam |
| Cada bloqueio tem uma causa | Bloqueios ficam ambíguos |
| A evidência pertence a uma mudança | O progresso pode ser apenas presumido |
| O handoff tem uma próxima ação | A sessão termina com várias pontas |

## Como aplicar

Mantenha exatamente uma unidade como `in_progress`. Ao concluí-la, marque `passing` com evidência ou `blocked` com a causa exata. No OMP, `todo` e `feature_list.json` ou `tasks.md` tornam essa fronteira visível:

```json
{
  "id": "feat-001",
  "status": "in_progress",
  "title": "Health endpoint"
}
```

Descobriu trabalho adjacente? Coloque-o na fila como `not_started`, com um título e escopo claros. Continue apenas no ticket ativo; a próxima sessão poderá puxar o item enfileirado. Se o novo trabalho mudar o contrato, pare e peça aprovação para atualizar o escopo.

## Paralelismo sem perder foco

No despacho paralelo, WIP=1 se aplica a cada lane: uma lane tem um dono por arquivo e dependências declaradas. Lanes que compartilham arquivo são serializadas ou combinadas. O **OpenCode** fornece a metodologia, a referência e a continuidade entre sessões; o **Oh My Pi** fornece o motor nativo de **32 subagentes**, fan-out paralelo e sharding. O caminho OMP é relevante quando várias lanes independentes podem trabalhar sem misturar contexto; não use paralelismo para contornar WIP=1.

## Próximo passo

Veja [Evidência e Handoff](./evidence-and-handoff) para saber que prova fecha uma unidade.
