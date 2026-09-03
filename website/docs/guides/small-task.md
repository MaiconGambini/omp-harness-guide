---
sidebar_position: 1
---

# Tarefa Pequena

> **Identidade OMP:** o caminho rápido mantém a verificação, mas usa o motor nativo e a execução direta do Oh My Pi quando não há trabalho para agendar.

Este guia mostra uma correção de escopo óbvio, em um arquivo, que cabe em cerca de dois minutos.

## Quando usar o modo rápido

Use quando o prompt tem uma sentença clara, um único arquivo e nenhuma decisão de design. O fast path bypassa a cerimônia completa do PREVC (spec, scheduler, lane table e handoff intermediário), não a responsabilidade de provar o resultado.

## Exemplo de dois minutos

**Prompt:** `Corrija o GET /api/health em app/main.py: ele deve retornar {"status":"ok"} e manter HTTP 200. Adicione uma verificação local.`

Trecho existente em `app/main.py`:

```python
@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "healthy"}
```

**Terminal (comandos reproduzíveis em um projeto FastAPI):**

```powershell
cd C:\projetos\billing-api
python -m pytest tests/test_health.py -q
python -c "from pathlib import Path; p=Path('app/main.py'); s=p.read_text(); p.write_text(s.replace('healthy', 'ok'))"
python -m pytest tests/test_health.py -q
```

**Evidência esperada/representativa** (os comandos acima não foram executados neste guia):

```text
tests/test_health.py::test_health_returns_ok PASSED
1 passed in 0.18s
```

No OMP, uma única mudança em `app/main.py` não se beneficia de `task`/`tasks[]` ou de sharding: o custo de coordenar agentes excederia o trabalho. Ainda assim, a segunda execução do teste e, quando aplicável, `curl http://127.0.0.1:8000/api/health` são a verificação obrigatória. Se a alteração revelar outro arquivo ou uma decisão de escopo, pare e mude para o [fluxo de feature complexa](./complex-feature).

## O que NÃO fazer

- Não declarar sucesso sem saída observável.
- Não expandir o escopo para autenticação, banco ou deploy.
