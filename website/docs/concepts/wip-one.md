---
sidebar_position: 5
---

# WIP=1

WIP=1 (*Work In Progress = 1*) é a disciplina central de foco cognitivo do harness: **apenas uma unidade atômica de trabalho pode estar ativa por vez**.

Assim como um desenvolvedor sobrecarregado com múltiplos tickets simultâneos começa a trocar variáveis, omitir validações e presumir erroneamente que um teste passou, um modelo de linguagem exposto a múltiplos objetivos dispersa seus tokens de atenção (*context mixing*), perde o controle das restrições e alucina conclusões.

## Restrição cognitiva para modelos de linguagem

A janela de contexto de um LLM comporta-se exatamente como a memória de trabalho humana:

- **Sem WIP=1:** O agente recebe solicitações misturadas (ex.: "implemente autenticação, refatore o banco e corrija o botão de login"). O modelo tenta editar múltiplos módulos sem ordem definida, gera diffs extensos e quase impossíveis de auditar, e com frequência afirma que terminou sem sequer testar.
- **Com WIP=1:** 100% da capacidade do modelo foca em uma especificação delimitada. O agente sabe exatamente qual é o objetivo, quais arquivos tem permissão para alterar e qual comando demonstrará a conclusão.

## Comparativo: Com vs Sem WIP=1

| Com WIP=1 | Sem WIP=1 |
|---|---|
| Uma funcionalidade é concluída com evidência real capturada. | Várias alterações são iniciadas simultaneamente e nenhuma termina. |
| Bloqueios são registrados com causa exata no handoff. | Bloqueios acumulam-se silenciosamente na conversa. |
| O escopo da sessão é cirúrgico e o diff é facilmente revisável. | A sessão salta entre arquivos gerando diffs caóticos e poluídos. |
| O handoff descreve exatamente uma única próxima ação clara. | O handoff lista itens vagos e incompletos "em andamento". |

## Como funciona na prática

O harness mantém exatamente uma unidade com status `in_progress` no arquivo de rastreamento (`todo` ou `tasks.md`):

```json
{
  "id": "feat-001",
  "status": "in_progress",
  "title": "Adicionar middleware de autenticação JWT"
}
```

Se durante o desenvolvimento você ou o agente descobrirem trabalho adjacente (por exemplo, um bug periférico ou uma oportunidade de refatoração):
1. **Não amplie o escopo silenciosamente.**
2. Registre o novo item na fila com status `not_started`.
3. Mantenha o foco estrito na tarefa ativa até sua conclusão e validação.
4. A nova tarefa será processada em seu próprio ciclo isolado.

## Dispatch paralelo e propriedade exclusiva de arquivos

Quando o plano prevê execução paralela de lanes (`tasks[]`), o princípio de WIP=1 continua valendo por unidade de execução:
- Cada subagente recebe **exatamente uma unidade ativa**.
- Cada lane possui um **conjunto disjunto de arquivos** sob sua responsabilidade (*declared file ownership*).
- É proibido que duas lanes paralelas editem os mesmos arquivos simultaneamente. Tarefas com dependência de código devem ser executadas em sequência, nunca em paralelo.

## Limite de ciclos de correção (fixLoop)

Para evitar que a disciplina de foco degenere em um ciclo infinito de tentativas improdutivas, o harness estabelece `fixLoop.maxAttempts` como **3 tentativas** no macro-loop de validação. Se após três correções o teste não passar, a execução é pausada para avaliação do operador humano, prevenindo consumo excessivo e descontrolado de tokens.

## O que isto prova e o que não prova

### O que prova
- Que as alterações no repositório foram produzidas de forma atômica e com rastreabilidade direta a um único objetivo.
- Que o agente operou sob restrições estritas de escopo de arquivos.

### O que NÃO prova
- Não prova que a tarefa escolhida como prioritária era a mais importante do ponto de vista estratégico de negócios.
- Não substitui a necessidade de planejar previamente a decomposição de tarefas complexas em passos atômicos.

## Próximo passo

Veja como as evidências atômicas de uma unidade são estruturadas em [Evidência e Handoff](./evidence-and-handoff) ou conheça as regras de inspeção em [Quality Gate](./quality-gate).
