---
sidebar_position: 2
---

# Agents e Skills

O harness no Oh My Pi tem duas camadas de capacidade: **agents** (perfis de subagente com papel, ferramentas e permissões fixas) e **skills** (arquivos `SKILL.md` carregados sob demanda quando a task combina com a descrição).

## Agents

Os perfis ficam em `~/.omp/agent/agents/`. Todo subagente despachado via `task` **precisa** nomear um source agent explícito da lista de perfis instalados — nunca um perfil embutido do runtime. Cada perfil tem sua allowlist de ferramentas e seus limites de escrita.

| Agent | Papel | Edita? |
|---|---|---|
| `scheduler` | Despachador da fase Execute: uma onda `tasks[]`, reconciliação e commit local | não |
| `planner` | Pipeline de planejamento (via comando `/planner`) | só artefatos de plano |
| `implementer` | Implementação de lane escopada (TDD nos seams combinados) | sim |
| `fixer` | Correção de lane escopada | sim |
| `explorer` | Reconhecimento read-only | não |
| `test-runner` | Shard de suite de testes (paralelo) | sim |
| `test-automation-engineer` | Automação de testes | sim |
| `code-reviewer` | Quality gate — revisão de código | não |
| `architecture-reviewer` | Quality gate — revisão de arquitetura | não |
| `judge` | Veredito pós-gate (recibo JSON) | não |
| `refiner` | Proposta de melhoria pós-Judge (read-only) | não |
| `rule-verifier` | Refutação de propostas de regra | não |
| `plan-architect` | Arquitetura de planos | não |
| `requirements-interrogator` | Interrogação de requisitos | não |
| `design-director` | Direção de design de interface | não |
| `design-patterns-advisor` | Padrões de design | não |
| `system-design-advisor` | Design de sistemas | não |
| `architecture-advisor` | Aconselhamento de arquitetura | não |
| `backend-infra-engineer` | Infraestrutura backend | sim |
| `python-engineer`, `web-platform-engineer`, `vue-engineer`, `kotlin-engineer`, `postgres-engineer` | Implementação especializada por stack | sim |

Regras de dispatch:

- `refiner` e `rule-verifier` são read-only: não editam, não executam shell, não delegam e não acessam diretórios externos.
- Reviewers retornam resultados ao scheduler; não gravam findings.
- `judge` devolve um recibo; o PREVC grava o recibo.
- Papéis de modelo são fixos em `config.yml` (`modelRoles`); o papel de scheduler é reservado e nunca é rebaixado automaticamente.

## Skills

Skills são arquivos `SKILL.md` que o Oh My Pi carrega de forma preguiçosa
(lazy-loading), apenas quando a task combina com a descrição. A distribuição
pública contém 107 skills gerais e defensivas curadas; famílias de recon,
pentest, exploração, WSTG e chains de ataque ficam fora do pacote.

### Harness — ciclo de vida e workflow

| Skill | Quando usar |
|---|---|
| `prevc-workflow` | Controlar o ciclo de vida de trabalho significativo (prepare → plan → execute → validate → judge → refine → confirm) |
| `harness-omp` | Entender como o harness OpenCode mapeia para os primitivos nativos do Oh My Pi (task, hub, todo, `pi.on`) |
| `harness-omp-parallel` | Executar em paralelo no Oh My Pi: shard de testes e lanes simultâneas |
| `harness-session-start` | Início de toda sessão: descobre instruções, estado e task ativa |
| `harness-clean-handoff` | Fim de toda sessão: fecha o estado com evidência e handoff |
| `harness-session-handoff` | Registrar o handoff entre sessões |
| `harness-continuity` | Trabalho multi-sessão: state machine WIP=1 e protocolo de blocked |
| `harness-wip-control` | Antes de um prompt multi-step: decompõe em WIP=1, define AC e non-goals |
| `harness-progress-log` | Manter o log de progresso durável |
| `harness-feature-state` | Antes do Execute: audita o `feature_list.json` |
| `harness-role-separation` | Tarefas complexas ou de UI: separa Planner → Generator → Evaluator |
| `harness-startup-path` | Descobrir o comando de startup do projeto |
| `harness-root-instructions` | Localizar e ler as instruções raiz do repo |
| `harness-runtime-feedback` | Capturar feedback de runtime durante o trabalho |
| `harness-readable-workspace` | Sessão que não orienta: fresh-session test e mapeamento de gaps |
| `harness-context-layer` | Decisões inconsistentes: audita ARCHITECTURE, PRODUCT, RELIABILITY |
| `harness-refine` | Fase Refine depois do Judge: dispara o refiner read-only e roteia propostas por blast radius |

### Harness — setup, portabilidade e stack

| Skill | Quando usar |
|---|---|
| `harness-initializer` | Primeira vez no projeto: auditoria não-mutatória das camadas |
| `harness-bootstrap` | Instalar o pacote completo do harness com confirmação |
| `harness-stack-router` | Detectar o stack a partir dos arquivos |
| `harness-standards-router` | Rotear standards de projeto e globais aplicáveis |
| `harness-agent-os-specs` | Criar specs Agent OS a partir dos templates |
| `harness-agent-permissions` | Definir e auditar a matriz de permissão de agents |
| `harness-portability` | Garantir portabilidade do harness entre projetos |
| `harness-cursor-parity` | Manter paridade de configuração com outros agentes |

### Harness — verificação, qualidade e diagnóstico

| Skill | Quando usar |
|---|---|
| `harness-termination-check` | Antes de declarar "pronto": check em 3 camadas (static → runtime → system) |
| `harness-evaluator-rubric` | Antes do Judge: constrói a rubrica específica da tarefa |
| `harness-eval-contract` | Definir o contrato de avaliação do trabalho |
| `harness-architecture-checks` | Checar aderência arquitetural |
| `harness-quality-gate` | Rodar o gate medido e reagir ao veredito; exit 1 = corrigir a métrica, exit 2 = blocker |
| `harness-quality-snapshot` | Capturar um snapshot de qualidade do código |
| `harness-capstone-audit` | Auditoria abrangente de fechamento |
| `harness-benchmark` | Medir/benchmark do harness |
| `harness-cleanup-scanner` | Escanear resíduos e arquivos a limpar |
| `harness-security-scan` | Auditar secrets e supply-chain sem expor valores |
| `harness-mcp-inventory` | Inventariar MCPs e detectar drift |
| `harness-context-budget` | Auditar carga de contexto e recomendar lazy-loading |
| `harness-status` | Reportar readiness de git, PREVC, handoff, contexto e segurança |
| `harness-worktree-lifecycle` | Segurança do ciclo de vida de worktrees em agents paralelos |
| `harness-project-calibration` | Derivar thresholds de qualidade e high-risk paths do próprio projeto |
| `harness-rule-enforce` | Promover uma regra em prosa aprovada a regra aplicada (lint \| test \| gate_metric) |
| `harness-redteam-check` | Quickcheck adversarial obrigatório sobre diffs reconciliados |

### Planejamento e specs

| Skill | Quando usar |
|---|---|
| `writing-plans` | Antes de mexer no código, com uma spec ou requisitos de tarefa multi-step |
| `to-spec` | Transformar uma ideia ou nota em uma spec |
| `to-tickets` | Quebrar uma spec em tickets acionáveis |
| `research` | Investigar um tema ou domínio antes de decidir |
| `grill-me` | Ser questionado sem dó sobre um plano ou design até haver entendimento comum |
| `grill-with-docs` | Grilling apoiado na documentação existente (modo AUTO no pipeline de planos) |
| `grilling` | Questionar sem dó o operador sobre um plano, decisão ou ideia |
| `wayfinder` | Orientar-se em um codebase ou domínio desconhecido |
| `domain-modeling` | Modelar o domínio antes de projetar a solução |
| `codebase-design` | Projetar a estrutura do codebase |
| `prototype` | Construir um protótipo rápido para validar uma ideia |
| `implement` | Implementar uma peça de trabalho a partir de uma spec ou conjunto de tickets |

### Engenharia e ferramentas

Skills de frontend, backend, Python, TypeScript, testes, debug e code review acompanham o repositório (ex: `react`, `nextjs-app-router-patterns`, `python-pro`, `fastapi`, `typescript`, `tdd`, `systematic-debugging`, `verification-before-completion`, `reviewing-code`, `dispatching-parallel-agents`, `using-git-worktrees`, `resolving-merge-conflicts`, `playwright-cli`). Skills de segurança defensivas curadas (`frontend-security-coder`, `backend-security-coder`, `frontend-mobile-security-xss-scan`) também fazem parte do núcleo; famílias ofensivas, WSTG e recon não fazem parte da distribuição pública.

O carregamento é lazy: a descrição da skill decide se ela entra no contexto. Isso mantém o orçamento de contexto sob controle.
