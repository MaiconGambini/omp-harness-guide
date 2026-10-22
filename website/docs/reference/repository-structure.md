---
sidebar_position: 4
---

# Estrutura do Repositório

A estrutura do repositório descreve a organização física dos arquivos do harness nas três camadas operacionais: o repositório público de documentação, a instalação gerenciada do usuário e a árvore de diretórios nos projetos governados.

## Repositório público (`omp-harness-guide`)

```text
omp-harness-guide/
|-- README.md                     Apresentação bilíngue e instruções de instalação
|-- omp/
|   `-- agent/                    Núcleo distribuível do Oh My Pi
|       |-- agents/               Perfis de source agents especializados (25)
|       |-- commands/             Comandos globais slash (21)
|       |-- extensions/           Extensões nativas (2)
|       |-- scripts/              Utilitários portáveis de suporte e gate (55)
|       |-- skills/               Skills de engenharia, ciclo de vida e defesa (110)
|       |-- docs/                 Contexto global (context.md)
|       |-- config.yml            Configuração pública do agente
|       `-- omp-port-manifest.json Inventário de integridade com hashes SHA-256
|-- website/                      Site de documentação em Docusaurus
|   |-- docs/                     Conteúdo em português do Brasil (padrão)
|   |-- i18n/en/...               Espelho completo em inglês
|   |-- src/                      Páginas estáticas e temas
|   |-- static/                   Imagens, diagramas e assets
|   |-- docusaurus.config.ts      Configurações do site
|   |-- sidebars.ts               Navegação lateral estruturada
|   `-- package.json              Dependências e scripts do site
|-- scripts/
|   |-- harness-manifest.json     Manifesto de inclusões e exclusões públicas
|   `-- validate-public-subset.mjs Validador automático de integridade do pacote
`-- .github/workflows/            Pipelines de validação e publicação no GitHub Pages
```

O repositório público reúne a documentação técnica, o núcleo distribuível verificado e as ferramentas de validação de entrega. Nenhum arquivo de credencial, segredo ou evidência privada de runtime é publicado.

## Instalação gerenciada (`~/.omp/agent`)

A distribuição instalada na máquina do operador replica a árvore distribuível:

```text
~/.omp/agent/
|-- config.yml              Configuração pública do agente e mapeamento de papéis
|-- commands/               Comandos globais slash (21 arquivos)
|-- agents/                 Perfis de subagente para dispatch (25 arquivos)
|-- scripts/                Utilitários de auditoria, métricas e gates (55 arquivos)
|-- extensions/             Extensões nativas de telemetria (2 arquivos)
|-- skills/                 Skills carregadas sob demanda (110 pastas de skill)
|-- docs/                   Contexto global de operação (docs/context.md)
`-- omp-port-manifest.json  Inventário de integridade (299 arquivos indexados)
```

Essa árvore é verificada pelo `omp-port-manifest.json`. Diretórios temporários de runtime (como caches locais e bancos de sessão) são mantidos isolados e não integram o pacote distribuível.

## Layout do harness no projeto

Ao adotar o harness, um repositório incorpora a seguinte organização:

```text
<projeto>/
|-- AGENTS.md                     Instruções, diretrizes e regras raiz do projeto
|-- feature_list.json             Fonte da verdade para execução em WIP=1
|-- .github/
|   `-- pull_request_template.md  Template de PR com Tier, Testes, Rollback e Dono
|-- agent-os/
|   |-- project-profile.json      Perfil detectado: stack, comandos e política fixLoop
|   |-- prevc-autonomy.json       Configuração de autoConfirm e critérios de autonomia
|   |-- quality-thresholds.json   Chaves de métricas de qualidade e roteador de risco
|   |-- learned-rules.json        Ledger local de regras ativas e aprendidas
|   |-- security-contract.json    Declaração de controles de autorização
|   |-- standards/                Diretrizes e padrões técnicos do projeto
|   `-- specs/<slug>/             Especificações, planos de implementação e tickets
`-- docs/
    |-- review.md                 Regras de code review, falhas críticas e defeitos escapados
    `-- harness/
        |-- progress.md           Log de progresso, marcos e histórico de blockers
        |-- session-handoff.md    Documento formal de transferência entre sessões
        |-- sprint-contract.md    Contrato de escopo e critérios de aceite
        `-- (registros de auditoria, recibos do Judge e relatórios do gate)
```

## O que é carregado pelo Oh My Pi

Na inicialização, o runtime Oh My Pi varre `~/.omp/agent` e registra:

- **Comandos (`commands/`):** comandos prefixados por barra (como `/prevc` e `/maestri-team`).
- **Skills (`skills/`):** instruções procedimentais em `SKILL.md`, carregadas sob demanda conforme a descrição.
- **Extensões (`extensions/`):** hooks nativos de telemetria configurados no arquivo `config.yml`.
- **Agentes (`agents/`):** papéis com limitações estritas de ferramentas atribuídos em chamadas `task`.
- **Papéis de modelo (`config.yml`):** mapeamento de modelos para scheduler, review, implementação e refino.

## O que isto prova e o que não prova

- **O que prova:** a conformidade da árvore garante que todas as peças necessárias para o ciclo PREVC estão instaladas nos locais esperados e com hashes correspondentes ao manifesto público.
- **O que NÃO prova:** a integridade dos arquivos comprova apenas a presença e integridade do harness. A saúde funcional do código desenvolvido no projeto depende da execução dos testes e dos gates de qualidade correspondentes.

## Páginas relacionadas

- [Comandos](./commands.md) — Relação e sintaxe de comandos operacionais.
- [Artefatos](./artifacts.md) — Definição dos esquemas e papéis de cada artefato.
- [Projeto Existente](../guides/existing-project.md) — Como configurar essa estrutura em repositórios em andamento.
