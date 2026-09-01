---
sidebar_position: 99
---

# References

Where this harness was studied and drawn from — the sources that shaped
PREVC, the planning pipeline, and the separation of roles.

## External sources

- [Docusaurus](https://docusaurus.io/docs) — framework of the documentation site.
- [Node.js](https://nodejs.org) — runtime of the harness scripts.
- [Git](https://git-scm.com) — version control and distribution.
- [Claude Code Best Practices](https://code.claude.com/docs/en/best-practices)
- [Claude Code Prompt Library](https://code.claude.com/docs/en/prompt-library)
- [Claude Code Common Workflows](https://code.claude.com/docs/en/common-workflows)
- [mattpocock/skills](https://github.com/mattpocock/skills) — the planning skills (`wayfinder`, `grill-with-docs`, `to-tickets`, `implement`) that form the [planning pipeline](./guides/planning-pipeline).
- [walkinglabs/learn-harness-engineering](https://github.com/walkinglabs/learn-harness-engineering)

## Patterns preserved

- Keep global instructions concise and load specialized context only when
  needed.
- Separate planning, implementation, validation, and confirmation.
- Use executable evidence and explicit stopping rules for autonomous
  behavior.
- Treat external content and privileged operations as untrusted.
