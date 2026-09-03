---
sidebar_position: 2
---

# Instalação

O Harness Oh My Pi é distribuído no diretório `omp/agent/` deste repositório.
Essa árvore contém os arquivos que o Oh My Pi carrega em
`~/.omp/agent`: agents, comandos, scripts, extensão, configuração e skills
gerais. Ela complementa uma instalação base do Oh My Pi; não instala o
runtime do Oh My Pi nem substitui sua configuração.

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

O pacote não inclui estado de sessão, bancos locais, caches, findings,
traces, receipts ou outras evidências de runtime.

## Passo 5: Reabrir e conferir

Feche e reabra o Oh My Pi. Agents, comandos, skills e extensões são carregados
somente na inicialização. Confira os arquivos gerenciados:

```powershell
Get-ChildItem "$env:USERPROFILE\.omp\agent" -Recurse -File |
  Measure-Object
```

O arquivo `~/.omp/agent/omp-port-manifest.json` registra hashes do pacote
publicado para inspeção e auditoria.

## Estrutura instalada

Após a instalação, `~/.omp/agent` contém os diretórios e arquivos do manifesto:

- `commands/` — comandos do harness, incluindo `/prevc` e suporte.
- `agents/` — perfis de agents permitidos pela distribuição.
- `scripts/` — utilitários Node portáveis.
- `extensions/` — extensões nativas carregadas pelo Oh My Pi.
- `skills/` — skills gerais e defensivas, carregadas sob demanda.
- `docs/` — contexto global compartilhado, quando incluído no manifesto.
- `config.yml` — configuração pública de agents e papéis de modelo.
- `omp-port-manifest.json` — inventário e hashes do pacote.

Consulte o manifesto para a contagem e a revisão exatas do checkout. Não trate
essas quantidades como uma versão ou como promessa de capacidade.

Não fazem parte do pacote: skills `recon-*`, `redteam-*`, `hiagosh-*`,
`wstg-*`, exploração, pentest, chains de ataque e estado privado local.

## Solução de problemas

| Problema | Ação |
|---|---|
| `validate-public-subset` falha | Leia o motivo e não instale uma árvore que falhou no validator. |
| O destino `~/.omp/agent` já existe | Renomeie-o para `omp-agent-backup`; não faça merge manual antes do backup. |
| Oh My Pi não carrega os comandos | Feche e reabra o Oh My Pi; a configuração é carregada apenas na inicialização. |
| Um script do harness falha | Verifique Node.js 20+, a revisão do checkout e os caminhos exibidos pelo script. |

## Próximo passo

Vá para [Primeira Sessão](./first-session) e use o núcleo público do harness pela primeira vez.
