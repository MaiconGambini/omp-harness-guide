---
sidebar_position: 5
---

# Portabilidade

> **Estado PREVC:** `prepare → handoff` — o harness é regenerável; a árvore instalada nunca é o sistema de registro.

O guia de portabilidade descreve como transportar e reproduzir a instalação do Harness Oh My Pi em diferentes máquinas ou ambientes locais a partir de revisões versionadas e manifestos verificáveis. A distribuição pública reside em `omp/agent/` e é instalada em `~/.omp/agent`.

## A árvore instalada é regenerável

Na máquina nova, clone uma revisão conhecida, revise o manifest do pacote e
valide a árvore antes de copiá-la:

```powershell
git clone https://github.com/MaiconGambini/omp-harness-guide.git
Set-Location omp-harness-guide
Get-Content .\omp\agent\omp-port-manifest.json
node scripts/validate-public-subset.mjs --check-manifest
```

A instalação é uma cópia limpa:

```powershell
$target = Join-Path $env:USERPROFILE ".omp\agent"
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -Path ".\omp\agent\*" -Destination $target -Recurse -Force
```

Não existe exportador ou comando de migração no pacote público. Se o destino
já existe, renomeie-o para `omp-agent-backup` antes da cópia. Isso evita merge
silencioso e mantém sua configuração anterior recuperável.

## Levar para outro PC

- Use a mesma revisão Git em todas as máquinas.
- Não copie `node_modules`: as dependências do `website/` são locais e não
  fazem parte do runtime OMP.
- Revise `config.yml` e `omp-port-manifest.json` antes de iniciar o Oh My Pi.
- Feche e reabra o Oh My Pi após substituir arquivos; o carregamento ocorre na
  inicialização.

## O que não é transportado

O pacote não contém estado de sessão, bancos locais, caches, findings, traces,
receipts, backups locais ou outras evidências de runtime. Também não contém
skills `recon-*`, `redteam-*`, `hiagosh-*`, `wstg-*`, exploração, pentest ou
chains de ataque.

## O que isto prova e o que não prova

- **O que prova:** que a distribuição do harness é regenerável a partir de uma revisão de controle de versão conhecida e verificável por manifesto criptográfico.
- **O que não prova:** não transporta histórico de conversas privadas, chaves de API locais nem credenciais de serviços externos.
