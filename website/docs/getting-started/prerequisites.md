---
sidebar_position: 1
---

# Pré-requisitos

Antes de instalar o Harness Oh My Pi, você precisa de:

- **Oh My Pi** instalado e funcionando. O harness é um conjunto de comandos, agents, skills, scripts e uma extensão que operam sobre o Oh My Pi — ele não substitui a instalação base.
- **Git** configurado com seu usuário (`git config --global user.name` e `git config --global user.email`).
- **Node.js 20+** para os scripts do harness.
- **PowerShell 5.1+** no Windows. O harness foi projetado e testado neste ambiente.

Nenhum banco de dados, container ou serviço externo é necessário. O harness opera como arquivos de configuração e scripts locais sob `~/.omp/agent` e no repositório do projeto.

## O que NÃO é necessário

- Conta ou credencial de serviço externo.
- Servidor ou processo de fundo dedicado — o despacho paralelo usa o mecanismo nativo `task` do Oh My Pi, sem stub de background.

## Próximo passo

Siga para [Instalação](./installation) e instale a distribuição.
