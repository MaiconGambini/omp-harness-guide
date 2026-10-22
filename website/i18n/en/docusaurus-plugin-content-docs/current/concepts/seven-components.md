---
sidebar_position: 2
---

# The Seven Components

> **PREVC lifecycle:** These components exist to support the cycle `prepare → plan → execute → validate → judge → refine → confirm`; each carries explicit operational boundaries.

The harness organizes its capabilities into seven core components. Rather than disconnected products, they represent architectural lenses ensuring the engineering workflow remains complete and protected.

1. **Prompt / Context** — Repository rules, conventions in `agent-os/standards/`, and the non-negotiable instruction to operate under PREVC.
2. **Tools** — Toolsets scoped by agent allowlists; in Oh My Pi, implementers, reviewers, and orchestrators hold strictly bounded tool permissions.
3. **Context Management** — Surgical loading of instructions and state; integration with static code indices (Graphify) and second-brain vaults, preventing context window bloat.
4. **Verification** — Measured Quality Gate with typed statuses, explicit coverage reporting (`Measured: N/M`), Git-mined eval regressions, security contracts, and delivery checks.
5. **Memory** — Active work tracking via `todo` (WIP=1), learned rules ledger (`agent-os/learned-rules.json`), task progress, and durable handoffs (`session-handoff.md`).
6. **Sandboxes** — No operating system sandboxing on the local host. Software policies and permission restrictions do not substitute for OS-level process isolation.
7. **Hooks / Extensions** — Native event bus (`pi.on`) and audit extensions; they observe the lifecycle without triggering unmonitored autonomous loops.

## What each component protects

| Component | Question it answers | Current boundary |
|---|---|---|
| **Prompt / Context** | What rules and conventions govern this session? | Text guidelines do not replace deterministic tool checks. |
| **Tools** | What actions is the agent authorized to execute? | Per-role allowlists; sensitive mutations require human approval. |
| **Context Management** | What must the agent inspect to decide safely? | Context must be relevant and scoped; global context dumps degrade attention. |
| **Verification** | What facts prove the result actually works? | Verbal model assertions are Rung 1; only captured output and measured gates constitute proof. |
| **Memory** | How does the next session resume without amnesia? | Disk-persisted repository files; state held solely in chat memory is volatile. |
| **Sandboxes** | Is the agent process isolated from the operating system? | **No.** No OS sandbox exists on the host; safety relies on human plan approval. |
| **Hooks / Extensions** | How is the lifecycle integrated and audited? | Extensions only observe and record events; they never initiate actions outside PREVC. |

## What this proves and what it does not prove

### What it proves
- That every dimension of interaction between agent and codebase is governed by explicit safeguards.
- That verifications and memory rely on versioned files and real terminal commands.

### What it does NOT prove
- The existence of seven components does not guarantee the absence of bugs if underlying project tests are incomplete.
- It does not replace the operator's responsibility to inspect terminal commands before approving execution plans.

## Next step

See how these components coordinate sequentially in [PREVC](./prevc).
