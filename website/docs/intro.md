---
sidebar_position: 1
slug: intro
---

# Introdução ao Harness Oh My Pi

Sem orientação, um agente de IA pode transformar uma alteração pequena em uma avalanche de arquivos: muda dezenas de arquivos sem avisar, quebra o build, afirma que executou testes que nunca rodaram e perde todo o contexto quando a sessão termina. O resultado é retrabalho, incerteza e uma nova sessão tentando descobrir o que aconteceu.

O **Harness Oh My Pi** é o **motor de execução de alta performance** para aplicar engenharia disciplinada com velocidade. Ele combina o ciclo PREVC com despacho nativo de até 32 subagentes, sharding paralelo de testes e estado durável em arquivo que sobrevive entre sessões.

## Comparativo direto

| Preocupação | Unassisted AI chat | Harness-guided engineering |
|---|---|---|
| Alterações fora de escopo | O agente pode editar muitos arquivos sem planejamento ou aviso | Cada lane declara a propriedade dos arquivos e seus limites |
| Build quebrado | A mudança termina sem uma validação obrigatória | Gates medidos verificam o resultado antes da aceitação |
| Testes alegados | O modelo pode dizer que testou sem evidência de execução | Comandos e resultados registrados sustentam cada afirmação |
| Contexto perdido | A próxima sessão recomeça com amnésia do trabalho anterior | Estado durável, WIP=1 e handoff preservam a continuidade |
| Velocidade | Trabalho serial disputa um único contexto | Até 32 subagentes nativos e sharding permitem fan-out controlado |

## O ciclo de vida PREVC

Trabalhos significativos seguem um fluxo determinístico. Cada etapa produz evidências verificáveis antes do avanço:

```text
prepare → plan → execute → validate → judge → refine → confirm
```

- prepare — mapeia contexto, restrições e classe de risco.
- plan — define objetivo, fronteiras de arquivos, critérios de aceite e lanes.
- execute — despacha lanes aprovadas em paralelo com isolamento de contexto.
- validate — executa gates medidos e testes sobre a árvore reconciliada.
- judge — compara o resultado com o contrato inicial de forma independente.
- refine — analisa a trajetória sem poder de aprovação.
- confirm — o operador humano valida a entrega; nenhum agente se autoaprova.

## Os cinco pilares da documentação

1. **[Primeiros passos](./getting-started/installation)** — instalação e o guia de cinco minutos.
2. **[Conceitos essenciais](./concepts/why-a-harness)** — PREVC, WIP=1 e evidências.
3. **[Guias práticos](./guides/small-task)** — tarefas reais e despacho paralelo.
4. **[Referência completa](./reference/commands)** — comandos, agentes e arquivos.
5. **[Adoção e FAQ](./adoption/use-cases)** — casos de uso, segurança e limitações.
