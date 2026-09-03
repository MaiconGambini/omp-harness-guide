---
sidebar_position: 1
slug: intro
---

# Introdução ao Harness Oh My Pi

Desenvolver com agentes de IA em projetos reais frequentemente resulta em quatro dores universais:

1. **Edições descontroladas em múltiplos arquivos (runaway edits):** O agente toca dezenas de arquivos além do solicitado, introduzindo refatorações acidentais e diffs impossíveis de revisar.
2. **Builds quebrados (broken builds):** O assistente reporta sucesso precoce, mas deixa para trás erros de compilação, tipos inválidos e empacotamento quebrado.
3. **Alucinação de testes (test hallucination):** O modelo afirma categoricamente que "todos os testes passaram", sem ter executado sequer um comando no terminal.
4. **Perda de contexto entre sessões (context loss):** Ao fechar a sessão, todas as decisões, blockers e o estado do trabalho evaporam, forçando um recomeço do zero.

O Harness Oh My Pi resolve esses problemas estruturando a interação entre o desenvolvedor e o agente como um processo de engenharia rigoroso e mensurável.

### Comparativo: Chat tradicional vs Engenharia com Harness

| Chat de IA sem assistência | Engenharia com Harness |
|---|---|
| **Edições descontroladas:** Altera dezenas de arquivos sem fronteira definida, gerando diffs gigantescos e imprevisíveis. | **Escopo delimitado:** Declara e restringe a posse de arquivos por lane; edições ocorrem apenas nos alvos autorizados. |
| **Build quebrado:** Afirma que a tarefa está pronta sem verificar se o projeto ainda compila ou empacota. | **Verificação obrigatória:** Bloqueia a conclusão até que checagens de tipos, linters e builds passem com código de saída zero. |
| **Alucinação de testes:** Inventa resultados de testes ("todos os testes passaram") sem executar comando algum no terminal. | **Evidência real:** Exige saída capturada do terminal e degraus de evidência auditáveis antes de declarar sucesso. |
| **Perda de contexto:** Cada nova sessão começa do zero, esquecendo decisões, bloqueios e tarefas pendentes. | **Continuidade durável:** Mantém estado em disco (WIP=1), registra bloqueios reais e produz handoff limpo para a próxima sessão. |

### PREVC, OpenCode e Oh My Pi

O **PREVC é um contrato comum** para trabalho significativo: define as
fronteiras, as transições, a evidência e a confirmação humana. O **OpenCode é
o adaptador metodológico e de continuidade** deste desenho; ele organiza as
convenções de planejamento, os artefatos duráveis e o handoff entre sessões. O
**Oh My Pi é o motor nativo** que executa esse contrato com suas próprias
primitivas.

No OMP, o `scheduler` despacha lanes independentes em uma chamada `tasks[]`,
`hub` coordena mensagens entre agents, `todo` mantém a unidade WIP=1 da sessão
e `test-runner` pode shardear uma suíte quando o plano e a estrutura dos testes
permitem. Essas primitivas explicam o mecanismo de execução; esta documentação
não transforma sua existência em benchmark ou promessa de throughput.

## Comparativo direto

As sete etapas do contrato são agrupadas em quatro fases. O agrupamento não
remove etapas: apenas dá a cada fronteira um responsável e uma evidência
legível.

| Fase | Etapas agrupadas | Resultado esperado |
|---|---|---|
| **Prepare** | `prepare` + `plan` | Contexto, risco, escopo e plano aguardando aprovação. |
| **Execute** | `execute` | Alterações somente dentro do escopo aprovado. |
| **Validate** | `validate` + `judge` | Gates executados e recibo independente do Judge. |
| **Confirm** | `refine` + `confirm` | Proposta de melhoria revisada e confirmação explícita do operador. |

Em sequência, o contrato continua sendo:

```text
prepare → plan → execute → validate → judge → refine → confirm
```

- **prepare** — descobre contexto e classifica risco.
- **plan** — define objetivo, escopo, não-escopo e critérios de aceite.
- **execute** — executa somente o escopo aprovado, com WIP=1.
- **validate** — mede o resultado com gates e evidência real.
- **judge** — um avaliador read-only compara o trabalho com o contrato.
- **refine** — um refiner read-only propõe melhorias; não escreve e não vota.
- **confirm** — o operador revisa a evidência e confirma; nenhum agent se
  autoconfirma.

## Os cinco pilares da documentação

| Seção | O que cobre |
|---|---|
| **[Começando](./getting-started/installation)** | Instalação passo a passo e primeira sessão. |
| **[Conceitos](./concepts/why-a-harness)** | PREVC, WIP=1, evidências, os sete componentes e os limites de automação. |
| **[Guias](./guides/small-task)** | Fluxo completo para tarefas pequenas e complexas. |
| **[Referência](./reference/commands)** | Comandos, agents/skills e artefatos. |
| **[Adoção](./adoption/use-cases)** | Casos de uso, prós e contras, segurança e limitações. |
| **[FAQ](./troubleshooting/faq)** | Problemas comuns e soluções. |

## Pré-requisitos

Para ler a documentação, não é necessário instalar o runtime. Para executar
o harness, instale o Oh My Pi base e o pacote público em `~/.omp/agent`, além
de:

- Windows com PowerShell 5.1+
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
