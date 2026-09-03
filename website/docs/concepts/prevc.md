---
sidebar_position: 3
---

# PREVC

PREVC é um contrato comum para trabalho significativo, independente do
runtime. Ele define as fronteiras de escopo, as transições permitidas, a
evidência exigida e a confirmação humana; nenhum agent pode substituir essas
decisões.

## Quatro fases e sete etapas

As sete etapas do contrato são agrupadas em quatro fases:

| Fase | Etapas | Limite principal |
|---|---|---|
| **Prepare** | `prepare` + `plan` | Descobrir contexto, classificar risco e obter aprovação do plano. |
| **Execute** | `execute` | Alterar somente os arquivos e objetivos aprovados. |
| **Validate** | `validate` + `judge` | Executar gates e receber um julgamento independente. |
| **Confirm** | `refine` + `confirm` | Avaliar a proposta de melhoria e confirmar como operador. |

O agrupamento organiza a responsabilidade de cada fronteira; a sequência
literal continua sendo `prepare → plan → execute → validate → judge → refine →
confirm`.

## Limites por fase

1. **Prepare:** o agent inspeciona o repositório, mede o risco e propõe uma
   especificação clara.
2. **Execute:** com o plano aprovado, implementa sob WIP=1 e dentro do
   ownership declarado.
3. **Validate:** executa verificações reais e submete o resultado ao Judge
   read-only.
4. **Confirm:** o operador revisa a evidência e autoriza a conclusão.

## Fluxo visual do ciclo de vida

```text
┌─────────────────┐
│     PREPARE     │  → Descoberta de contexto, análise de risco e plano em agent-os/specs/
└────────┬────────┘
         │ [Aprovação obrigatória do operador humano]
         ▼
┌─────────────────┐
│     EXECUTE     │  → Implementação estrita (WIP=1) nos arquivos de ownership declarado
└────────┬────────┘
         │ [Código finalizado]
         ▼
┌─────────────────┐
│    VALIDATE     │  → Gates de qualidade, testes reais e avaliação do Judge (read-only)
└────────┬────────┘
         │ [Evidências coletadas e handoff pronto]
         ▼
┌─────────────────┐
│     CONFIRM     │  → Revisão final do operador, refine e conclusão durável
└─────────────────┘
```

## PREVC no OpenCode e no Oh My Pi

O OpenCode funciona aqui como adaptador metodológico e de continuidade:
organiza convenções de planejamento, artefatos duráveis e handoffs. O Oh My Pi
é o motor nativo: executa o mesmo contrato com as primitivas do runtime.

No OMP, o `scheduler` usa `task` para despachar lanes independentes em uma
onda `tasks[]`; `hub` coordena mensagens entre agents; `todo` mantém WIP=1 na
sessão; e `test-runner` pode shardear suítes quando o plano autoriza e os
arquivos de teste são disjuntos. Extensões nativas observam eventos do runtime,
mas não transicionam PREVC nem confirmam trabalho.

Essas são capacidades de execução, não evidência de velocidade. Use dispatch
somente quando as lanes tiverem ownership disjunto e dependências explícitas.

## Estado durável

### Prepare

Leia o pedido, as regras do projeto, o estado durável e o handoff anterior. Defina objetivo, escopo, não-escopo, critérios de aceite, risco, dependências e o comando de verificação. O plano fica aguardando aprovação quando a tarefa exige decisão do operador.

### Execute

Faça somente o trabalho aprovado. O scheduler pode distribuir unidades independentes, cada uma com dono, dependências e arquivos declarados. WIP=1 mantém uma unidade ativa por vez, mesmo quando há fan-out entre lanes.

### Validate

Colete provas que outra pessoa possa repetir: saída de comandos, critérios de aceite observáveis, estado atualizado e, quando aplicável, gate e revisão independente. Falha ou evidência ausente bloqueia o caminho; não é um sinal verde implícito.

### Confirm

No OMP, inicie o PREVC com a descrição da tarefa:

```text
/prevc prepare Adicionar endpoint de health check
```

`/prevc prepare` faz parte do pacote público instalado em
`~/.omp/agent/commands/`. Ele executa a descoberta, classifica o risco e
inicia o planejamento via `planner`, parando em
`awaiting_plan_approval`.

Nada é editado antes da aprovação explícita; reconhecimento read-only é sempre
permitido. A exceção de escrita pré-aprovação é o próprio pipeline de
planejamento: o `planner` pode criar os artefatos canônicos em
`agent-os/specs/<slug>/` (spec.md, plan.md, verification.md, decisions.md,
tickets/, research.md, prototype/).

Depois que você aprovar o plano, em linguagem natural ou com:

```text
/prevc run
```

o OMP executa dentro do escopo aprovado. O scheduler usa `task`, `tasks[]` e
`hub` para o dispatch nativo, valida o resultado, entrega o handoff e para em
`awaiting_confirmation` para a confirmação do operador.

Uma instrução para executar um plano ou spec **nomeado** de ponta a ponta já é
a autorização do run autônomo: não há aprovação por task; o run para uma única
vez em `awaiting_confirmation` para o spec inteiro.

- Execute apenas o escopo aprovado.
- Mantenha WIP=1 por unidade ativa.
- Trate trabalho adjacente como `not_started`.
- Valide com evidência real e atual.
- Não confirme sem revisão do operador e handoff.

## Próximo passo

Veja [WIP=1](./wip-one) para a disciplina de foco ou [Evidência e Handoff](./evidence-and-handoff) para o formato das provas.
