---
sidebar_position: 2
---

# Prós e Contras

Uma avaliação honesta do que o harness entrega e do que ele custa.

## Prós

### Continuidade entre sessões

Você abre o Oh My Pi amanhã e ele sabe exatamente o que estava fazendo. A fase PREVC é durável (arquivo de fase persistente), e o handoff diz a única próxima ação. Não precisa reexplicar o contexto, reler arquivos ou adivinhar o que ficou pendente.

### WIP=1 forçado

A disciplina de uma tarefa por vez reduz trabalho paralelo abandonado. Cada feature vai até o fim ou é registrada como bloqueada com causa exata.

### Evidência objetiva

"Funcionou" não é suficiente. O harness exige comandos rodados, output capturado e verificação em três camadas antes de marcar uma feature como concluída.

### Despacho paralelo nativo

O mecanismo `task` do Oh My Pi executa lanes e shards de teste em paralelo real, com entrega automática de resultados — sem stub de background nem polling.

### Auditoria e recuperação

Decisões, blockers e handoffs ficam registrados em arquivos. O rastreio nativo (`pi.on`) grava um envelope redigido verificável. Se algo quebrar, você sabe quando, por que e qual era o estado anterior.

### Planejamento separado da execução

Para tarefas complexas, o harness separa os papéis de planner, generator e evaluator. Isso reduz o viés de auto-avaliação.

## Contras

### Mais arquivos

O harness adiciona `feature_list.json`, `docs/harness/progress.md`, `session-handoff.md`, `sprint-contract.md`, `agent-os/` e outros. Para projetos pequenos, isso pode parecer burocracia.

### Disciplina constante

WIP=1, verificação em três camadas e handoff obrigatório exigem disciplina em toda sessão. Pular etapas reduz o valor do harness.

### Custo de manutenção

Os arquivos de estado precisam ser mantidos atualizados. Se o `progress.md` ficar desatualizado, a próxima sessão começa com informação errada.

### Não substitui boa engenharia

O harness não garante qualidade de código; estrutura a rastreabilidade por meio de evidências. Um código ruim continua sendo código ruim mesmo quando as evidências são completas.

### Curva inicial

A primeira sessão com harness requer aprender comandos, conceitos e o fluxo PREVC. O investimento se paga em projetos longos, mas pode ser excessivo para tarefas únicas.

### Instalação limpa, sem merge

Não existe merge automático sobre uma configuração existente. A migração de layout legado é assistida e preserva arquivos não gerenciados, mas você ainda precisa planejar o backup.
