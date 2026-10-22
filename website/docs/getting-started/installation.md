---
sidebar_position: 2
---

# Instalação

O guia de instalação descreve o procedimento para obter, auditar e instalar a distribuição pública do Harness Oh My Pi em um ambiente local limpo. Essa árvore contém os arquivos que o Oh My Pi carrega em `~/.omp/agent`: agentes, comandos, scripts, extensões, configuração e skills gerais. O pacote complementa uma instalação base do Oh My Pi; ele não instala o runtime do Oh My Pi nem substitui suas configurações gerais de editor.

A instalação é limpa: não existe merge automático sobre uma configuração
existente. O pacote público não anuncia uma release semântica; identifique o
conteúdo instalado pela revisão Git aprovada e pelos hashes do manifesto.


## Passo 1: Fazer backup do diretório atual (se existir)

Se você já tem um `~/.omp/agent` com arquivos seus, renomeie a pasta antes de
instalar:

```powershell
Rename-Item -LiteralPath "$env:USERPROFILE\.omp\agent" -NewName "omp-agent-backup"
```

A distribuição pública não migra nem mistura configurações automaticamente.
Use o backup como referência e copie o que quiser depois.

## Passo 2: Obter e revisar a distribuição

Clone o repositório e revise a revisão do Git, o manifesto do pacote e os
arquivos antes de instalar:

```powershell
git clone https://github.com/MaiconGambini/omp-harness-guide.git
Set-Location omp-harness-guide
Get-ChildItem .\omp\agent
Get-Content .\omp\agent\omp-port-manifest.json
```

`omp/agent/` é o pacote runtime carregado pelo OMP. `website/` é somente o
site da documentação; instalar suas dependências serve para desenvolver o
site e não instala nada em `~/.omp/agent`.


## Passo 3: Validar o pacote público

O validador verifica manifest, caminhos proibidos, conteúdo com formato de
segredo, famílias ofensivas e paridade da documentação:

```powershell
node scripts/validate-public-subset.mjs --check-manifest
node scripts/validate-public-subset.mjs
```

Não prossiga se qualquer comando retornar `FAIL`.

## Passo 4: Instalar em uma pasta limpa

Depois do backup, copie a árvore real do pacote para `~/.omp/agent`:

```powershell
$target = Join-Path $env:USERPROFILE ".omp\agent"
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -Path ".\omp\agent\*" -Destination $target -Recurse -Force
```

![Fluxo de instalação e bootstrap do harness](/omp-harness-guide/img/diagrams/onboarding-instalacao.png)
*Fluxo de instalação, validação do pacote público e bootstrap do harness.*
O pacote não inclui estado de sessão, bancos locais, caches, findings,
traces, receipts ou outras evidências de runtime.

## Passo 5: Reabrir e conferir

Feche e reabra o Oh My Pi. Agentes, comandos, skills e extensões são carregados somente na inicialização. Confira os arquivos gerenciados:

```powershell
Get-ChildItem "$env:USERPROFILE\.omp\agent" -Recurse -File |
  Measure-Object
```

O arquivo `~/.omp/agent/omp-port-manifest.json` registra hashes do pacote
publicado para inspeção e auditoria.

## Estrutura instalada

Após a instalação, `~/.omp/agent` contém a distribuição pública auditada pelo manifesto (299 arquivos no total):

- `agents/` — 25 perfis de agentes aprovados para a distribuição pública.
- `skills/` — 110 skills defensivas e metodológicas carregadas sob demanda.
- `commands/` — 21 comandos do harness, incluindo `/prevc`, `/maestri-team` e suporte operacional.
- `scripts/` — 55 utilitários Node portáveis para transições de ciclo, validações de manifesto e métricas de fluxo.
- `extensions/` — 2 extensões nativas carregadas pelo Oh My Pi na inicialização.
- `config.yml` — configuração pública de agentes e papéis de modelo.
- `omp-port-manifest.json` — inventário criptográfico com hashes SHA-256 de cada arquivo distribuído.

Consulte o manifesto para verificar os hashes do seu checkout. Essas quantidades refletem a árvore distribuível atual e não representam promessa de capacidade arbitrária.
Não fazem parte do pacote: skills `recon-*`, `redteam-*`, `hiagosh-*`,
`wstg-*`, exploração, pentest, chains de ataque e estado privado local.

## Solução de problemas

| Problema | Ação |
|---|---|
| `validate-public-subset` falha | Leia o motivo e não instale uma árvore que falhou no validador. |
| O destino `~/.omp/agent` já existe | Renomeie-o para `omp-agent-backup`; não faça merge manual antes do backup. |
| Oh My Pi não carrega os comandos | Feche e reabra o Oh My Pi; a configuração é carregada apenas na inicialização. |
| Um script do harness falha | Verifique Node.js 20+, a revisão do checkout e os caminhos exibidos pelo script. |

## O que isto prova e o que não prova

- **O que prova:** que os arquivos instalados em `~/.omp/agent` correspondem com exatidão ao manifesto público validado, sem arquivos de evidência privada nem credenciais vazadas.
- **O que não prova:** não garante que os provedores de modelo no seu `config.yml` possuam chaves ativas ou cotas suficientes, nem substitui os testes e o build da sua aplicação.

## Próximo passo

Vá para [Primeira Sessão](./first-session) e use o núcleo público do harness pela primeira vez.
