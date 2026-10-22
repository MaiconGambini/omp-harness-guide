---
sidebar_position: 2
---

# Feature Complexa

> **Estado PREVC:** `prepare → plan → execute → validate → judge → refine → confirm` — quatro fases agrupam as sete etapas; o OMP executa o contrato com suas primitivas nativas.

O guia de feature complexa detalha o ciclo completo do PREVC para iniciativas arquiteturais de médio e alto risco envolvendo múltiplos componentes, migrações e contratos de segurança. O fluxo é ilustrado com uma implementação de backend em **FastAPI** integrado ao **Supabase**, com políticas estritas de isolamento por **Row Level Security (RLS)** e testes focados em prevenção a **IDOR (Insecure Direct Object Reference)**.

## Prompt realista

- Mudanças em contratos de segurança, banco de dados ou autenticação.
- Múltiplos componentes afetados (migração SQL, rotas da API, camada de serviço e suíte de testes).
- Necessidade de evidência formal (Rungs 3 a 5) antes de liberar o código.

## Cenário real: API de Faturas com Isolamento RLS e Prevenção a IDOR

### 1. Prompt do operador

```text
/prevc prepare "Implementar endpoint GET /api/v1/invoices/{invoice_id} em FastAPI com Supabase.
Requisitos obrigatórios:
1. Migração SQL habilitando Row Level Security (RLS) na tabela 'invoices' com política tenant_isolation_policy baseada em auth.uid().
2. Rota FastAPI protegida injetando o contexto do usuário autenticado.
3. Suíte de testes em tests/security/test_invoices_idor.py comprovando proteção contra IDOR: Tenant B não pode ler nem alterar faturas do Tenant A (deve retornar 404/403)."
```

### 2. Fase Plan: O Sprint Contract

No fluxo nativo do OMP, `/prevc prepare` inicia o planejamento e o comando
`/planner` executa o papel de planejamento do scheduler. O `planner` gera a
especificação em `agent-os/specs/invoices-rls-idor/` com o contrato que o
operador revisa antes do Execute:


- **Scope In:**
  - `supabase/migrations/20260902_invoices_rls.sql` (Definição de DDL e políticas RLS).
  - `src/api/routes/invoices.py` (Endpoint FastAPI com validação Pydantic).
  - `tests/security/test_invoices_idor.py` (Matriz de testes IDOR cross-tenant).
- **Scope Out:**
  - Interface gráfica de faturamento.
  - Integração com gateway de pagamentos externo (adiada para spec futura).
- **Critérios de Aceite (AC):**
  - **AC-01:** RLS habilitado com `ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;`.
  - **AC-02:** Política garante que `tenant_id` seja idêntico ao do usuário da sessão Supabase.
  - **AC-03:** Tentativas de IDOR retornam `404 Not Found` ou `403 Forbidden`.
  - **AC-04:** Suíte pytest roda com 100% de sucesso e exit code 0.
- **Verification Plan:**
  - `python -m pytest tests/security/test_invoices_idor.py -v`
  - `python -m mypy src/api/routes/invoices.py`
  - `node ~/.omp/agent/scripts/harness-quality-gate.mjs --mode local`

### 3. Fase Execute: Implementação com Posse Delimitada

Com o plano aprovado pelo operador, o `scheduler` do Oh My Pi despacha as lanes
com WIP=1:
- A migração SQL cria a política declarativa:
  ```sql
  ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

  CREATE POLICY tenant_isolation_policy ON invoices
    FOR ALL
    TO authenticated
    USING (tenant_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()));
  ```
- A rota FastAPI injeta o token JWT e propaga o contexto para a biblioteca cliente do Supabase.

### 4. Fase Validate: Comandos e Evidência Observável

O agente executa as verificações no terminal para coletar evidências de Rung 3 e Rung 4:

```powershell
# Executar testes de segurança contra IDOR
pytest tests/security/test_invoices_idor.py -v
```

*Saída real capturada no terminal:*
```text
============================= test session starts =============================
collected 3 items

tests/security/test_invoices_idor.py::test_tenant_a_can_read_own_invoice PASSED [ 33%]
tests/security/test_invoices_idor.py::test_tenant_b_cannot_read_tenant_a_invoice_idor PASSED [ 66%]
tests/security/test_invoices_idor.py::test_tenant_b_cannot_update_tenant_a_invoice_idor PASSED [100%]

============================== 3 passed in 0.44s ==============================
```

Em seguida, executa o gate de qualidade local:

```powershell
node ~/.omp/agent/scripts/harness-quality-gate.mjs --mode local
```

*Saída observável:*
```text
Quality gate report: PASS (exit 0)
security_findings: 0 <= 0 (pass)
regression_suite: 0 failures (pass)
```

### 5. Judge e Handoff

O `judge` emite o recibo `accept`. O operador confirma a conclusão e o handoff registra o estado limpo:

```json
{
  "feature": "invoices-rls-idor",
  "status": "passing",
  "evidence": {
    "idor_tests": "3 passed (test_invoices_idor.py)",
    "rls_policy": "supabase/migrations/20260902_invoices_rls.sql",
    "gate_verdict": "accept"
  },
  "next_best_step": "Liberar branch para integração ou iniciar spec de pagamentos."
}
```

## O que isto prova e o que não prova

- **O que prova:** que a funcionalidade foi especificada com limites claros, implementada sob posse declarada de arquivos e validada por testes de segurança e Quality Gate antes da confirmação.
- **O que não prova:** não garante que a aplicação remota de produção esteja imune a falhas se as variáveis de ambiente ou políticas de infraestrutura divergirem do ambiente de teste.
