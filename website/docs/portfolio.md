---
sidebar_position: 2
---

# Portfólio OMP

Este registro descreve o problema, o método, a implementação e a evidência do núcleo público do Oh My Pi. Ele documenta mecanismos de engenharia verificáveis sem alegar números de desempenho que não tenham medição reproduzível.

## Problema

O contrato PREVC precisava operar sobre as primitivas nativas do OMP sem publicar estado privado, credenciais, relatórios de clientes ou capacidades que não fossem verificadas. O desafio central era manter rigor de escopo, foco cognitivo (WIP=1), rastreabilidade de código e governança de aprovação humana quando o runtime despacha múltiplos agentes e lanes paralelas.

## Método

O PREVC permanece como o contrato comum de engenharia:
- Sete etapas agrupadas em quatro fases operacionais.
- Foco delimitado em uma única unidade ativa (WIP=1).
- Classificação de risco semântico e aprovação prévia do plano.
- Quality Gate medido com código determinístico e indicador explícito de cobertura (`Measured: N/M`).
- Code review multicamadas com revisor independente em família concorrente de modelos.
- Judge em modo somente-leitura e Refine propondo melhorias sem poder de escrita.
- Confirmação humana soberana, com suporte a autoconfirmação governada (`auto-confirm`) restrita a critérios cumulativos *fail-closed*.

O OpenCode opera como adaptador metodológico e de continuidade; o OMP fornece o motor de execução nativo.

## Implementação

A distribuição pública mapeia o contrato para primitivas reais do OMP:

- `scheduler` despacha lanes aprovadas em ondas controladas de `tasks[]`.
- `hub` coordena o envio de mensagens e sincronização entre agentes.
- `todo` materializa a unidade ativa da sessão e mantém o foco cognitivo.
- `test-runner` divide a execução de suítes de testes quando o plano e a estrutura do projeto autorizam.
- `harness-quality-gate` consolida métricas estáticas, testes de regressão de evals minerados do Git (`eval_regressions`), contratos de segurança (`authz_controls`) e pré-voo de entrega (`delivery_config`).
- `harness-flow-metrics` avalia o histórico Git extraindo indicadores reais de reversões e correções subsequentes.
- Integração com o time de agentes no Maestri (`/maestri-team`) com papéis delimitados e ferramentas auditáveis.

O pacote distribuível fica em `omp/agent/`. A documentação em `website/` é isolada do runtime de produção.

## Evidência

A integridade do pacote público é garantida por:
1. `omp/agent/omp-port-manifest.json` com hashes de integridade de cada arquivo distribuído.
2. `scripts/validate-public-subset.mjs` que certifica a ausência de caminhos confidenciais, ferramentas ofensivas ou segredos na distribuição.
3. Testes unitários comportamentais que exercitam o roteador de risco, o Quality Gate, os envelopes de evidência e as transições de estado PREVC.

Qualquer afirmação sobre estabilidade, segurança ou qualidade do software requer comando real, parâmetros conhecidos, árvore de trabalho identificada por `sourceHash` e saída capturada no terminal.
