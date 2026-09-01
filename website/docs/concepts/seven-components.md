---
sidebar_position: 2
---

# Os sete componentes

> **Estado PREVC:** os componentes existem para sustentar `prepare → plan → execute → validate → judge → refine → confirm`; cada um tem um limite explícito.

O harness usa sete componentes. Eles não são sete produtos separados; são lentes para verificar se o workflow está completo.

1. **Prompt / Contexto** — Regras ativas, limites e a instrução de operar com PREVC.
2. **Tools** — Ferramentas que leem, editam, validam e pedem aprovação; no Oh My Pi, cada agent tem uma allowlist de ferramentas.
3. **Context Management** — Carrega apenas instruções, specs e estado relevantes.
4. **Verification** — Comandos e evidências que verificam o resultado (gates medidos).
5. **Memory** — `todo`, goal, handoffs e artefatos duráveis.
6. **Sandboxes** — Não há sandbox de SO. Policy não substitui isolamento.
7. **Hooks / Extensões** — O barramento de eventos nativo (`pi.on`); integrações permitidas, sem execução autônoma.

## O que cada componente protege

| Componente | Pergunta que responde | Limite atual |
|---|---|---|
| Prompt/contexto | Quais regras valem nesta sessão? | Regras não substituem permissão humana |
| Tools | Qual ação pode ser executada? | Allowlist por agent; mutações ainda passam por política e aprovação |
| Contexto | O que preciso ler antes de decidir? | Contexto deve ser relevante, não um dump global |
| Verificação | Que fato prova o resultado? | Evidência declarada pelo modelo não é recibo confiável |
| Memória | Como a próxima sessão continua? | Retenção e auditoria não provam conclusão |
| Sandboxes | O processo está isolado do SO? | Não. Não há sandbox de SO instalada |
| Hooks/extensões | O que integra o lifecycle? | Extensões observam eventos; não iniciam loops autônomos |
