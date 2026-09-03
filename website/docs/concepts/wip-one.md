---
sidebar_position: 5
---

# WIP=1

WIP=1 é uma restrição de foco cognitivo para o LLM: apenas uma unidade de trabalho pode estar ativa por vez. Imagine um desenvolvedor em uma bancada com um único ticket aberto. Ele pode anotar outros pedidos numa fila, mas não abre três implementações ao mesmo tempo e depois tenta lembrar qual teste pertence a qual mudança.

WIP=1 (*Work In Progress = 1*) significa que apenas uma unidade atômica de trabalho pode estar ativa por vez. É a disciplina central do harness e a principal salvaguarda contra alucinações e dispersão.

## Restrição cognitiva para modelos de linguagem

A janela de contexto de um LLM comporta-se exatamente como a memória de trabalho de um desenvolvedor humano:

- **A analogia do desenvolvedor sobrecarregado:** Se você tentar implementar autenticação, refatorar o banco de dados e corrigir um bug de CSS ao mesmo tempo, sua mente começará a trocar nomes de variáveis, ignorar validações de segurança e assumir erradamente que algo já foi testado.
- **Nos modelos de linguagem:** Quando um agente recebe múltiplos objetivos simultâneos, os tokens de atenção se dispersam. O modelo sofre de *context mixing* (mistura de escopos), perde o foco das restrições e alucina que tarefas foram completadas com sucesso.
- **Com WIP=1:** 100% da atenção do modelo é dedicada a um único contrato delimitado. O agente sabe exatamente o que está fazendo, qual arquivo possui autorização para tocar e como provar que terminou.

## Comparativo: Com vs Sem WIP=1

| Com WIP=1 | Sem WIP=1 |
|---|---|
| Uma feature é concluída com evidência real | Várias features são iniciadas e nenhuma termina |
| Bloqueios são registrados com causa exata | Bloqueios se acumulam silenciosamente no chat |
| O escopo de cada sessão é cirúrgico e previsível | A sessão pula entre tarefas gerando diffs caóticos |
| Handoff descreve exatamente uma próxima ação | Handoff lista várias coisas vagas "em andamento" |
## Como funciona

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

Se você descobrir trabalho adjacente durante uma tarefa:

1. Adicione a nova tarefa como `not_started`.
2. Continue trabalhando apenas na tarefa ativa.
3. A nova tarefa será puxada na próxima sessão.

Não expanda o escopo silenciosamente. Se o escopo crescer, pare, atualize o contrato e peça aprovação.

## Dispatch e lanes

No despacho paralelo, WIP=1 vale por lane: uma lane tem um único dono por arquivo e dependências declaradas. Lanes que tocam o mesmo arquivo não são independentes — são serializadas ou fundidas. O scheduler nunca absorve mudanças de escopo; apenas o escopo aprovado executa.
## OpenCode vs Oh My Pi no WIP=1

- **OpenCode como adaptador de continuidade:** O OpenCode organiza o estado
  durável e o handoff que preservam a unidade ativa entre sessões.
- **Oh My Pi como motor nativo:** O OMP implementa WIP=1 com `todo` e permite
  dispatch por `scheduler`; cada lane despachada em `tasks[]` recebe sua
  própria unidade ativa e ownership declarado.
- **Uso condicionado:** escolha dispatch somente quando o plano declarar lanes
  independentes, arquivos sem sobreposição e dependências explícitas. Essa
  combinação reduz o risco de colisões operacionais, mas não substitui locks,
  worktrees ou validação do resultado.

## Próximo passo

Veja [Evidência e Handoff](./evidence-and-handoff) para saber que prova fecha uma unidade.
