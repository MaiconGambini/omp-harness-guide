---
sidebar_position: 99
---

# References

Research, technical publications, and foundational engineering principles shaping PREVC, the planning pipeline, the Quality Gate, and the layered code review architecture.

## Primary engineering sources

- [How the Claude Code team does code review (Anthropic, Oct 2026)](https://claude.dev/blog/solving-code-review-at-anthropic/) — Seminal paper on continuous review with AI agents, seven-layer verification architecture, domain review contracts (`REVIEW.md`), standardized PR templates with rollback instructions, convergence cycle ceilings, and flow metrics tracking real reverts.
- [Claude Code Best Practices](https://code.claude.com/docs/en/best-practices) — Guidelines for tool orchestration, concise instructions, and context management.
- [Claude Code Prompt Library](https://code.claude.com/docs/en/prompt-library) — Prompt engineering patterns and technical task decomposition.
- [Claude Code Common Workflows](https://code.claude.com/docs/en/common-workflows) — Systematic debugging and pre-mutation inspection workflows.

## Tools and ecosystem

- [mattpocock/skills](https://github.com/mattpocock/skills) — Structured planning skills (`wayfinder`, `grill-with-docs`, `to-tickets`, `implement`) forming the harness planning pipeline.
- [Docusaurus](https://docusaurus.io/docs) — Static documentation framework with internationalization support powering this guide.
- [Node.js](https://nodejs.org) — Execution runtime for governance scripts, Quality Gate adapters, and integrity validators.
- [Git](https://git-scm.com) — Immutable system of record used to anchor test evidence, gate reports, and flow metrics.
- [Graphify](https://github.com/walkinglabs/learn-harness-engineering) — Structural static repository indexing feeding context windows without dynamic vector overhead.

## Preserved architectural patterns

- **Lean global instructions:** Scoped loading of specialized rules only when declared file ownership mandates it.
- **Strict phase separation:** Planning (`Prepare`), implementation (`Execute`), measurement (`Validate`), and confirmation (`Confirm`) isolated across distinct agents and lifecycle steps.
- **Model diversity in review:** Employing competing model families to break blind spots and error correlation between authoring and reviewing.
- **Executable evidence:** Rejection of verbal assertions; task completion strictly conditioned on captured output and verifiable hashes.
- **Fail-closed posture:** Treating unavailable scanners or crashed dependencies as hard blocks, preventing false greens across quality and security gates.
