---
sidebar_position: 2
---

# Agents e Skills

A referência de agentes e skills documenta os perfis especializados e as instruções sob demanda que integram a distribuição pública do Oh My Pi.

## Agents

Os perfis ficam em `~/.omp/agent/agents/`. Todo subagente despachado via `task` **precisa** nomear um source agent explícito da lista de perfis instalados — nunca um perfil embutido do runtime. Cada perfil tem sua allowlist de ferramentas e seus limites de escrita. O pacote público inclui 25 perfis especializados.

| Agent | Papel | Edita? |
|---|---|---|
| `scheduler` | Despachador da fase Execute: uma onda `tasks[]`, reconciliação e commit local | não |
| `planner` | Pipeline de planejamento (via comando `/planner`) | só artefatos de plano |
| `implementer` | Implementação de lane escopada (TDD nos seams combinados) | sim |
| `fixer` | Correção de lane escopada | sim |
| `explorer` | Reconhecimento read-only | não |
| `test-runner` | Shard de suíte de testes (paralelo) | sim |
| `test-automation-engineer` | Automação e execução de testes | sim |
| `code-reviewer` | Quality gate — revisão de código (família de modelo desacoplada) | não |
| `architecture-reviewer` | Quality gate — revisão estrutural e modular | não |
| `judge` | Veredito pós-gate (recibo JSON com rubrica) | não |
| `refiner` | Proposta de melhoria pós-Judge (read-only) | não |
| `rule-verifier` | Refutação adversarial de propostas de regra | não |
| `plan-architect` | Arquitetura de planos em tarefas bite-sized | não |
| `requirements-interrogator` | Interrogação e refinamento de requisitos | não |
| `design-director` | Direção de design, estética e tokens visuais | não |
| `design-patterns-advisor` | Padrões de projeto e desacoplamento | não |
| `system-design-advisor` | Arquitetura e confiabilidade de sistemas distribuídos | não |
| `architecture-advisor` | Module boundaries e transições arquiteturais | não |
| `backend-infra-engineer` | Infraestrutura backend, contêineres e CI | sim |
| `python-engineer`, `web-platform-engineer`, `vue-engineer`, `kotlin-engineer`, `postgres-engineer` | Implementação especializada por ecossistema | sim |
| `better-portuguese` | Redação e revisão de documentação e copy em PT-BR | não |
| `comment-sicko` | Limpeza de narração de fase e comentários redundantes | não |

Regras de dispatch:

- `refiner` e `rule-verifier` são estritamente read-only: não editam arquivos, não executam comandos de escrita no shell e não delegam trabalho.
- O revisor de código (`code-reviewer`) roda preferencialmente em família de modelo diferente da família do autor/implementador, evitando vieses cegos da mesma linhagem.
- Reviewers retornam avaliações estruturadas ao scheduler; não gravam findings diretamente no repositório.
- `judge` emite um recibo JSON padronizado com veredito (`accept`, `reject` ou `revise`); o ciclo PREVC persiste o recibo.
- Papéis de modelo são configurados em `config.yml` (`modelRoles`); o papel de scheduler é reservado e nunca é alterado automaticamente.

## Skills

Skills são arquivos de instrução `SKILL.md` carregados pelo Oh My Pi de forma preguiçosa
(lazy-loading), apenas quando a tarefa combina semanticamente com a descrição da skill.
A distribuição pública contém 110 skills gerais, de engenharia e defensivas curadas.
Famílias de recon, pentest ofensivo, exploração, WSTG e cadeias de ataque não fazem parte
deste pacote público.

### Harness — ciclo de vida e workflow

| Skill | Quando usar |
|---|---|
| `prevc-workflow` | Controlar o ciclo de vida de trabalho significativo (prepare → plan → execute → validate → judge → refine → confirm) |
| `harness-omp` | Mapear o harness para os primitivos nativos do Oh My Pi (task, hub, todo, `pi.on`) |
| `harness-omp-parallel` | Coordenar execução concorrente no Oh My Pi: shards de teste e lanes simultâneas |
| `orchestrate` | Orquestrar múltiplas lanes de implementação e dependências no ciclo PREVC |
| `harness-session-start` | Início de toda sessão: descobre instruções, estado durável e task ativa |
| `harness-clean-handoff` | Fim de toda sessão: fecha o estado com evidência e handoff estruturado |
| `harness-session-handoff` | Registrar e verificar o handoff entre sessões consecutivas |
| `harness-continuity` | Trabalho multi-sessão: protocolo de bloqueio e máquina de estados com WIP=1 |
| `harness-wip-control` | Antes de prompts multi-step: decompõe em WIP=1, define critérios de aceite e non-goals |
| `harness-progress-log` | Manter e rotacionar o log de progresso durável |
| `harness-feature-state` | Antes do Execute: audita e sincroniza o `feature_list.json` |
| `harness-role-separation` | Tarefas complexas ou de UI: divide papéis entre Planner, Generator e Evaluator |
| `harness-startup-path` | Descobrir comandos reproduzíveis de startup e build do projeto |
| `harness-root-instructions` | Localizar, auditar e respeitar instruções raiz do repositório |
| `harness-runtime-feedback` | Capturar feedback de execução e telemetria durante as tarefas |
| `harness-readable-workspace` | Sessão com dificuldade de orientação: teste fresh-session e correção de gaps |
| `harness-context-layer` | Resolver decisões arquiteturais inconsistentes e documentar convenções |
| `harness-refine` | Fase Refine pós-Judge: dispara o refiner read-only e roteia propostas por blast radius |

### Harness — setup, portabilidade e equipe

| Skill | Quando usar |
|---|---|
| `harness-initializer` | Primeira interação com o projeto: auditoria não-mutatória das camadas |
| `harness-bootstrap` | Instalar o pacote completo do harness com aprovação do operador |
| `harness-project-setup` | Detectar stack, testes, lint e Docker ao inicializar novos projetos |
| `maestri-workspace-team` | Provisionar e gerenciar a equipe padrão de dez papéis no Maestri |
| `harness-stack-router` | Identificar linguagens, frameworks e ecossistemas a partir de evidências nos arquivos |
| `harness-standards-router` | Carregar standards aplicáveis do projeto e globais para o plano |
| `harness-agent-os-specs` | Criar e gerenciar especificações Agent OS a partir dos templates |
| `harness-agent-permissions` | Definir e auditar matriz de permissões de ferramentas por perfil |
| `harness-portability` | Garantir portabilidade do harness entre diferentes ambientes |
| `harness-cursor-parity` | Manter paridade de configurações e comandos com outros editores |

### Harness — verificação, qualidade e diagnóstico

| Skill | Quando usar |
|---|---|
| `harness-termination-check` | Antes de declarar "pronto": verificação em camadas (estática → runtime → sistema) |
| `harness-evaluator-rubric` | Antes do Judge: elaboração da rubrica objetiva de critérios para avaliação |
| `harness-architecture-checks` | Checar regras de isolamento de módulos e imports proibidos |
| `harness-quality-gate` | Executar o gate medido e avaliar o veredito (exit 1 = corrigir código, exit 2 = blocker) |
| `harness-quality-snapshot` | Capturar scorecard de maturidade em releases ou marcos de entrega |
| `harness-capstone-audit` | Auditoria estrutural periódica do estado do harness |
| `harness-benchmark` | Medir tempos e thresholds de execução do harness |
| `harness-cleanup-scanner` | Localizar resíduos de build, arquivos temporários e TODOs obsoletos |
| `harness-security-scan` | Auditar segredos e supply-chain no harness e projeto |
| `harness-mcp-inventory` | Inventariar servidores MCP e prevenir vazamentos acidentais de credenciais |
| `harness-context-budget` | Auditar o consumo de contexto de ferramentas e sugerir lazy-loading |
| `harness-status` | Obter relatório de readiness operacional do projeto |
| `harness-worktree-lifecycle` | Inspecionar segurança de worktrees em execuções paralelas concorrentes |
| `harness-project-calibration` | Calibrar thresholds de qualidade a partir do histórico real do repositório |
| `harness-rule-enforce` | Promover regras aprendidas a testes automatizados ou lint no pipeline |
| `harness-redteam-check` | Análise adversarial rápida sobre diffs reconciliados antes do gate final |
| `harness-verify-audit` | Auditar divergências entre código real e instruções de skills |
| `harness-verify-bootstrap` | Configurar suíte automatizada de verificação e testes |

### Planejamento, redação e código limpo

| Skill | Quando usar |
|---|---|
| `writing-plans` | Elaborar planos de implementação em tarefas pequenas (2 a 5 minutos) com TDD |
| `to-spec` | Sintetizar requisitos discutidos em uma especificação formal `spec.md` |
| `to-tickets` | Decompor um plano em tickets sequenciados por dependências |
| `research` | Investigar documentação técnica, APIs ou arquitetura antes de propor mudanças |
| `grilling` | Questionar rigorosamente o operador para explorar trade-offs e ambiguidades |
| `grill-with-docs` | Stress-testing de requisitos apoiado na leitura da documentação existente |
| `wayfinder` | Mapear iniciativas complexas e ambíguas em tickets de decisão |
| `domain-modeling` | Modelar entidades centrais de negócio e regras de domínio |
| `codebase-design` | Refatorar fronteiras de módulos e criar costuras para testes |
| `prototype` | Validar modelos de estado ou conceitos de UI sem compromisso de código de produção |
| `implement` | Executar especificações ou planos aprovados mantendo ciclo TDD |
| `better-portuguese` | Redigir ou revisar textos, documentação e microcopy em português do Brasil nativo |
| `no-comments` | Remover comentários redundantes e narração de IA mantendo lista fechada de exceções |
| `unslop` | Limpar jargão inflado de IA e simplificar a prosa em especificações e documentos |

### Engenharia e stacks

Skills especializadas de engenharia acompanham o repositório (`react`, `nextjs-app-router-patterns`, `python-pro`, `fastapi`, `typescript`, `tdd`, `systematic-debugging`, `verification-before-completion`, `code-review`, `receiving-code-review`, `dispatching-parallel-agents`, `using-git-worktrees`, `resolving-merge-conflicts`, `playwright-cli`). Skills defensivas de segurança (`frontend-security-coder`, `backend-security-coder`, `frontend-mobile-security-xss-scan`) integram o núcleo defensivo.

## O que isto prova e o que não prova

- **O que prova:** a ativação de skills restringe o escopo de atuação do modelo, fornece instruções procedimentais testadas e padroniza a separação de responsabilidades (por exemplo, leitura versus escrita, ou autor versus revisor).
- **O que NÃO prova:** ter uma skill carregada não garante conformidade infalível do modelo com todas as diretrizes. A validação precisa ocorrer em camadas posteriores por meio de testes automatizados, revisão de código e inspeção do gate.

## Páginas relacionadas

- [Comandos](./commands.md) — Comandos do Oh My Pi para invocar skills e operações do harness.
- [Artefatos](./artifacts.md) — Documentos e esquemas manipulados pelos agents.
- [Dispatch Paralelo](../guides/parallel-dispatch.md) — Distribuição de lanes entre agents especializados.
