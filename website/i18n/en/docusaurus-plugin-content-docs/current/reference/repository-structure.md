---
sidebar_position: 4
---

# Repository Structure

Three architectural layers comprise the Oh My Pi harness distribution: the **public documentation repository**, the **managed user installation** at `~/.omp/agent`, and the **operational repository layout** inside a target project.

## Public repository (`omp-harness-guide`)

```text
omp-harness-guide/
|-- README.md                     Bilingual overview and installation instructions
|-- omp/
|   `-- agent/                    Core distributable Oh My Pi package
|       |-- agents/               Specialized subagent profiles (25)
|       |-- commands/             Global slash commands (21)
|       |-- extensions/           Native extension hooks (2)
|       |-- scripts/              Portable Node gate and tooling utilities (55)
|       |-- skills/               Engineering, lifecycle, and defensive skills (110)
|       |-- docs/                 Global context definitions (context.md)
|       |-- config.yml            Public runtime configuration
|       `-- omp-port-manifest.json SHA-256 integrity manifest
|-- website/                      Docusaurus documentation site
|   |-- docs/                     Brazilian Portuguese documentation source (default)
|   |-- i18n/en/...               Complete English translation mirror
|   |-- src/                      Pages and theme overrides
|   |-- static/                   Diagrams, images, and static assets
|   |-- docusaurus.config.ts      Site configuration
|   |-- sidebars.ts               Sidebar navigation tree
|   `-- package.json              Site dependencies and scripts
|-- scripts/
|   |-- harness-manifest.json     Policy allowlist and denylist definition
|   `-- validate-public-subset.mjs Automated public repository integrity scanner
`-- .github/workflows/            CI validation and GitHub Pages deployment pipelines
```

The public repository consolidates technical documentation, the verified distributable package, and automated distribution gates. No credentials, tokens, or private runtime evidence are published.

## Managed installation (`~/.omp/agent`)

The runtime environment installed on the operator machine mirrors the distributable package:

```text
~/.omp/agent/
|-- config.yml              Public agent configuration and model role mapping
|-- commands/               Slash commands (21 files)
|-- agents/                 Subagent role profiles (25 files)
|-- scripts/                Audit, metric, and gate scripts (55 files)
|-- extensions/             Native telemetry extensions (2 files)
|-- skills/                 On-demand lazy-loaded skills (110 skill folders)
|-- docs/                   Global operational context (docs/context.md)
`-- omp-port-manifest.json  Integrity manifest (299 indexed files)
```

This tree is verified against `omp-port-manifest.json`. Runtime state directories (such as session caches and local databases) remain isolated outside the distribution manifest.

## Project harness layout

When adopting the harness, a project repository incorporates the following standard layout:

```text
<project>/
|-- AGENTS.md                     Project instructions, conventions, and entry points
|-- feature_list.json             Source of truth for WIP=1 task execution
|-- .github/
|   `-- pull_request_template.md  PR template with Risk Tier, Testing, Rollback, Owner
|-- agent-os/
|   |-- project-profile.json      Detected profile: stack, test commands, fixLoop policy
|   |-- prevc-autonomy.json       autoConfirm settings and autonomy criteria
|   |-- quality-thresholds.json   Quality metric keys and risk router policies
|   |-- learned-rules.json        Active ledger of learned operational rules
|   |-- security-contract.json    Authorization controls declaration
|   |-- standards/                Project-specific coding guidelines and standards
|   `-- specs/<slug>/             Specifications, implementation plans, and tickets
`-- docs/
    |-- review.md                 Code review standards, critical failures, escaped defect log
    `-- harness/
        |-- progress.md           Durable progress tracking and blocker log
        |-- session-handoff.md    Formal inter-session handoff record
        |-- sprint-contract.md    Scope boundaries and acceptance criteria
        `-- (audit records, Judge receipts, and gate evaluation reports)
```

## Runtime loading behavior in Oh My Pi

During startup, the Oh My Pi runtime discovers components under `~/.omp/agent`:

- **Commands (`commands/`):** slash-prefixed user actions (such as `/prevc` and `/maestri-team`).
- **Skills (`skills/`):** procedure guidelines in `SKILL.md` loaded lazily based on task description matching.
- **Extensions (`extensions/`):** telemetry event hooks registered via `config.yml`.
- **Agents (`agents/`):** constrained subagent profiles dispatched via `task` invocations.
- **Model roles (`config.yml`):** mapping providers and models across scheduler, review, implementation, and refinement roles.

## What this proves and what it does not prove

- **What it proves:** tree compliance confirms that all files required for PREVC execution are installed in canonical paths and match manifest checksums.
- **What it DOES NOT prove:** file presence alone does not establish code quality or functional correctness. Software reliability depends on test suites, code review, and measured gate evaluations.

## Related documentation

- [Commands](./commands.md) — Available commands and invocation parameters.
- [Artifacts](./artifacts.md) — Durable schemas and artifact responsibilities.
- [Existing Project](../guides/existing-project.md) — Step-by-step onboarding into existing codebases.
