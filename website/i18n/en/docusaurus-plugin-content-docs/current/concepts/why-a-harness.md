---
sidebar_position: 1
---

# Why a Harness?

The harness concept establishes the governance layer, versioned disk constraints, and deterministic verifications required to transform AI assistants into reliable engineering tools.

When developers begin using AI assistants directly in the terminal, they quickly encounter four structural failure modes:

1. **Runaway edits across multiple files:** The agent attempts a localized fix and ends up modifying dozens of unrelated modules, generating massive diffs and corrupting the working tree.
2. **Broken builds:** The agent declares victory without testing whether the project still compiles or dependencies remain intact.
3. **Test hallucination:** The model assumes changes work and claims "all tests passed" without ever invoking a test runner in the terminal.
4. **Context loss between sessions:** Upon closing or resetting the terminal, the agent forgets previous decisions, rewrites prior work, and repeats past mistakes.

The harness transforms AI assistance into a deterministic engineering process governed by versioned disk rules, executable verifications, and auditable state transitions.

## Structural comparison

| Unassisted AI Chat | Engineering with Harness |
|---|---|
| **Runaway edits:** Changes dozens of files without boundaries, producing massive, unpredictable diffs. | **Bounded scope:** Declares and enforces file ownership per lane; edits touch only authorized targets. |
| **Broken builds:** Claims tasks are complete without verifying that projects compile or package cleanly. | **Compulsory verification:** Blocks completion until typechecks, linters, and builds pass with exit code zero. |
| **Test hallucination:** Invents test results ("all tests passed") without executing terminal commands. | **Real evidence:** Requires captured terminal output, a measured Quality Gate, and auditable evidence rungs before claiming success. |
| **Context loss:** Every new session starts from scratch, forgetting decisions, blockers, and pending work. | **Durable continuity:** Persists state on disk (WIP=1), records blockers, and produces a clean handoff for the next session. |

> **PREVC contract:** Only after establishing these baseline guarantees do we introduce the formal lifecycle: `prepare → plan → execute → validate → judge → refine → confirm`, where each transition requires evidence from the preceding stage.

## What the harness answers

Before any significant change, the harness answers:

1. Where am I, and what conventions govern this repository?
2. What has been completed, and what is currently blocked?
3. What is the single active unit of work?
4. How will I prove the change actually worked?
5. Who decides whether the result is acceptable?
6. What must the next session read to continue cleanly?

## How this is implemented in Oh My Pi

- **Durable state** — `todo` tracks the WIP=1 unit; `harness-prevc-state.mjs` records the lifecycle phase in a durable file with local locking and cross-session persistence.
- **Governed dispatch** — the `scheduler` dispatches a `tasks[]` wave coordinated via `hub`, delivering results automatically.
- **Integrated Quality Gate** — evaluates static metrics, tests, evals, and security with explicit coverage reporting (`Measured: N/M`).
- **Layered code review** — competing model families review diffs against domain contracts (`docs/review.md`) and convergence limits.
- **Parallel scale** — native runtime capabilities support subagent fan-out and test sharding across disjoint file ownership sets.
- **Auditable tracing** — `harness-omp-trace.ts` captures a redacted envelope from native events without reading message bodies or local database contents.

## What the harness does not do

- It does not make agents infallible or fully autonomous by default.
- It does not replace human review and ultimate responsibility.
- It does not provide operating system sandboxing.
- It does not make code quality automatic; it mandates verifiable evidence and durable state.

## Core principle

The repository is the system of record. State that exists solely in chat memory is not trustworthy state.
