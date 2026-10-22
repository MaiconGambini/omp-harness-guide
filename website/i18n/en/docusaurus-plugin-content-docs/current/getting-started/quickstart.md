---
sidebar_position: 1
---

# Quickstart

This path takes you from a clean project to your first goal in Harness Oh My
Pi. For the complete installation, including backup, obtaining, and validating
the package, see [Installation](./installation).

## Step 1: Install the harness package

After obtaining and reviewing the repository checkout, copy the harness distribution tree into the Oh My Pi agent directory (`~/.omp/agent`):

```powershell
$target = Join-Path $env:USERPROFILE ".omp\agent"
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -Path ".\omp\agent\*" -Destination $target -Recurse -Force
```

Close and reopen Oh My Pi so that the new commands, agents, and native extensions load at startup.

## Step 2: Start the first task with PREVC

In the Oh My Pi terminal, inside your project directory, run the task preparation command:

```text
/prevc prepare "Create POST /auth/login route with JWT"
```

The harness classifies the task risk, discovers the repository's technical context, and starts the controlled phase transition.

## Step 3: Observe the complete native-engine flow

OMP executes PREVC's seven steps in four phases. Grouping defines the boundaries; it does not remove any step:

1. **Prepare (`prepare + plan`):** The harness discovers context, classifies risk, defines ownership (`src/auth.py`, `tests/test_auth.py`), and waits for plan approval.
2. **Execute (`execute`):** After approval, the scheduler uses `task` and one `tasks[]` call when independent lanes exist; `hub` coordinates messages between agents.
3. **Validate (`validate + judge`):** The runtime runs verification commands and a read-only Judge compares the result with the contract. Output must be captured in the terminal; this guide does not provide results from a real execution.
4. **Confirm (`refine + confirm`):** Refine proposes improvements without writing or voting, and the operator reviews the evidence before confirming the handoff. Human confirmation is the default rule; the auto-confirm mechanism remains disabled until explicitly opted in with strict evidence criteria.

## What this proves and what it does not

- **What it proves:** that the runtime package was copied to `~/.omp/agent`, that Oh My Pi recognizes the native commands, and that the PREVC lifecycle transitions between phases following the durable on-disk contract.
- **What it does not prove:** it does not prove application code correctness, does not guarantee business test coverage, and does not replace human validation of changes.

## Next steps

- Review environment [Prerequisites](./prerequisites).
- Follow the complete step-by-step [Installation](./installation).
- Run your [First Session](./first-session) with project profiling and durable context.
