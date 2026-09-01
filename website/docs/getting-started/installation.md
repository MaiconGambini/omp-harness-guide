---
sidebar_position: 2
---

# Instalação

O Harness Oh My Pi é distribuído como um conjunto de arquivos gerenciados instalados em `~/.omp/agent`, o diretório de agente do Oh My Pi. A instalação é limpa: não existe merge automático sobre uma configuração existente. O que existe é backup explícito, migração assistida de layout legado e verificação de paridade.

## Passo 1: Fazer backup do diretório atual (se existir)

Se você já tem um `~/.omp/agent` com arquivos seus (comandos, extensões, configurações), renomeie a pasta antes de instalar:

```powershell
Rename-Item -LiteralPath "$env:USERPROFILE\.omp\agent" -NewName "omp-agent-backup"
```

A instalação não faz merge automático em uma instalação existente. Use o backup como referência e copie o que quiser depois.

## Passo 2: Obter a distribuição e instalar dependências

A árvore Oh My Pi do harness é gerada por `scripts/export-to-omp.mjs` no checkout de origem e verificada por `omp-port-manifest.json`. Obtenha o checkout de origem da distribuição, revise o `package.json` e o lockfile antes de executar scripts Node e instale as dependências sem lifecycle scripts de terceiros:

```powershell
Set-Location <caminho-da-distribuicao>
npm ci --ignore-scripts
```

> `npm ci` exige um lockfile compatível e instala exatamente as versões registradas. Binários de plataforma exigem instalação local — não copie `node_modules` entre máquinas. Execute scripts do projeto somente depois de revisar a revisão e o manifesto.

## Passo 3: Prévia (dry run)

Antes de tocar qualquer arquivo, veja o que será instalado:

```powershell
npm run omp:dry-run
```

O modo de prévia executa o exportador sem escrever na instalação. *(Saída ilustrativa:)*

```text
preview: dry run ok — nenhuma escrita realizada
```

## Passo 4: Instalar ou migrar

Se `~/.omp/agent` não existe (instalação limpa):

```powershell
npm run omp:install
```

Se existe um layout legado do harness (configuração no formato anterior):

```powershell
npm run omp:migrate
```

A migração:

- substitui apenas os arquivos gerenciados que pertencem ao manifesto;
- preserva **arquivos não gerenciados** (relatório `unmanaged: { count, unchanged, changed }`);
- faz backup byte-exact de cada colisão substituída em `~/.omp/agent/backups/`, com um manifesto gravado (caminho original + hash) — nenhum arquivo seu é apagado sem cópia.

Uma segunda execução deve ser idempotente: `migrated: 0` indica que não há novas mudanças gerenciadas. Se o comando terminar com `exit 2`, o harness recusou a transição por uma pré-condição; leia a razão exibida em vez de tratar o caso como uma falha genérica do npm.

## Passo 5: Verificar a instalação

```powershell
npm run omp:check
```

A verificação compara a árvore instalada com o manifesto e reporta drift. *(Saída ilustrativa:)*

```text
{ "ok": true, "drift": [] }
```

`ok: false` ou uma lista de drift nomeia os arquivos divergentes para inspeção. Depois da verificação, **feche e reabra o Oh My Pi**: comandos e extensões são carregados apenas na inicialização.

## Estrutura resultante

Após a instalação, `~/.omp/agent` contém:

- `commands/` — comandos do harness (`/prevc`, `/quality`, `/harness-*`).
- `agents/` — perfis de source agents (scheduler, implementer, reviewers, judge, refiner e outros).
- `scripts/` — utilitários Node portáveis (`harness-prevc-state.mjs`, `harness-quality-gate.mjs`, `harness-risk-router.mjs`, `harness-trace.mjs`, entre outros).
- `extensions/` — a extensão de rastreio `harness-omp-trace.ts` e extensões de status/segurança.
- `skills/` — skills carregadas pelo Oh My Pi.
- `docs/` — o contexto global compartilhado (`docs/context.md`), gerado pelo exportador, não editado à mão.
- `config.yml` — configuração do agente, incluindo os papéis de modelo (`modelRoles`).
- `backups/` — cópias de migração (criadas apenas quando há colisões).

Diretórios de runtime (sessões, caches, bancos locais) não fazem parte da distribuição gerenciada e não são tocados pela instalação.

## Solução de problemas

| Problema | Ação |
|---|---|
| `npm ci` falha | Verifique o Node.js 20+ (`node --version`), a revisão do checkout e a compatibilidade entre `package.json` e lockfile. |
| `exit 2` ao instalar ou migrar | Leia a pré-condição informada pelo harness; não repita às cegas nem trate como erro genérico do npm. |
| `omp:check` reporta drift | Leia os caminhos listados; arquivos não gerenciados são esperados e preservados. |
| Oh My Pi não carrega os comandos | Feche e reabra o Oh My Pi. A configuração é carregada apenas na inicialização. |

## Próximo passo

Vá para [Primeira Sessão](./first-session) e use o harness pela primeira vez.
