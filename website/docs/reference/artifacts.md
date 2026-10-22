---
sidebar_position: 3
---

# Artefatos

A referência de artefatos documenta os arquivos de governança, esquemas de configuração e relatórios duráveis que o harness utiliza durante o ciclo operacional para assegurar continuidade e rastreabilidade entre sessões.

## Tabela de artefatos essenciais

| Artefato | Localização | Propósito |
|---|---|---|
| `AGENTS.md` | raiz do projeto | Instruções, convenções de código e entry points do repositório |
| `feature_list.json` | raiz do projeto | Fonte da verdade para execução estrita de WIP=1 |
| `agent-os/prevc-autonomy.json` | `agent-os/` | Configurações de autonomia do PREVC, autoconfirmação (`autoConfirm`, desligada por padrão) e regras de gate |
| `agent-os/project-profile.json` | `agent-os/` | Perfil detectado do projeto: stack, comandos de teste, linter e política de `fixLoop` |
| `agent-os/quality-thresholds.json` | `agent-os/` | Chaves governantes de métricas e roteamento de risco (sem números fixos no guia) |
| `docs/review.md` | `docs/` (ou por área) | Falhas críticas reais mapeadas, diretrizes do revisor e log de defeitos escapados |
| `.github/pull_request_template.md` | `.github/` | Template de PR com Tier de risco, Testing, Como reverter e Responsável |
| Recibos do Judge | diretório de relatórios | Vereditos tipados (`accept`, `reject`, `revise`), rubrica avaliada e links de evidência |
| Relatórios do Gate | diretório de relatórios | Status das métricas, cobertura de medição (`measurementCoverage`) e rótulo (`coverageLabel`) |
| Handoff de sessão | `docs/harness/session-handoff.md` | Resumo durável de continuidade, blockers, progresso e próximas ações |

## Detalhamento dos artefatos estruturados

### 1. Autonomia PREVC (`agent-os/prevc-autonomy.json`)

Controla o grau de autonomia do ciclo PREVC para evitar execuções desgovernadas.
A autoconfirmação (`autoConfirm`) é estritamente opt-in e vem desativada por padrão.

```json
{
  "schemaVersion": 1,
  "autoConfirm": false,
  "maxRevisionCycles": 3
}
```

Quando desativado, o ciclo de vida interrompe obrigatoriamente a execução ao atingir
a fase `awaiting_confirmation`, devolvendo o controle e a evidência acumulada para validação humana.

### 2. Perfil do projeto (`agent-os/project-profile.json`)

Gerado e mantido pelo script `harness-project-profile.mjs` sob `agent-os/project-profile.json`. Registra os comandos canônicos
de teste, lint, auditoria e a política de contenção de loops de correção (`fixLoop`).

```json
{
  "schemaVersion": 1,
  "stack": [
    "node",
    "typescript"
  ],
  "test": {
    "command": "npm test",
    "detected": true
  },
  "evals": {
    "isolation": "process",
    "detected": true
  },
  "ci": {
    "provider": "github",
    "detected": true
  },
  "delivery": {
    "mode": "none",
    "detected": true
  },
  "fixLoop": {
    "maxAttempts": 3,
    "escalateOn": [
      "attempts_exhausted",
      "secret_or_credential",
      "production_deploy",
      "scope_change",
      "dependency_cooldown"
    ],
    "detected": true
  }
}
```

O parâmetro `fixLoop.maxAttempts` define o teto padrão de 3 tentativas para correção
automática de falhas em uma lane. Ao esgotar as tentativas, o sistema emite um aviso estruturado
e registra o bloqueador para decisão do operador, sem travar indefinidamente a sessão.

### 3. Thresholds de qualidade (`agent-os/quality-thresholds.json`)

Define as chaves das métricas governantes avaliadas pelo `harness-quality-gate.mjs`
e as regras de classificação de risco do `harness-risk-router.mjs`.

- **Métricas governantes:** avaliadas por chave no projeto (por exemplo, `eval_regressions`,
  `authz_controls`, `coverageLabel`, `measurementCoverage`). O valor de cada threshold é configurado
  localmente no repositório de acordo com o contexto operacional.
- **Roteamento de risco:** classifica diffs entre os níveis de risco `risk:low`, `risk:medium` e `risk:high`
  (mapeados nos tiers de revisão `auto`, `sampling` e `full`) com base no volume de linhas e criticidade dos arquivos afetados.

### 4. Code Review por área (`docs/review.md`)

Documenta o aprendizado cumulativo e os padrões de falha reais observados no codebase.
Cada área crítica do sistema deve manter seu próprio `review.md` estruturado em três seções:

1. **Falhas críticas reais observadas:** lista de bugs graves ou incidentes que já ocorreram na área.
2. **Regras de verificação do revisor:** verificações obrigatórias que o agente revisor (`code-reviewer`)
   deve inspecionar antes de emitir parecer.
3. **Log de defeitos escapados:** histórico conciso de regressões que passaram pelo review e as lições aprendidas.

### 5. Template de Pull Request (`.github/pull_request_template.md`)

Padroniza a entrega de alterações com rastreabilidade explícita:

- **Tier e Risco:** indicação do tier de revisão (`auto`, `sampling`, `full`) e do nível de risco (`low`, `medium`, `high`).
- **Testing:** evidência objetiva e comando reproduzível que valida o comportamento.
- **Como reverter:** instruções claras de rollback caso ocorra incidente em produção.
- **Responsável:** identificação do operador responsável pelo merge e acompanhamento.

### 6. Relatório do Gate e Cobertura de Medição

O relatório gerado pelo gate de qualidade não expressa apenas sucesso ou falha;
ele expõe a honestidade da medição por meio dos seguintes campos:

- **Status das métricas:** cada métrica é rotulada como `pass`, `fail`, `observe`,
  `unavailable`, `not_configured` ou `not_applicable`.
- **`measurementCoverage`:** razão entre as métricas efetivamente medidas (`pass`, `fail`, `observe`)
  e o total aplicável. O gate imprime no terminal `Measured: N/M` e emite alerta explícito
  quando menos da metade das métricas configuradas foi medida (`unmeasuredMajority: true`).
- **`coverageLabel`:** classificação categórica da abrangência da medição (`unmeasured`,
  `smoke_only`, `partial`, `standard` ou `comprehensive`).

### 7. Recibo do Judge

Emitido ao final da fase Judge pelo subagente `judge`. Contém o veredito formal,
a rubrica de critérios avaliados e a comprovação dos critérios de aceitação.
O ciclo PREVC só transiciona para a confirmação quando o recibo traz veredito `accept`.

## Regras de posse e concorrência

1. **Escritor único de fase:** apenas `harness-prevc-state.mjs` atualiza a fase persistente do PREVC.
   Transições manuais ou inválidas são recusadas.
2. **Sem escrita direta de findings:** subagentes revisores retornam JSON estruturado ao scheduler,
   que valida o conteúdo antes de persistir o lote de findings.
3. **WIP=1 estrito:** em qualquer instante, no máximo uma unidade de trabalho deve constar como
   `in_progress` no `feature_list.json`.

## O que isto prova e o que não prova

- **O que prova:** a persistência desses artefatos comprova que a auditoria foi executada,
  que as métricas declaradas foram consultadas e que existe trilha reproduzível para o rollback e para a entrega.
- **O que NÃO prova:** a existência dos arquivos de configuração não garante que as regras neles
  descritas sejam suficientes para cobrir todos os cenários de risco. A eficácia dos thresholds
  depende da calibração contínua e da inclusão de testes de regressão reais.

## Páginas relacionadas

- [Comandos](./commands.md) — Comandos que inspecionam e atualizam os artefatos.
- [Estrutura do Repositório](./repository-structure.md) — Onde cada artefato reside na árvore de diretórios.
- [Qualidade e Gate](../concepts/quality-gate.md) — Como as métricas e thresholds operam na prática.
