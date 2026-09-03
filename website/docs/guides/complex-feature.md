---
sidebar_position: 2
---

# Feature Complexa

> **Identidade OMP:** o contrato torna explícita a autorização e o isolamento por tenant; o motor nativo do Oh My Pi só paraleliza depois que escopo e evidência estão definidos.

Use o pipeline completo para uma feature FastAPI + Supabase, com mais de três arquivos, autorização e decisões de dados.

## Prompt realista

`Adicione GET /api/projects ao serviço FastAPI. Cada usuário só pode listar projetos da própria organization_id. Crie a política Supabase RLS, cubra acesso cross-tenant com testes IDOR e documente a verificação. Não use credenciais reais no exemplo.`

## Sprint contract antes do Execute

- **Scope In:** rota, dependência de usuário, migration/policy RLS, testes de autorização e documentação.
- **Scope Out:** convite de usuários, billing, índices de produção e deploy.
- **AC:** usuário de `org-a` recebe somente projetos de `org-a`; um ID de `org-b` retorna `404` (ou `403`, conforme o contrato); usuário sem sessão retorna `401`; a política RLS repete a mesma regra no banco.
- **Verification Plan:** pytest com banco local/mock da fronteira, teste negativo IDOR e `supabase db diff` em ambiente local. Credenciais e saída do Supabase são esperadas/representativas, não executadas aqui.

## Implementação e RLS

O código deve filtrar por `organization_id` antes de serializar qualquer linha:

```python
@router.get("/api/projects")
async def list_projects(user: CurrentUser, db: AsyncSession) -> list[Project]:
    result = await db.execute(
        select(Project).where(Project.organization_id == user.organization_id)
    )
    return list(result.scalars())
```

A migration Supabase habilita RLS e exige que o tenant do JWT coincida com a linha:

```sql
alter table public.projects enable row level security;
create policy "tenant reads own projects" on public.projects
for select using (
  organization_id = (auth.jwt() ->> 'organization_id')::uuid
);
```

## Fluxo OMP e evidência

1. `/harness-session-start` lê continuidade e declara a feature ativa.
2. `/harness-wip-control` cria subtasks para rota, migration, testes e docs; somente uma fica `in_progress`.
3. `/prevc prepare` registra papéis, AC e comandos; a aprovação autoriza o Execute.
4. O scheduler nativo executa lanes independentes por `task`/`tasks[]`; a lane de testes depende da rota e da migration.
5. Validate e Judge exigem evidência antes de Confirm; handoff registra arquivos e decisões para a próxima sessão.

**Terminal (reproduzível sem credenciais externas):**

```powershell
cd C:\projetos\project-api
uv run pytest tests/test_projects_authorization.py -q
supabase db diff --local
```

**Saída esperada/representativa** (não executada neste guia):

```text
tests/test_projects_authorization.py::test_org_a_sees_only_org_a PASSED
tests/test_projects_authorization.py::test_org_a_cannot_read_org_b_idor PASSED
tests/test_projects_authorization.py::test_missing_session_is_401 PASSED
3 passed in 0.42s
create policy "tenant reads own projects" on public.projects ...
```

Um teste deve tentar buscar explicitamente o UUID de `org-b` usando o token de `org-a` e afirmar `404`/`403`; testar apenas o caso feliz não prova isolamento. A RLS é a segunda barreira, mesmo se uma futura rota esquecer o filtro Python.

## Limites

Descoberta de billing ou uma alteração em outro domínio vira uma nova tarefa, não extensão silenciosa. Veja o [fluxo de tarefa pequena](./small-task) quando a mudança voltar a ser um único arquivo.
