---
sidebar_position: 4
---

# Repository Structure

Organization of the harness installation under `~/.omp/agent` and of the
artifacts it manages in a project.

## Public documentation repository (`omp-harness-guide`)

```text
omp-harness-guide/
|-- README.md                     Bilingual overview and install link
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

The repository contains only public documentation and validation. It does not
distribute the harness itself or any runtime evidence.

## Global install (`~/.omp/agent`)

```text
~/.omp/agent/
|-- config.yml           Global configuration
|-- extensions/          Runtime extensions
|   |-- harness-omp-trace.ts     OMP native event-to-trace adapter (pi.on)
|   `-- harness-security-guard.ts  Dangerous-command guard
|-- scripts/             Node utilities (harness-*.mjs)
|-- commands/            Global commands (/prevc, /planner, /quality, ...)
|-- skills/              Skills loaded lazily by Oh My Pi
|-- agents/              Specialized subagent definitions (24)
|-- docs/                Global harness context (generated, not hand-edited)
|-- tests/               Harness tests
`-- backups/             Byte-exact backups created by omp:migrate
```

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

## What is NOT loaded

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

This public distribution **does not include** offensive security skills
(recon, redteam, and standalone attack skill families), nor local runtime
evidence (gate reports, review notes, traces, findings, or lifecycle
state). The exclusions are
declared in the harness manifest and machine-checked: the validator refuses
to produce a package that violates them, and the CI workflow blocks a public
mirror that contains them. Legitimate curated security skills
(`skills/wstg-*` and the defensive `*-security-coder`) remain.
