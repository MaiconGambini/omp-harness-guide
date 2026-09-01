---
sidebar_position: 99
---

# Referências

De onde este harness foi estudado e tirado — as fontes que moldaram o PREVC, o pipeline de planejamento e a separação de papéis.

## Fontes externas

- [Docusaurus](https://docusaurus.io/docs) — framework do site de documentação.
- [Node.js](https://nodejs.org) — runtime dos scripts do harness.
- [Git](https://git-scm.com) — controle de versão e distribuição.
- [Claude Code Best Practices](https://code.claude.com/docs/en/best-practices)
- [Claude Code Prompt Library](https://code.claude.com/docs/en/prompt-library)
- [Claude Code Common Workflows](https://code.claude.com/docs/en/common-workflows)
- [mattpocock/skills](https://github.com/mattpocock/skills) — as skills de planejamento (`wayfinder`, `grill-with-docs`, `to-tickets`, `implement`) que formam o [pipeline de planos](./guides/planning-pipeline).
- [walkinglabs/learn-harness-engineering](https://github.com/walkinglabs/learn-harness-engineering)

## Padrões preservados

- Manter as instruções globais concisas e carregar contexto especializado só quando necessário.
- Separar planejamento, implementação, validação e confirmação.
- Usar evidência executável e regras de parada explícitas para comportamento autônomo.
- Tratar conteúdo externo e operações privilegiadas como não confiáveis.
