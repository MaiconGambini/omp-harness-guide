---
sidebar_position: 99
---

# Referências

Fontes de estudo, pesquisas e fundamentos técnicos que moldaram o PREVC, o pipeline de planejamento, o Quality Gate e a arquitetura de code review do harness.

## Fontes primárias de engenharia

- [How the Claude Code team does code review (Anthropic, out 2026)](https://claude.dev/blog/solving-code-review-at-anthropic/) — Artigo seminal sobre revisão contínua com agentes de IA, estruturação em sete camadas de verificação, contratos de revisão por área (`REVIEW.md`), templates de PR com reversão, orçamentos de ciclos de convergência e métricas de fluxo contra reversões reais.
- [Claude Code Best Practices](https://code.claude.com/docs/en/best-practices) — Diretrizes para orquestração de ferramentas, instruções concisas e gerenciamento de contexto.
- [Claude Code Prompt Library](https://code.claude.com/docs/en/prompt-library) — Padrões de prompt e decomposição de tarefas técnicas.
- [Claude Code Common Workflows](https://code.claude.com/docs/en/common-workflows) — Fluxos de depuração sistemática e inspeção antes de mutações de código.

## Ferramentas e ecossistema

- [mattpocock/skills](https://github.com/mattpocock/skills) — Skills de planejamento estruturado (`wayfinder`, `grill-with-docs`, `to-tickets`, `implement`) que fundamentam o pipeline de planos do harness.
- [Docusaurus](https://docusaurus.io/docs) — Framework estático com suporte a internacionalização que alimenta o site de documentação.
- [Node.js](https://nodejs.org) — Runtime dos scripts de governança, adapters do Quality Gate e validadores de integridade.
- [Git](https://git-scm.com) — Sistema de registro imutável utilizado para ancorar evidências de teste, relatórios e métricas de fluxo.
- [Graphify](https://github.com/walkinglabs/learn-harness-engineering) — Indexação estática estrutural de repositórios para alimentação de contexto sem custos de memória dinâmica.

## Padrões arquiteturais preservados

- **Instruções globais enxutas:** Carregamento de diretrizes especializadas apenas quando o domínio ou a posse de arquivos exigir.
- **Separação estrita de fases:** Planejamento (`Prepare`), implementação (`Execute`), medição (`Validate`) e confirmação (`Confirm`) em agentes e momentos distintos.
- **Diversidade de modelos em revisões:** Utilização de famílias de modelo concorrentes para quebrar pontos cegos e correlações de erro entre implementação e revisão.
- **Evidência executável:** Rejeição de afirmações puramente textuais; conclusão condicionada a saídas capturadas e hashes verificáveis.
- **Fail-closed:** Tratamento de scanners indisponíveis ou dependências com falha como bloqueios estritos, impedindo falsos positivos em validações de qualidade e segurança.
