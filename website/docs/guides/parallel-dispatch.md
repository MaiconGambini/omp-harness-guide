---
sidebar_position: 3
---

# Dispatch Paralelo

> **Identidade OMP:** este é o caminho para fan-out nativo, sharding e velocidade; o [fluxo de feature complexa](./complex-feature) continua sendo a referência para contrato e continuidade.

Use o dispatch quando um plano aprovado tem arquivos disjuntos e lanes independentes. Uma feature de um arquivo deve ficar no [fluxo de tarefa pequena](./small-task).

## Refactor FastAPI + Supabase

**Prompt:** `Refatore o serviço de projetos: L1 move a autorização FastAPI para authorization/projects.py, L2 move a repository query para repositories/projects.py e L3 atualiza testes IDOR em tests/test_projects_authorization.py. Preserve a política RLS e não toque nos arquivos das outras lanes. Execute o plano até o handoff, com evidência.`

Antes do fan-out, OMP registra a lane table:

```text
L1 authorization/projects.py             — dependência CurrentUser e filtro tenant
L2 repositories/projects.py              — query organization_id, depende de L1
L3 tests/test_projects_authorization.py  — testes cross-tenant, depende de L1+L2
```

Ownership é uma regra de prompt, não lock. Lanes que compartilham arquivo são serializadas. A policy Supabase fica fora das lanes porque não deve ser alterada pelo refactor.

## Fan-out nativo

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
