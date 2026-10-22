---
sidebar_position: 1
---

# Use Cases

The use cases section guides workflow selection based on risk classification, dependencies, and architectural impact across development tasks. Select workflows based on risk and dependencies rather than raw file counts. The Quality Gate evaluates metrics declared in `agent-os/quality-thresholds.json`; missing signals or crashing tools constitute explicit gaps (*fail-closed*), never tacit approval.

| Scenario | Recommended selection | Governance and evidence |
|---|---|---|
| Single-file simple task | Short lane, WIP=1 | Tier `low`, local verification, and fast gate. |
| Bugfix | Reproduction, fail-before, and regression | "Bug becomes test" rule: proven failure on baseline commit prior to patching. |
| Complex feature | Spec, contract, and lanes by ownership | Tier `sampling` or `full`, full gate, and formal Judge receipt. |
| Independent multitasking | Parallel lanes (`tasks[]`) | Disjoint file ownership; individual envelopes reconciled by orchestrator. |
| Dependent multitasking | Serialized lanes by dependency | Sequential execution; advancement only upon evidence from preceding step. |
| Multi-session initiative | Durable state and handoff | `session-handoff.md` with explicit `Verified Now` and `Broken Or Unverified`. |
| High risk or security | Tier `full` and security audit | Mandatory red-team (N >= 3 proven attempts) and executable `authz_controls`. |
| Project onboarding | `/maestri-team` and initialization | Profile setup, second-brain vault with Obsidian + Graphify, and PR template. |
| Task triage | PREVC planning or local skill | "Is this worth building?" check, risk tier (`risk:*`), and rollback procedure. |
| Documentation only | Docs lane and link verification | Static build validation without touching runtime or leaking private paths. |
| Refine cycle and learned rules | Judge, Refine, and operator confirmation | Read-only proposal; ledger integration in an isolated follow-up commit. |
| Session resumption | `/harness-session-start` | Bounded path-scoped briefing anchored to repository `sourceHash`. |

## Single-file simple task

**When to use:** Localized modification, clear requirements, no new external dependencies, no database migrations, and no critical path changes.

**Prompt example:**
```text
/prevc prepare Fix empty state copy in src/components/EmptyState.tsx. Modify
only this file and run module tests and the local gate.
```

**Expected behavior:** PREVC establishes a WIP=1 unit, validates strict scope, runs area tests, and checks the local gate. If accumulated diff remains low and touches non-sensitive areas, the router preserves tier `low`.

## Bugfix ("Bug becomes a test")

**When to use:** Any reported functional defect or regression.

**Prompt example:**
```text
/prevc prepare Reproduce pagination offset bug. Author a regression test
demonstrating the failure prior to fixing, apply the minimal patch, and validate.
```

**Expected behavior:**
1. The agent writes an automated test demonstrating the bug on baseline code (*fail-before*).
2. The implementation patch is applied.
3. The test suite executes again, demonstrating clean resolution (*pass-after*).
4. The Quality Gate confirms the `eval_regressions` metric remains green.

## Complex feature

**When to use:** Multiple affected modules, new API contracts, database schema changes, or cross-service integrations.

**Prompt example:**
```text
/prevc prepare Design and implement asynchronous report export workflow.
Specify contracts, isolate worker and API ownership, and await approval.
```

**Expected behavior:** PREVC produces a specification in `agent-os/specs/`, defining non-goals and acceptance criteria. The scheduler splits implementation into lanes with disjoint file ownership. The full gate evaluates under tier `sampling` or `full`, an independent reviewer in a competing model family inspects the diff against `docs/review.md`, and the Judge issues the formal receipt.

## High risk or security

**When to use:** Touching authentication routes, session token validation, user authorization rules, billing logic, or harness governance policies.

**Prompt example:**
```text
/prevc prepare Update session token expiration logic. Classify as high risk,
require tier full, execute authorization tests and security red-team audit.
```

**Expected behavior:**
- The router compulsorily assigns tier `full`.
- The `harness-security-contract` runner evaluates declared `authz_controls`.
- The operator's security auditor executes exploit attempts against the modified surface (red-team with N >= 3 proven attempts), logging the verdict anchored to `sourceHash`.
- Final completion requires explicit human operator confirmation; auto-confirmation is disabled for high-risk work.

## New project onboarding with Maestri team

**When to use:** Introducing the harness into an existing repository or bootstrapping a greenfield application.

**Prompt example:**
```text
/maestri-team --apply
```

**Expected behavior:** The harness organizes specialized agent roles in Maestri, audits whether the project has PR templates, domain review contracts (`docs/review.md`), profile definitions in `agent-os/`, and initializes the second-brain vault (Obsidian + Graphify).

## Task triage and risk classification

**When to use:** Ingesting a new feature request or technical issue from Linear or an issue tracker.

**Prompt example (via native PREVC command or the operator's local `triagem-task` skill, outside the public package):**
```text
/prevc prepare Triage and plan incoming WebSocket migration evaluating value, risk, and rollback
```

**Expected behavior:** The workflow (supported by operator triage routines or planning guidelines) formally evaluates whether the initiative is "worth building", applies a risk label (`risk:low`, `risk:medium`, `risk:high`), defines the rollback procedure (`How to revert`), and identifies the regression test to author.
## What this proves and what it does not prove

### What it proves
- That each task category receives a proportional degree of rigor, testing, and security auditing.
- That rollback procedures and regression tests are planned before touching production code.

### What it does NOT prove
- Category selection does not replace human engineering judgment when a complex defect necessitates fundamental architectural refactoring.

## Next step

Review the trade-offs and operational costs of this model in [Pros and Cons](./pros-and-cons) or examine safeguards in [Security](./security).
