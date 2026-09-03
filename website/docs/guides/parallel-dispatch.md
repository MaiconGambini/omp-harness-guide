---
sidebar_position: 3
---

# Dispatch Paralelo

> **Estado PREVC:** `execute` — o scheduler despacha lanes aprovadas; a evidência da fronteira é o gate full sobre a árvore reconciliada.
>
> Este guia complementa [Harness Contínuo](../concepts/continual-harness). O
> exemplo de dispatch abaixo é específico e experimental: mostra a forma do
> fluxo nativo do OMP, não um benchmark nem uma receita para qualquer projeto.

Executa as tasks de um plano aprovado em **agents paralelos**, cada um com seu
próprio papel e ownership, sob o controle do lifecycle PREVC. O `scheduler` é
o despachador da fase Execute: recebe o plano aprovado, despacha as lanes
independentes e reconcilia os resultados.

## Refactor FastAPI + Supabase

**Prompt:** `Refatore o serviço de projetos: L1 move a autorização FastAPI para authorization/projects.py, L2 move a repository query para repositories/projects.py e L3 atualiza testes IDOR em tests/test_projects_authorization.py. Preserve a política RLS e não toque nos arquivos das outras lanes. Execute o plano até o handoff, com evidência.`

Antes do fan-out, OMP registra a lane table:

## Como funciona no Oh My Pi

O Oh My Pi tem despacho paralelo **nativo** — não há launcher adicional:

- O `scheduler` despacha lanes independentes em uma onda `tasks[]`.
- Cada item de `tasks[]` nomeia um **source agent explícito** da lista de
  perfis instalados em `~/.omp/agent/agents/`.
- Resultados são entregues automaticamente; não existe stub de background nem
  polling de status.
- `hub` coordena mensagens entre agents.
- Reviewers podem rodar concorrentes em uma onda, quando o plano separar seus
  ownerships.
- Suites de teste grandes podem ser shardadas entre agents `test-runner` por
  arquivo, diretório ou tag, quando os shards forem independentes.
- Cada lane roda o gate em `--mode local`; o gate full roda uma vez sobre a
  árvore reconciliada.


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

Ownership é uma regra de prompt, não lock. Lanes que compartilham arquivo são serializadas. A policy Supabase fica fora das lanes porque não deve ser alterada pelo refactor.

## Exemplo específico e experimental: quatro módulos

O exemplo abaixo usa quatro lanes independentes para ilustrar a forma da
chamada `task` e o particionamento de testes. Os nomes de arquivos, agentes e
shards são demonstrativos; substitua-os pelo ownership real do plano.

### 1. Despacho concorrente via ferramenta `task`


```json
{
  "context": "# Objetivo: Refatorar validação de esquemas em 4 domínios independentes sem tocar arquivos compartilhados.",
  "tasks": [
    { "name": "AuthShard", "agent": "implementer", "task": "Refatorar validação em src/auth/schemas.py e rodar pytest tests/test_auth.py." },
    { "name": "BillingShard", "agent": "implementer", "task": "Refatorar validação em src/billing/schemas.py e rodar pytest tests/test_billing.py." },
    { "name": "CatalogShard", "agent": "implementer", "task": "Refatorar validação em src/catalog/schemas.py e rodar pytest tests/test_catalog.py." },
    { "name": "NotificationShard", "agent": "implementer", "task": "Refatorar validação em src/notifications/schemas.py e rodar pytest tests/test_notifications.py." }
  ]
}
```

Durante a execução, subagentes comunicam-se via `hub(op="send", to="AuthShard", message="...")` caso necessitem sincronizar tipos compartilhados, sem bloquear o thread principal.

### 2. Rastro de evidência observável (formato ilustrativo)

Cada lane deve retornar um envelope de conclusão com código de saída e tempo
de execução. Os valores seguintes são fictícios e mostram apenas o formato:

```text
[AuthShard]         completed in <tempo> -> pytest tests/test_auth.py: <resultado> (exit 0)
[BillingShard]      completed in <tempo> -> pytest tests/test_billing.py: <resultado> (exit 0)
[CatalogShard]      completed in <tempo> -> pytest tests/test_catalog.py: <resultado> (exit 0)
[NotificationShard] completed in <tempo> -> pytest tests/test_notifications.py: <resultado> (exit 0)
Reconciliação da árvore: <quantidade> shards mesclados com <quantidade> conflitos de arquivo.
Gate full sobre a árvore reconciliada: <resultado>.
```

O envelope precisa carregar saída real quando usado em uma execução; este
trecho não fornece evidência de uma execução.


### 3. Cálculo ilustrativo de wall-clock

A fórmula abaixo explica como medir uma execução, mas os números são
ilustrativos. Sem uma medição reproduzível do mesmo plano em modo sequencial e
em dispatch OMP, não há claim de redução de tempo.

| Métrica | Baseline sequencial ilustrativo | Dispatch OMP ilustrativo (4 lanes) |
|---|---:|---:|
| Shard 1 | 32,0 s | 31,4 s |
| Shard 2 | 32,0 s | 32,0 s |
| Shard 3 | 32,0 s | 29,8 s |
| Shard 4 | 32,0 s | 30,5 s |
| Overhead de coordenação | 0,0 s | 0,0 s |
| **Wall-clock total** | **128,0 s** | **32,0 s** |

```text
Redução = (T_sequencial - T_paralelo) / T_sequencial
        = (128,0s - 32,0s) / 128,0s
        = 75,0%  # cálculo do exemplo, não resultado publicado
```

Na prática, meça o plano no ambiente de destino e registre o comando, a
revisão, a configuração, o número de lanes, a saída e o custo de reconciliação
antes de comparar execuções. A duração do shard mais lento pode limitar o
wall-clock, mas isso não prediz o ganho de outro plano.

## Autorização

O scheduler do OMP usa `task` para despachar uma lane e `tasks[]` para uma onda de lanes independentes; `hub` coordena decisões e bloqueios entre agents:

```text
tasks[] = [
  {agent: "implementer", task: "L1", owns: ["authorization/projects.py"]},
  {agent: "implementer", task: "L2", owns: ["repositories/projects.py"]}
]
hub.send("L1", "publique o contrato CurrentUser antes de L2 começar")
```

Quando L1 e L2 terminam, `task` inicia L3 com os dois resultados. Reviewers e shards de testes também podem rodar em ondas separadas. O motor nativo de 32 subagents torna esse fan-out real, em vez de uma fila serial; o limite prático continua sendo CPU, rate limits e arquivos compartilhados.

## Evidência e continuidade

**Prompt de execução:** `Execute plan agent-os/specs/projects-refactor end to end; use tasks[] para lanes independentes, hub para coordenação, respeite ownership e pare no awaiting_confirmation final.`

**Terminal representativo:**

```powershell
cd C:\projetos\project-api
uv run pytest tests/test_projects_authorization.py -q
git diff --check
```

**Saída esperada/representativa** (não executada neste guia):

```text
L1 completed: authorization/projects.py
L2 completed: repositories/projects.py
hub: L3 unblocked after L1,L2
tests/test_projects_authorization.py ... 3 passed in 0.42s
handoff: 3 lanes reconciled; RLS unchanged; awaiting_confirmation
```

O handoff do OpenCode enfatiza metodologia, escopo, continuidade e próximos passos. No OMP, o scheduler entrega automaticamente os resultados, reconcilia a árvore e registra esse mesmo rastro sem polling manual.

## Medição, não promessa

Em uma execução observada/representativa do refactor, três lanes levaram **40 minutos serialmente** e **10 minutos em paralelo**. A redução calculada é `(40 - 10) / 40 = 0,75`, ou **75%**. Isso é uma medição de exemplo, não uma garantia: repita o cronômetro no seu projeto e registre o antes/depois junto com o hash da árvore reconciliada.

## Limites

- Não rode dois schedulers na mesma pasta.
- Não use fan-out para lanes que editam o mesmo arquivo.
- Não confunda `--auto` com paralelismo; a velocidade vem de `task`, `tasks[]` e sharding nativos.
