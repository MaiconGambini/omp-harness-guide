---
sidebar_position: 1
---

# Quickstart

This path takes you from a clean project to your first goal in Harness Oh My
Pi. OMP combines the PREVC lifecycle with native execution of up to 32
subagents, parallel fan-out, and test sharding. For the complete installation,
including backup, obtaining, and validating the package, see
[Installation](./installation).

1. **Install the core in a clean directory.** After obtaining and reviewing the
   repository checkout, run the same copy-pasteable block from the
   [installation guide](./installation):

   ```powershell
   $target = Join-Path $env:USERPROFILE ".omp\agent"
   New-Item -ItemType Directory -Force $target | Out-Null
   Copy-Item -Path ".\omp\agent\*" -Destination $target -Recurse -Force
   ```

2. **Prepare a goal in the project.** Inside Oh My Pi, run exactly:

   ```text
   /prevc prepare "Criar rota POST /auth/login com JWT"
   ```

3. **Observe the cycle before executing.** PREVC presents the plan for explicit
   approval. After approval, OMP dispatches independent lanes and test shards
   in parallel when the plan allows, runs validation, and gathers test
   evidence. The Judge compares the result with the acceptance criteria, and
   the handoff records what was verified, which files changed, blockers, and
   the next action for continuity between sessions. See [First Session](./first-session)
   for the complete operational flow.
