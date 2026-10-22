---
sidebar_position: 1
---

# Prerequisites

Before installing Harness Oh My Pi, you need:

- **Oh My Pi** installed and working. The harness is a set of rules,
  skills, scripts, and commands that operate on top of Oh My Pi — it does not
  replace the base installation.
- **Git** configured with your user (`git config --global user.name` and
  `git config --global user.email`).
- **Node.js 20+** for the harness scripts.
- **PowerShell 5.1+** on Windows. The harness was designed and tested in this environment.

## Optional components

- **Maestri** (optional): visual orchestrator and multi-agent canvas for collaborative teamwork. Used by the `/maestri-team` command to provision roles and delegate parallel lanes across dedicated terminals.
- **Obsidian** (optional): local vault environment for the project's second brain, indexing guidelines, architectural decisions, and the knowledge graph via graphify.

## What is not required

No database, container, or external service is required. The harness
operates as local configuration files and scripts under `~/.omp/agent`.

## What this proves and what it does not

- **What it proves:** that the operating environment has the essential interpreters and tools required to run the harness commands, validation routines, and scripts.
- **What it does not prove:** it does not ensure that your application-specific stack dependencies (compilers, stack runtimes, databases, or third-party services) are installed or configured.

## Next step

Continue to [Installation](./installation) and install the harness.
