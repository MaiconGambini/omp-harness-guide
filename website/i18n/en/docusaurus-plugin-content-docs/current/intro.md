---
sidebar_position: 1
slug: intro
---

# Introduction

Harness Oh My Pi turns Oh My Pi from an agent that "rediscovers everything
each session" into an agent that keeps state, respects WIP=1, produces
evidence, and hands off cleanly between sessions.

The harness is a port of the OpenCode harness onto Oh My Pi native
primitives: parallel dispatch with `task` in one `tasks[]` wave, `hub`
coordination, the `todo` tool (WIP=1), and the extension event bus (`pi.on`).
The **PREVC** lifecycle remains the same runtime-neutral contract; what
changes is the adapter.

## The lifecycle

Significant work passes through a fixed sequence of phases, each with the
evidence it must produce before advancing:

```text
prepare → plan → execute → validate → judge → refine → confirm
```

- **prepare** — discovers context and classifies risk.
- **plan** — defines objective, scope, non-scope, and acceptance criteria.
- **execute** — executes only the approved scope, WIP=1.
- **validate** — measures the result with gates and real evidence.
- **judge** — a read-only evaluator compares the work with the contract.
- **refine** — a read-only refiner proposes improvements; it does not write
  or vote.
- **confirm** — the operator reviews the evidence and confirms; no agent
  self-confirms.

## What you'll find

| Section | What it covers |
|---|---|
| **[Getting Started](./getting-started/installation)** | Step-by-step installation and first session. |
| **[Concepts](./concepts/why-a-harness)** | PREVC, WIP=1, evidence, the seven components, and the limits of automation. |
| **[Guides](./guides/small-task)** | End-to-end flows for small tasks, complex features, and parallel dispatch. |
| **[Reference](./reference/commands)** | Commands, skills and agents, artifacts, and repository structure. |
| **[Adoption](./adoption/use-cases)** | Use cases, pros and cons, security, and limitations. |
| **[FAQ](./troubleshooting/faq)** | Common problems and solutions. |

## Prerequisites

- Windows with PowerShell 5.1+
- Oh My Pi installed
- Node.js 20+ and npm
- Git

## Quick install

> **Clean install:** if `~/.omp/agent` already exists with your own files,
> back it up before installing — there is no automatic merge. The
> [full installation guide](./getting-started/installation) shows the exact
> command.

The real Harness Oh My Pi distribution is under `omp/agent/`. It contains the
agents, commands, scripts, extension, configuration, and general skills that
Oh My Pi loads directly. The public package excludes local runtime state,
evidence, recon, exploitation, WSTG, and offensive playbooks.

After reviewing `omp/agent/omp-port-manifest.json`, install it into a clean
directory:

```powershell
$target = Join-Path $env:USERPROFILE ".omp\agent"
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -Path "omp/agent/*" -Destination $target -Recurse -Force
```

`website/` is the documentation site only; its dependencies are not part of
the OMP runtime.

[Full installation guide &rarr;](./getting-started/installation)

## The principle

The Harness does not try to replace the operator. It makes clear what was
requested, what was approved, what was executed, what was verified, and what
the next safe action is. Everything else in this documentation is a detail of
that principle.
