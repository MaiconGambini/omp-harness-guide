---
sidebar_position: 4
---

# Repository Structure

Organization of the harness installation under `~/.omp/agent` and of the
artifacts it manages in a project.

## Public repository (`omp-harness-guide`)

```text
omp-harness-guide/
|-- README.md                     Bilingual overview and install link
|-- omp/
|   `-- agent/                    Distributable OMP core
|       |-- agents/               Source-agent profiles
|       |-- commands/             Global commands
|       |-- extensions/           Native extension
|       |-- scripts/              Node utilities
|       |-- skills/               General and defensive skills
|       |-- docs/                 Global context
|       |-- config.yml            Public configuration
|       `-- omp-port-manifest.json Package inventory and hashes
|-- website/                      Docusaurus documentation site
|   |-- docs/                     Default pt-BR source
|   |-- i18n/en/...               English translation
|   |-- src/                      Homepage and theme
|   |-- static/                   Images and favicon
|   |-- docusaurus.config.ts      Site configuration
|   |-- sidebars.ts               Navigation
|   `-- package.json              Site dependencies
|-- scripts/
|   |-- harness-manifest.json     Public allowlist manifest
|   `-- validate-public-subset.mjs Public-subset validator
`-- .github/workflows/            CI validation and Pages deployment
```

The repository contains documentation, the curated OMP core, and public
validation. The package does not include runtime state or evidence.

## Global install (`~/.omp/agent`)

```text
~/.omp/agent/
|-- config.yml           Public agent configuration
|-- extensions/          Native runtime extension
|   `-- harness-omp-trace.ts     OMP native event-to-trace adapter (pi.on)
|-- scripts/             Node utilities (26)
|-- commands/            Global commands (/prevc, /planner, /quality, ...)
|-- skills/              General and defensive skills (107)
|-- agents/              Source-agent definitions (23)
|-- docs/                Global harness context (`docs/context.md`)
`-- omp-port-manifest.json Package inventory and hashes
```

This tree is copied from `omp/agent/` and checked against
`omp-port-manifest.json`. Runtime directories such as sessions, caches, and
local databases may exist beside it, but are not part of the public package.

## Project artifacts

```text
<project>/
|-- AGENTS.md                   Project rules, entry points
|-- feature_list.json           WIP=1 source of truth
|-- .specs/
|   `-- project/STATE.md        Durable progress, blockers, decisions
|-- agent-os/
|   |-- quality-thresholds.json Metrics, risk routing, governing keys
|   |-- learned-rules.json      Project-local rules ledger
|   |-- standards/              Project standards (loaded before global)
|   |-- judges/                 Judge definitions (e.g. project-judge.md)
|   `-- specs/                  Specs: <slug>/spec.md, plan.md, verification.md,
|                               decisions.md, tickets/, research.md, prototype/
`-- docs/harness/
    |-- state/                    Durable PREVC lifecycle phase
    |-- progress.md               Progress and blockers
    |-- session-handoff.md        Transfer between sessions
    |-- sprint-contract.md        Scope and acceptance criteria
    |-- findings/                 Typed findings (append-only)
    |-- judge/                    Judge receipts
    |-- quality/                  Gate reports and derived surfaces
    `-- traces/                   Redacted runtime trace envelope
```

## What Oh My Pi loads

Oh My Pi reads `~/.omp/agent` at startup. It registers:

- Global commands in `commands/` (slashes like `/prevc`).
- Skills in `skills/` (any `SKILL.md` inside a subdirectory, loaded lazily).
- Extensions in `extensions/` (files registered in `config.yml`, like the
  trace adapter `harness-omp-trace.ts`).
- Agents in `agents/` (specialized subagent definitions).

**What is NOT loaded**

- `scripts/` — utilities run manually (or by commands).
- `backups/` — restore material only.
- The Docusaurus site and the public validator — isolated with their own
  dependencies.

When the harness package is installed in a project, the v1 artifacts live in
that repository: `agent-os/quality-thresholds.json`,
`agent-os/learned-rules.json`, `agent-os/standards/`, and
`docs/harness/`. The ledger does not automatically promote rules across
projects.

## Note on the public distribution

This public distribution excludes offensive, recon, exploitation, pentest,
attack-chain, and WSTG skill families, as well as local runtime evidence. The
exclusions are declared in the harness manifest and machine-checked: the
validator refuses a public tree that violates them, and the CI workflow blocks
publication when they appear. The curated defensive skills that ship in the
core remain.
