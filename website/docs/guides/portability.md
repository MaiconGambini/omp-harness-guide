---
sidebar_position: 5
---

# Portabilidade

> **Estado PREVC:** `prepare → handoff` — o harness é regenerável; a árvore instalada nunca é o sistema de registro.

O harness pode ser movido entre máquinas ou compartilhado com outros desenvolvedores.

## A árvore instalada é regenerável

A árvore gerenciada em `~/.omp/agent` é gerada pelo exportador (`scripts/export-to-omp.mjs`) a partir do checkout de origem e verificada por `omp-port-manifest.json`. Na máquina nova, revise a revisão do checkout, o `package.json` e o lockfile antes de executar os scripts:

```powershell
npm ci --ignore-scripts
npm run omp:dry-run
npm run omp:install
npm run omp:check
```

`npm ci --ignore-scripts` instala exatamente as versões do lockfile sem executar lifecycle scripts de dependências; não execute scripts de um checkout não revisado.

## Migrar uma instalação legada

Se a máquina tem um layout legado do harness:

```powershell
npm run omp:migrate
```

- Substitui apenas arquivos gerenciados (colisões com o manifesto).
- Backup byte-exact de cada colisão em `~/.omp/agent/backups/` com manifesto gravado.
- Arquivos não gerenciados são preservados (`unmanaged: { count, unchanged, changed }`).

## Exportar para outros destinos

O checkout de origem do harness inclui scripts de export dedicados que geram a mesma árvore para outros agentes ou diretórios de instalação. O conteúdo gerenciado — comandos, agents, scripts, extensões, skills, docs, config — é o mesmo em qualquer destino.

## Instalar no outro PC

- Binários de plataforma exigem instalação local com `npm ci --ignore-scripts`; copiar `node_modules` entre sistemas diferentes não funciona.

## Cuidados

- Não copie `node_modules` entre máquinas.
- Revise a configuração após a instalação. Caminhos usam `os.homedir()`, então nenhuma edição manual de caminho é necessária em um perfil padrão.
- Se você tem uma configuração existente, faça backup antes de sobrescrever.
- Este repositório público (`omp-harness-guide`) contém **apenas documentação** — o harness em si vem do checkout de origem da distribuição.
- Confira a paridade após qualquer migração com `npm run omp:check`; a inspeção de drift nomeia cada arquivo divergente.
