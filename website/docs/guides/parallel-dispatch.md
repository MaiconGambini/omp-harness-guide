---
sidebar_position: 3
---

# Dispatch Paralelo

> **Estado PREVC:** `execute` — o scheduler despacha lanes aprovadas; a evidência da fronteira é o gate full sobre a árvore reconciliada.

Executa as tasks de um plano em **subagents paralelos**, cada um com seu próprio papel, sob o controle de lifecycle do PREVC. O `scheduler` é o despachador da fase Execute: recebe o plano aprovado, despacha as lanes independentes ao mesmo tempo e reconcilia os resultados.

## Quando usar

- Plano com **lanes independentes** — arquivos disjuntos, sem dependência sequencial entre elas.
- Trabalho multi-componente onde partes distintas podem avançar juntas (ex: camada de autorização em paralelo com a de persistência).

**Quando NÃO usar:** plano WIP=1 estritamente serial, lanes que tocam o mesmo arquivo, ou feature de 1 arquivo. Nesses casos o overhead do scheduler não compensa — use o [fluxo de feature complexa](./complex-feature) ou de [tarefa pequena](./small-task).

## Como funciona no Oh My Pi

O Oh My Pi tem despacho paralelo **nativo** — nada a lançar:

- O `scheduler` despacha lanes independentes em **uma onda** `tasks[]` (até dezenas de subagents verdadeiramente concorrentes).
- Cada item de `tasks[]` nomeia um **source agent explícito** da lista de perfis instalados em `~/.omp/agent/agents/` — nunca perfis embutidos do runtime.
- Resultados são **entregues automaticamente**; não existe stub de background nem polling de status.
- `hub` coordena mensagens entre agents.
- Reviewers rodam concorrentes em uma onda (`code-reviewer` + `architecture-reviewer`).
- Suites de teste grandes são **sharded** entre agents `test-runner` (por arquivo/diretório/tag) e reconciliadas — nunca rode uma suite grande serialmente no agent principal.
- Cada lane roda o gate em `--mode local`; o gate full roda **uma vez** sobre a árvore reconciliada.

## A lane table

Antes de despachar, o `scheduler` monta uma tabela de lanes. Cada lane declara ownership de arquivo — **uma lane write-capable por arquivo de cada vez**:

```
┌──────┬─────────────────────────┬──────────────────────────┬──────┬──────────────┐
│ Lane │ Objetivo                │ Ownership (arquivos)     │ Dep  │ Capability   │
├──────┼─────────────────────────┼──────────────────────────┼──────┼──────────────┤
│ L1   │ Camada de autorização   │ authorization/, routes/  │ —    │ implementer  │
│ L2   │ Camada de persistência  │ area_bindings/sql_*.py   │ —    │ implementer  │
│ L3   │ Testes L1+L2            │ tests/...                │ L1,2 │ test-runner  │
└──────┴─────────────────────────┴──────────────────────────┴──────┴──────────────┘
```

Ownership que se cruza = lanes **não** independentes → serializa ou funde numa lane só. É regra de prompt, não lock: duas lanes no mesmo arquivo sobrescrevem uma à outra em silêncio.

## Autorização

- **Modo manual:** `/prevc prepare <objetivo>` para em `awaiting_plan_approval`; após aprovar, `/prevc run` autoriza o Execute.
- **Modo autônomo:** uma instrução para executar um plano/spec **nomeado** de ponta a ponta **é** a autorização. O run executa tudo, para **uma vez só** no `awaiting_confirmation` do spec inteiro, e interrompe no meio apenas por um bloqueio real: task que exige operador/live, mudança de escopo, push/deploy, ou falha de validação irrecuperável.

## Limites conhecidos

- A paralelização real depende do mecanismo nativo `task` do runtime; sem ele o dispatch seria serial.
- Ownership de arquivo é regra de prompt, não lock — para isolamento real entre lanes que colidem, use worktrees (veja [Portabilidade](./portability)).
- Dois schedulers no mesmo projeto disputam os mesmos arquivos — não rode dois runs paralelos na mesma pasta.
- Implementers não commitam: só o scheduler commita a árvore reconciliada. Commits locais de trabalho validado são permitidos uma vez que o run foi autorizado; push, deploy, troca de branch e worktrees exigem o operador.
