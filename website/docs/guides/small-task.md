---
sidebar_position: 1
---

# Tarefa Pequena

> **Estado PREVC:** Fast path simplificado — até 3 arquivos, escopo determinístico, sem cerimônia pesada de spec.

Este guia demonstra o fluxo rápido para tarefas pontuais de engenharia (como bugfixes cirúrgicos de 2 minutos), mantendo a integridade de evidências sem a sobrecarga de um planejamento cerimonial completo.

## Por que o modo rápido dispensa a cerimônia do PREVC?

O ciclo completo do PREVC foi projetado para mitigar riscos arquiteturais e coordenar mudanças complexas. Para uma correção de poucas linhas em um único arquivo:

- Criar especificações completas (`spec.md`, `plan.md`, `verification.md`, `decisions.md`, tickets) gera mais overhead e tokens do que o próprio código modificado.
- O risco de dispersão ou *context mixing* em uma alteração cirúrgica é baixo, desde que haja um teste reprodutor.
- **A regra de ouro:** O fast path dispensa a burocracia documental, mas **nunca dispensa a evidência real**. A correção deve ser provada com teste automatizado (Rung 4) antes de ser concluída.

## Cenário real: Correção de cálculo de desconto expirado

**Arquivo afetado:** `src/billing/discounts.py`
**Problema:** Quando um cupom expirado é aplicado, a função `apply_discount` retorna valor de desconto negativo em vez de levantar `CouponExpiredError`.

### 1. Prompt do operador

```text
Corrigir cálculo de desconto em src/billing/discounts.py: cupons expirados devem lançar CouponExpiredError em vez de retornar desconto negativo. Adicione teste de regressão em tests/test_discounts.py.
```

### 2. Comandos e execução no terminal

O agente declara a tarefa ativa na ferramenta `todo` (WIP=1) e reproduz a falha antes de editar:

```powershell
# 1. Executar o teste reproduzindo a falha (vermelho)
pytest tests/test_discounts.py -k test_expired_coupon -v
```

*Saída no terminal:*
```text
FAILED tests/test_discounts.py::test_expired_coupon - AssertionError: Expected CouponExpiredError but got discount -15.00
1 failed, 12 passed in 0.28s
```

O agente edita cirurgicamente `src/billing/discounts.py` adicionando a checagem de validade temporal e executa a verificação:

```powershell
# 2. Re-executar teste para confirmar correção (verde)
pytest tests/test_discounts.py -k test_expired_coupon -v

# 3. Verificação de tipo determinística (Rung 3)
python -m mypy src/billing/discounts.py
```

### 3. Saída de evidência observável

```text
tests/test_discounts.py::test_expired_coupon PASSED [100%]
1 passed, 12 passed in 0.25s
Success: no issues found in 1 source file
```

### 4. Handoff e encerramento

O agente registra a conclusão na ferramenta `todo` e gera a evidência mínima no handoff:

```json
{
  "task": "fix-coupon-expired-discount",
  "status": "passing",
  "files": ["src/billing/discounts.py", "tests/test_discounts.py"],
  "evidence": "pytest: 1 passed; mypy: clean; exit code: 0"
}
```

**Tempo total decorrido:** ~2 minutos.

## O que NÃO fazer

- Não declarar sucesso sem saída observável.
- Não expandir o escopo para autenticação, banco ou deploy.
