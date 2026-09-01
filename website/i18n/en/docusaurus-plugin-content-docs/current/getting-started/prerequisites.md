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
- **Node.js 20+ and npm** for the harness scripts and the `omp:*`
  install commands.
- **PowerShell 5.1+** on Windows. The harness was designed and tested in this
  environment.

No database, container, or external service is required. The harness
operates as local configuration files and scripts under `~/.omp/agent`.

## Next step

Continue to [Installation](./installation) and install the harness.
