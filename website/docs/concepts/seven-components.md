---
sidebar_position: 2
---

# Os sete componentes

> **Estado PREVC:** os componentes existem para sustentar o ciclo `prepare → plan → execute → validate → judge → refine → confirm`; cada um possui fronteiras e limites explícitos de atuação.

O harness organiza suas capacidades em sete componentes essenciais. Eles não são produtos independentes, mas lentes arquiteturais para assegurar que o fluxo de engenharia esteja completo e protegido.

1. **Prompt / Contexto** — Regras do repositório, convenções em `agent-os/standards/` e a diretiva inegociável de operar sob PREVC.
2. **Tools** — Ferramentas com allowlists por agente; no Oh My Pi, agentes executores, revisores e orquestradores possuem permissões estritamente delimitadas.
3. **Context Management** — Carregamento cirúrgico de instruções e estado; integração com índice estático (Graphify) e segundo cérebro, evitando sobrecarga na janela de contexto.
4. **Verification** — Quality Gate medido com status tipados, cobertura de medição (`Measured: N/M`), regressões de evals mineradas do Git, contratos de segurança e verificações de entrega.
5. **Memory** — Controle de unidade ativa com `todo` (WIP=1), ledger de regras aprendidas (`agent-os/learned-rules.json`), histórico e handoffs duráveis (`session-handoff.md`).
6. **Sandboxes** — Ausência de sandbox de sistema operacional no host local. Políticas de software e restrições de permissão não substituem o isolamento de processos no SO.
7. **Hooks / Extensões** — Barramento de eventos nativo (`pi.on`) e extensões de auditoria; observam o ciclo de vida sem executar loops autônomos não supervisionados.

## O que cada componente protege

| Componente | Pergunta que responde | Limite e fronteira atual |
|---|---|---|
| **Prompt / Contexto** | Quais regras e convenções governam esta sessão? | Diretrizes textuais não substituem validações determinísticas de ferramentas. |
| **Tools** | Quais operações o agente está autorizado a executar? | Allowlists por papel; comandos de mutação sensíveis exigem aprovação humana. |
| **Context Management** | O que o agente precisa inspecionar para decidir com segurança? | O contexto deve ser relevante e delimitado por escopo; dumps globais dispersam a atenção. |
| **Verification** | Quais fatos comprovam que o resultado funciona? | Afirmações verbais do modelo são Rung 1; somente saídas capturadas e gates medidos constituem prova. |
| **Memory** | Como a próxima sessão retoma o trabalho sem amnésia? | Arquivos persistidos no repositório; estado mantido puramente em chat é volátil. |
| **Sandboxes** | O processo do agente está isolado do sistema operacional? | **Não.** Não há sandbox de SO no host; a segurança depende da aprovação humana no plano. |
| **Hooks / Extensões** | Como o ciclo de vida é integrado e auditado? | Extensões apenas observam e registram eventos; não iniciam ações autônomas fora do PREVC. |

## O que isto prova e o que não prova

### O que prova
- Que todas as dimensões da interação entre agente e código possuem salvaguardas explícitas.
- Que verificações e memórias dependem de arquivos versionáveis e comandos reais no terminal.

### O que NÃO prova
- A existência dos sete componentes não garante ausência de vulnerabilidades ou bugs caso os testes do projeto sejam incompletos.
- Não substitui a responsabilidade do operador em inspecionar comandos antes de autorizar a execução.

## Próximo passo

Veja como esses componentes são orquestrados sequencialmente em [PREVC](./prevc).
