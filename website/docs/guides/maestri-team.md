---
sidebar_position: 5
---

# Equipe no Maestri

O guia de equipe no Maestri descreve como provisionar e orquestrar um time persistente de dez papéis especializados no canvas do Maestri via `/maestri-team`, estabelecendo colaboração multiagente contínua com fronteiras explícitas de permissão.

![Início de sessão e orquestração](/omp-harness-guide/img/diagrams/inicio-de-sessao.png)
*Início de sessão: detecção automática de perfil, ativação de contexto e coordenação no canvas.*

## Por que uma equipe persistente

Enquanto as chamadas nativas `tasks[]` criam subagentes efêmeros que desaparecem ao final da tarefa, a equipe no Maestri opera em terminais dedicados e persistentes. Isso traz três vantagens operacionais:

1. **Separação de permissões:** papéis somente de leitura (como revisores e analistas) são lançados com flags estritas (`--tools=read,grep,glob`), impedindo modificações acidentais no código.
2. **Diversidade de modelos:** o revisor de código pode rodar em uma família de modelo diferente da do implementador, reduzindo vieses cognitivos da mesma linhagem.
3. **Isolamento de contexto:** cada especialista preserva seu foco de raciocínio, sem que o transcript de implementação contamine a análise de arquitetura ou segurança.

## Os dez papéis da equipe

A equipe provisionada é composta por dez perfis padronizados:

| # | Papel no Maestri | Especialidade | Permissão de escrita |
|---|---|---|---|
| 1 | Maestro / OMP Orchestrator | Orquestração central e condução do PREVC | Sessão principal |
| 2 | OMP Explorer | Mapeamento e reconhecimento da base de código | Somente leitura |
| 3 | OMP Architecture Advisor | Fronteiras modulares e design de contratos | Somente leitura |
| 4 | OMP Implementer | Implementação de código e refatoração TDD | Escrita (lane declarada) |
| 5 | OMP Backend Infra Engineer (ou Vue Engineer) | Infraestrutura, contêineres, CI ou frontend | Escrita (lane declarada) |
| 6 | OMP Test Automation Engineer | Implementação e execução de suítes de teste | Escrita (testes) |
| 7 | OMP Code Reviewer | Auditoria de estilo, segurança e conformidade | Somente leitura |
| 8 | OMP Security Analyst | Identificação de riscos de segurança e auth | Somente leitura |
| 9 | OMP Refiner | Refinamento de regras e lições aprendidas | Somente leitura |
| 10 | OMP Judge | Emissão de recibos formais de veredito do gate | Somente leitura |

## Consentimento e ciclo de vida

Recrutar agentes adicionais consome sessões ativas de provedores. Por isso, a criação de terminais exige consentimento explícito do operador:

- **Modo preview (`--dry-run`):** executa apenas a descoberta e exibe o relatório de agentes existentes e ausentes, sem recrutar nenhum terminal.
- **Modo efetivo (`--apply`):** executado somente após invocação direta do comando pelo operador no chat do Maestro.
- **Idempotência:** invocações repetidas detectam terminais já conectados no workspace e reutilizam as instâncias existentes, recrutando apenas os papéis faltantes.

```bash
# Inspeção não-mutatória (preview)
node ~/.omp/agent/scripts/harness-maestri-team.mjs --dry-run --root <projeto> --json

# Recrutamento com consentimento explícito
node ~/.omp/agent/scripts/harness-maestri-team.mjs --apply --root <projeto> --json
```

## O bloco `onboarding`

Ao rodar `harness-maestri-team.mjs`, o JSON de retorno inclui a estrutura completa do time e a seção `onboarding` derivada da inspeção real do repositório:

```json
{
  "status": "ok",
  "mode": "dry-run",
  "root": "<projeto>",
  "specialist": "backend-infra",
  "team_size": 10,
  "maestro": "omp #2",
  "reused": [
    {
      "name": "Casco",
      "role": "OMP Implementer"
    },
    "..."
  ],
  "missing": [
    "OMP Explorer",
    "OMP Architecture Advisor",
    "..."
  ],
  "onboarding": {
    "harness": {
      "agentOs": true,
      "qualityThresholds": true,
      "prevcAutonomy": true,
      "autoConfirm": false,
      "projectProfile": true,
      "fixLoopMaxAttempts": 3
    },
    "docs": {
      "review": true,
      "pullRequestTemplate": true,
      "agentsMd": true
    },
    "registered": true,
    "missing": [],
    "advice": [
      "rode cerebro-carga-inicial se o cérebro estiver desatualizado"
    ]
  },
  "summary": "Dry run: 1 Maestro, 1 reused role(s), 8 role(s) to recruit."
}
```

O bloco `onboarding` inspeciona a prontidão da base de código em chaves estruturadas:

- **`harness`:** avalia a presença da pasta `agent-os/`, das chaves de qualidade (`qualityThresholds`), das regras de autonomia (`prevcAutonomy`), se a autoconfirmação está desativada (`autoConfirm: false`), da presença do perfil (`projectProfile`) e do limite de retentativas automáticas (`fixLoopMaxAttempts`).
- **`docs`:** checa a presença das regras de code review por área (`review`), do template de entrega (`pullRequestTemplate`) e das instruções raiz (`agentsMd`).
- **`registered`:** indica se o repositório está registrado no arquivo de projetos local do pipeline.
- **`missing` e `advice`:** lista cada componente ausente e emite recomendações acionáveis (por exemplo, orientando rodar `harness-initializer` e depois `harness-bootstrap` quando faltar o harness, ou rodar `novo-projeto` e `cerebro-carga-inicial` se o repositório ainda não estiver registrado).
## Reinício de contexto (`--reset`)

Quando uma nova tarefa ou sprint começa e os agentes acumularem transcripts longos, utilize a flag `--reset`:

```bash
node ~/.omp/agent/scripts/harness-maestri-team.mjs --apply --root <projeto> --reset --json
```

- Envia o comando `/new` diretamente para a entrada de cada terminal reutilizado via CLI do Maestri.
- Limpa a memória de trabalho de cada agente sem matar os processos do sistema operacional.
- Preserva intactas as restrições de permissão de ferramentas (`--tools=read,grep,glob`).
- O terminal do Maestro nunca é resetado e mantém a continuidade da conversa principal.

## O que isto prova e o que não prova

- **O que prova:** o provisionamento comprova que dez terminais com perfis distintos foram registrados no workspace e que os subagentes somente de leitura possuem ferramentas restritas via argumentos de lançamento.
- **O que NÃO prova:** terminais reutilizados criados anteriormente sem a flag `--tools` não podem ter suas restrições atestadas pelo Maestri. A postura segura exige que terminais reutilizados tenham sido provisionados originalmente pelo próprio script de equipe.

## Páginas relacionadas

- [Dispatch Paralelo](./parallel-dispatch.md) — Execução de lanes concorrentes coordenadas pelo scheduler.
- [Novo Projeto](./new-project.md) — Fluxo completo de inicialização de repositórios.
- [Comandos](../reference/commands.md) — Referência de sintaxe do comando `/maestri-team`.
