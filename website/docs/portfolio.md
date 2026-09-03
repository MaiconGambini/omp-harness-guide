---
sidebar_position: 2
---

# Portfólio OMP

Este registro descreve o problema, o método, a implementação e a evidência do
núcleo público do Oh My Pi. Ele não apresenta números de desempenho sem uma
medição reproduzível.

## Problema

O contrato PREVC precisava operar sobre as primitivas nativas do OMP sem
publicar estado privado, evidências de runtime ou capacidades que não fossem
verificadas. O desafio era manter escopo, continuidade e aprovação humana
quando o runtime trabalha com agents e lanes.

## Método

O PREVC permanece o contrato comum: sete etapas agrupadas em quatro fases,
WIP=1, aprovação do operador, validação executável, Judge read-only, Refine sem
escrita e confirmação explícita. O OpenCode é tratado como adaptador
metodológico e de continuidade; o OMP fornece o motor nativo.

## Implementação

A distribuição pública mapeia o contrato para o OMP:

- `scheduler` despacha lanes aprovadas;
- `tasks[]` representa uma onda de trabalho independente;
- `hub` coordena mensagens entre agents;
- `todo` mantém a unidade ativa da sessão;
- sharding de testes ocorre somente quando o plano declara arquivos e
  dependências compatíveis.

O pacote inclui comandos, agents, skills, scripts, configuração e extensões
curadas em `omp/agent/`. O site é separado do runtime, e o arquivo
`concepts/continual-harness.md` documenta o loop contínuo e seus limites.

## Evidência

A revisão Git, `omp/agent/omp-port-manifest.json` e
`scripts/validate-public-subset.mjs` identificam e verificam o pacote público.
Os exemplos de dispatch mostram a forma das primitivas, não uma medição de
velocidade. Qualquer claim de throughput, custo ou qualidade exige comando,
configuração, revisão, saída capturada e comparação reproduzível.
