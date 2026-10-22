---
sidebar_position: 1
---

# Pré-requisitos

Os pré-requisitos listam os componentes de sistema e ferramentas essenciais necessários para instalar e executar o Harness Oh My Pi:

- **Oh My Pi** instalado e funcionando. O harness é um conjunto de comandos, agentes, skills, scripts e uma extensão que operam sobre o Oh My Pi — ele não substitui a instalação base.
- **Git** configurado com seu usuário (`git config --global user.name` e `git config --global user.email`).
- **Node.js 20+** para os scripts do harness.
- **PowerShell 5.1+** no Windows. O harness foi projetado e testado neste ambiente.

## Componentes opcionais

- **Maestri** (opcional): orquestrador visual e canvas de multiagentes para trabalho colaborativo em equipe. É utilizado pelo comando `/maestri-team` para provisionar papéis e delegar fluxos paralelos em terminais dedicados.
- **Obsidian** (opcional): ambiente para gerenciar o segundo cérebro do projeto em um vault local, permitindo indexar regras, decisões de arquitetura e o grafo de conhecimento via Graphify.

Nenhum banco de dados, contêiner ou serviço externo é necessário. O harness opera como arquivos de configuração e scripts locais sob `~/.omp/agent` e no repositório do projeto.

## O que NÃO é necessário

- Conta ou credencial de serviço externo.
- Servidor ou processo de fundo dedicado — o despacho paralelo usa o mecanismo nativo `task` do Oh My Pi, sem stub de background.

## O que isto prova e o que não prova

- **O que prova:** que o ambiente operacional possui os interpretadores e as ferramentas essenciais para executar comandos, rotinas de validação e scripts do harness.
- **O que não prova:** não assegura que as dependências da sua aplicação (compiladores, interpretadores da sua stack, bancos de dados ou serviços externos) estejam instaladas ou configuradas.

## Próximo passo

Siga para [Instalação](./installation) e instale a distribuição.
