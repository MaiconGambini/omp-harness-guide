---
sidebar_position: 1
slug: intro
---

# Introduction to Oh My Pi Harness

The introduction to the Oh My Pi Harness presents the foundational principles, technical motivation, and layered architecture designed to transform agent-assisted development into a rigorous and predictable engineering process.

Developing with AI agents in real-world codebases frequently runs into four universal failure modes:

1. **Runaway edits across multiple files:** The agent touches dozens of files beyond the requested scope, introducing accidental refactorings and unreviewable diffs.
2. **Broken builds:** The assistant reports premature success while leaving behind compilation errors, broken type signatures, and failing packages.
3. **Test hallucination:** The model claims categorically that "all tests passed" without executing a single terminal command.
4. **Context loss between sessions:** Upon closing the session, decisions, blockers, and progress evaporate, forcing work to restart from scratch.

The Oh My Pi Harness resolves these issues by structuring the interaction between developer and agent as a rigorous, measurable engineering workflow.

### Comparison: Traditional Chat vs Engineering with Harness

| Unassisted AI Chat | Engineering with Harness |
|---|---|
| **Runaway edits:** Changes dozens of files without boundaries, producing massive, unpredictable diffs. | **Bounded scope:** Declares and enforces file ownership per lane; edits touch only authorized targets. |
| **Broken builds:** Claims tasks are complete without verifying that projects compile or package cleanly. | **Compulsory verification:** Blocks completion until typechecks, linters, and builds pass with exit code zero. |
| **Test hallucination:** Invents test results ("all tests passed") without executing terminal commands. | **Real evidence:** Requires captured terminal output, a measured Quality Gate with coverage metrics, and auditable evidence rungs. |
| **Context loss:** Every new session starts from scratch, forgetting decisions, blockers, and pending work. | **Durable continuity:** Persists state on disk (WIP=1), records blockers, and produces a clean handoff for the next session. |

### PREVC, OpenCode, and Oh My Pi

**PREVC is the shared contract** for meaningful engineering: it defines boundaries, state transitions, required evidence, and human or governed confirmation. **OpenCode is the continuity and methodology adapter**; it organizes planning conventions, durable artifacts, and cross-session handoffs. **Oh My Pi is the native engine** executing this contract with native runtime primitives.

In OMP, the `scheduler` dispatches independent lanes via a `tasks[]` call, `hub` coordinates inter-agent messaging, `todo` maintains the session's WIP=1 focus, and `test-runner` shards test suites when supported by test structure. Furthermore, the harness incorporates agent teams in Maestri (`/maestri-team`), structured onboarding with second-brain vaults (Obsidian + Graphify), a Quality Gate with typed metric reporting (`Measured: N/M`), and layered code review governance.

## Direct comparison

The seven steps of the contract are grouped into four operational phases. Grouping does not remove steps: it assigns explicit ownership and inspectable evidence to each boundary.

| Phase | Grouped steps | Expected outcome |
|---|---|---|
| **Prepare** | `prepare` + `plan` | Context discovery, risk classification, scope definition, and plan awaiting approval. |
| **Execute** | `execute` | Implementation strictly bounded by approved scope under WIP=1. |
| **Validate** | `validate` + `judge` | Quality Gate execution and independent receipt from the read-only Judge. |
| **Confirm** | `refine` + `confirm` | Reviewed improvement proposal and explicit confirmation (human or criteria-based autonomous). |

In sequence, the conceptual contract remains:

```text
prepare → plan → execute → validate → judge → refine → confirm
```

In the durable state managed by `harness-prevc-state.mjs`, this sequence maps to the canonical state machine phases: `prepare` → `awaiting_plan_approval` → `execute` → `validate` → `judge` → `refine` → `awaiting_confirmation` → `complete`.

- **prepare** — discovers repository context and classifies initiative risk.
- **plan** — defines goals, scope, non-goals, and acceptance criteria.
- **execute** — implements code strictly within declared file ownership boundaries.
- **validate** — measures output with formal gates, regression evals, and captured evidence.
- **judge** — a read-only evaluator compares deliverable artifacts against the contract.
- **refine** — a read-only refiner proposes structural improvements; cannot edit or vote.
- **confirm** — the operator verifies evidence and confirms; criteria-based auto-confirmation is governed by strict rules and disabled by default.

## Documentation pillars

| Section | What it covers |
|---|---|
| **[Getting Started](./getting-started/installation)** | Step-by-step installation and running your first session. |
| **[Concepts](./concepts/why-a-harness)** | PREVC, WIP=1, evidence rungs, measured Quality Gate, Code Review, and automation limits. |
| **[Guides](./guides/small-task)** | Complete workflows for small tasks, complex features, new projects, and Maestri teams. |
| **[Reference](./reference/commands)** | Commands, agents/skills, and governance artifacts. |
| **[Adoption](./adoption/use-cases)** | Use cases, pros and cons, security boundaries, and honest limitations. |
| **[FAQ](./troubleshooting/faq)** | Common problems and operational solutions. |

## What the harness gained

Since its original baseline, the harness has evolved to adopt enterprise agentic engineering practices:
- **Quality Gate as an operational signal:** Red verdicts block only completion assertions without aborting the session; reports display transparent `Measured: N/M` coverage.
- **Integrated evals and security:** The `eval_regressions` metric runs Git-mined historical holdouts, while `authz_controls` validates security contracts.
- **Layered code review:** Independent reviewers from competing model families, domain `docs/review.md` contracts, standardized PR templates, and the "bug becomes test" rule.
- **Criteria-based auto-confirmation:** Governed `auto-confirm` (opt-in) advancing only with a clean Judge receipt, fresh matching-hash green gate, and independent reviewer approval.
- **Onboarding and second brain:** Coordinated agent teams in Maestri (`/maestri-team`) and project indexing with Obsidian and Graphify.

## Prerequisites

Reading the documentation requires no local runtime. Running the harness requires base Oh My Pi, the public package in `~/.omp/agent`, plus:

- Windows with PowerShell 5.1+
- Node.js 20+
- Git

## Quick installation

> **Clean installation:** if `~/.omp/agent` already exists with custom files, back it up prior to installing — no automatic merge is performed. The [complete installation guide](./getting-started/installation) provides exact commands.

The Oh My Pi Harness distribution is located in `omp/agent/`. It contains agents, commands, scripts, configurations, and core skills loaded directly by Oh My Pi. The public package excludes private runtimes, internal states, private evidence, and offensive playbooks.

After reviewing `omp/agent/omp-port-manifest.json`, install into a clean folder:

```powershell
$target = Join-Path $env:USERPROFILE ".omp\agent"
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -Path "omp/agent/*" -Destination $target -Recurse -Force
```

The `website/` folder contains only the documentation site; its dependencies are not part of the OMP runtime.

[Complete installation guide &rarr;](./getting-started/installation)

## The core principle

The harness does not seek to replace the operator. It makes explicit what was requested, what was approved, what was executed, what was verified, and what the single next safe action is. Everything else in this documentation stems from this principle.
