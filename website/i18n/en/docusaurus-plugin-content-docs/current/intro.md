---
sidebar_position: 1
slug: intro
---

# Introduction

### Comparison: Traditional Chat vs. Harness Engineering

| AI chat without a harness | Engineering with a harness |
|---|---|
| Unbounded edits and unpredictable scope | Declared ownership and bounded edits |
| Broken builds reported as complete | Verification requires executable evidence |
| Test results asserted without a command | Terminal output records what actually ran |
| Session context disappears | Durable state and handoff preserve continuity |

### PREVC, OpenCode, and Oh My Pi

Harness Oh My Pi organizes agent work under a common PREVC contract. The
contract groups seven steps into four phases: Prepare (`prepare + plan`),
Execute (`execute`), Validate (`validate + judge`), and Confirm
(`refine + confirm`).

OpenCode is the methodological and continuity adapter in this design: it
organizes planning conventions, durable artifacts, and session handoffs. OMP
is the native engine that executes the same contract with its own runtime
primitives: `task`, `tasks[]`, `hub`, `todo`, and native extensions.

Sharding is conditional on the plan: use it only for independent lanes with
non-overlapping ownership. These primitives describe the execution mechanism;
this documentation does not turn them into a throughput or benchmark claim.


## The lifecycle

The seven contract steps are grouped into four phases. Grouping does not remove
steps; it gives each boundary a clear owner and expected evidence.

| Phase | Grouped steps | Expected result |
|---|---|---|
| **Prepare** | `prepare` + `plan` | Context, risk, scope, and a plan awaiting approval. |
| **Execute** | `execute` | Changes only within the approved scope. |
| **Validate** | `validate` + `judge` | Gates run and an independent Judge receipt. |
| **Confirm** | `refine` + `confirm` | A reviewed improvement proposal and explicit operator confirmation. |

The literal sequence remains:

```text
prepare → plan → execute → validate → judge → refine → confirm
```

- **prepare** — discovers context and classifies risk.
- **plan** — defines objective, scope, non-scope, and acceptance criteria.
- **execute** — executes only the approved scope, with WIP=1.
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

Reading the documentation does not require the runtime. To execute the
harness, install the Oh My Pi base and the public package in `~/.omp/agent`,
plus:

- Windows with PowerShell 5.1+
- Node.js 20+
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
