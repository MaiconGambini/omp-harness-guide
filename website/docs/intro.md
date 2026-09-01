---
sidebar_position: 1
slug: intro
---

# Introdução

O Harness Oh My Pi transforma o Oh My Pi de um agente que "redescobre tudo a cada sessão" em um agente que mantém estado, respeita WIP=1, produz evidência e faz handoff limpo entre sessões.

O harness é um port do harness OpenCode para os primitivos nativos do Oh My Pi: despacho paralelo com `task` em uma onda `tasks[]`, coordenação com `hub`, a ferramenta `todo` (WIP=1) e o barramento de eventos de extensão (`pi.on`). O ciclo de vida **PREVC** permanece o mesmo contrato runtime-neutral; o que muda é o adaptador.

## O ciclo de vida

Trabalho significativo passa por uma sequência fixa de fases, cada uma com a evidência que precisa produzir antes de avançar:

```text
prepare → plan → execute → validate → judge → refine → confirm
```

- **prepare** — descobre contexto e classifica risco.
- **plan** — define objetivo, escopo, não-escopo e critérios de aceite.
- **execute** — executa somente o escopo aprovado, WIP=1.
- **validate** — mede o resultado com gates e evidência real.
- **judge** — um avaliador read-only compara o trabalho com o contrato.
- **refine** — um refiner read-only propõe melhorias; não escreve e não vota.
- **confirm** — o operador revisa a evidência e confirma; nenhum agente se autoconfirma.

## O que você vai encontrar

| Seção | O que cobre |
|---|---|
| **[Começando](./getting-started/installation)** | Instalação passo a passo e primeira sessão. |
| **[Conceitos](./concepts/why-a-harness)** | PREVC, WIP=1, evidências, os sete componentes e os limites de automação. |
| **[Guias](./guides/small-task)** | Fluxo completo para tarefas pequenas e complexas. |
| **[Referência](./reference/commands)** | Comandos, agents/skills e artefatos. |
| **[Adoção](./adoption/use-cases)** | Casos de uso, prós e contras, segurança e limitações. |
| **[FAQ](./troubleshooting/faq)** | Problemas comuns e soluções. |

## Pré-requisitos

- Windows com PowerShell 5.1+
- Oh My Pi instalado e funcionando
- Node.js 20+
- Git

## Instalação rápida

> **Instalação limpa:** se `~/.omp/agent` já existe com arquivos seus, faça backup antes de instalar — não há merge automático. O [guia completo de instalação](./getting-started/installation) mostra o comando exato.

A distribuição real do Harness Oh My Pi fica em `omp/agent/`. Ela contém os
agents, comandos, scripts, extensão, configuração e skills gerais que o Oh My
Pi carrega diretamente. O pacote público não inclui runtime local, estados,
evidências, recon, exploração, WSTG ou playbooks ofensivos.

Depois de revisar `omp/agent/omp-port-manifest.json`, instale em uma pasta limpa:

```powershell
$target = Join-Path $env:USERPROFILE ".omp\agent"
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -Path "omp/agent/*" -Destination $target -Recurse -Force
```

O `website/` é somente o site da documentação; suas dependências não fazem
parte do runtime OMP.

[Guia completo de instalação &rarr;](./getting-started/installation)

## O princípio

O harness não tenta substituir o operador. Ele torna claro o que foi solicitado, o que foi aprovado, o que foi executado, o que foi verificado e qual é a próxima ação segura. Todo o resto desta documentação é detalhe desse princípio.
