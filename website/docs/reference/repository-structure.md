---
sidebar_position: 4
---

# Estrutura do Repositório

Três camadas compõem o harness Oh My Pi: o **repositório público de documentação**, a **instalação gerenciada** em `~/.omp/agent` e o **layout do harness no projeto**.

## Repositório público (`omp-harness-guide`)

```text
omp-harness-guide/
|-- README.md                     Apresentação bilíngue + instalação
|-- website/                      Site de documentação (Docusaurus)
|   |-- docs/                     Fonte da documentação (pt-BR, padrão)
|   |-- i18n/en/...               Tradução (en)
|   |-- src/                      Página inicial e tema
|   |-- static/                   Imagens e favicon
|   |-- docusaurus.config.ts      Configuração do site
|   |-- sidebars.ts               Navegação
|   `-- package.json              Dependências do site
|-- scripts/
|   |-- harness-manifest.json     Manifesto público (allowlist)
|   `-- validate-public-subset.mjs Validador de subset público
`-- .github/workflows/            CI: validação e deploy Pages
```

O repositório contém **apenas documentação e validação pública**. Ele não distribui o harness em si nem qualquer evidência de runtime.

## Instalação gerenciada (`~/.omp/agent`)

```text
~/.omp/agent/
|-- config.yml              Configuração do agente (modelRoles etc.)
|-- commands/               Comandos do harness (/prevc, /quality, /harness-*)
|-- agents/                 Perfis de source agents (24)
|-- scripts/                Utilitários Node portáveis (harness-prevc-state.mjs,
|                           harness-quality-gate.mjs, harness-risk-router.mjs,
|                           harness-trace.mjs, harness-findings.mjs, ...)
|-- extensions/             Extensões (harness-omp-trace.ts, security guard, status)
|-- skills/                 Skills carregadas pelo Oh My Pi
|-- docs/                   Contexto global gerado (docs/context.md)
|-- tests/                  Testes do harness
`-- backups/                Backups de migração (quando há colisões)
```

Essa árvore é **gerada** pelo exportador (`scripts/export-to-omp.mjs` no checkout de origem) e verificada por `omp-port-manifest.json`. Diretórios de runtime (sessões, caches, bancos locais) existem ao lado, mas não fazem parte da distribuição gerenciada.

## Layout do harness no projeto

```text
<projeto>/
|-- AGENTS.md                     Instruções do projeto
|-- feature_list.json             Fonte da verdade de WIP=1
|-- agent-os/
|   |-- quality-thresholds.json   Métricas e risk routing
|   |-- learned-rules.json        Ledger de regras locais
|   |-- security-contract.json    Contrato de segurança
|   |-- standards/                Standards do projeto
|   `-- specs/<slug>/             Specs, planos, decisões e tickets
`-- docs/harness/
    |-- state/prevc.json          Fase durável do ciclo de vida
    |-- progress.md               Progresso e blockers
    |-- session-handoff.md        Handoff entre sessões
    |-- sprint-contract.md        Escopo e AC de features complexas
    |-- findings/                 Findings tipados (append-only)
    |-- judge/                    Recibos do Judge
    |-- quality/                  Relatórios de gate e superfícies derivadas
    `-- traces/                   Envelope de rastreio redigido
```

## O que é carregado pelo Oh My Pi

O Oh My Pi lê `~/.omp/agent` na inicialização. Ele registra:

- Comandos em `commands/` (slashes como `/prevc`).
- Skills em `skills/` (qualquer `SKILL.md` dentro de subdiretório).
- Extensões em `extensions/` (arquivos registrados em `config.yml`).
- Agents em `agents/` (perfis de subagente especializados).
- Papéis de modelo em `config.yml` (`modelRoles`).

## Observação sobre a distribuição pública

Esta distribuição pública **não inclui** skills ofensivas de segurança, nem evidência de runtime local (estado, relatórios de gate, notas de revisão, findings, traces), nem manifestos/índices privados. As exclusões são declaradas em `scripts/harness-manifest.json` e verificadas por máquina: o validador `scripts/validate-public-subset.mjs` recusa conteúdo proibido em toda a árvore pública, e o workflow de validação bloqueia a publicação que o contenha. Esses artefatos excluídos existem apenas na instalação privada do autor.
