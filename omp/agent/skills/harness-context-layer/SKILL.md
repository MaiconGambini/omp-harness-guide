---
name: harness-context-layer
description: Audit context layer readiness. When agent makes inconsistent architectural decisions or fails to understand the system, build ARCHITECTURE.md, PRODUCT.md, and RELIABILITY.md from codebase analysis.
---

# Harness Context Layer

Audit the agent's understanding of the system. When gaps are found, build docs from the codebase — not from assumptions.

## When to Use

- Agent makes inconsistent architectural decisions across sessions
- Agent can't answer "how does X subsystem connect to Y?"
- Agent reinvents patterns that already exist in the codebase
- After major refactors that change architecture
- Before onboarding new contributors or agents
- When `harness-initializer` flags context layer as MISSING

## Audit Sequence

Run this before proposing any files. Answer from codebase, not memory.

### Architecture Understanding

- Can the agent name all subsystems and their boundaries?
- Can the agent explain data flow between subsystems?
- Can the agent list the tech stack per subsystem?
- Can the agent find the entry point of each subsystem?

### Product Understanding

- Can the agent state what the system does in 2 sentences?
- Can the agent describe the primary user journey?
- Can the agent explain what makes this product different?
- Does the agent know which features are active vs planned?

### Reliability Understanding

- Can the agent describe the error handling strategy?
- Can the agent list retry/fallback/timeout policies?
- Can the agent find logging conventions and observability signals?
- Can the agent explain the deploy/rollback process?

**Gate:** Score each category. If any category scores below 3/4 — that doc is a gap.

## What To Create (by gap)

| Gap | Doc to Create | Source of Truth |
|---|---|---|
| Architecture unclear | `docs/ARCHITECTURE.md` | Directory tree, package.json, pyproject.toml, docker-compose, main entry points |
| Product unclear | `docs/PRODUCT.md` | AGENTS.md product section, README, route names, user-facing copy |
| Reliability unclear | `docs/RELIABILITY.md` | Middleware, error handlers, retry configs, health checks, logging setup, CI/CD files |

## ARCHITECTURE.md Template

Extract from codebase — do not invent:

```markdown
# Architecture

## Subsystems

| Subsystem | Stack | Entry Point | Port |
|---|---|---|---|
| (from directory structure + config) | | | |

## Data Flow

(Diagram or list: how data moves between subsystems)

## Key Design Decisions

| Decision | Why | When |
|---|---|---|
| (from codebase patterns, not assumptions) | | |

## Directory Map

(Extract from actual directory tree, 1-2 levels deep)
```

## PRODUCT.md Template

Extract from user-facing surfaces:

```markdown
# Product

## What It Does
(2 sentences from AGENTS.md product section or README)

## Primary User Journey
(From route names + user-facing copy)

## Active Features
| Feature | Status | Evidence |
|---|---|---|
| (from feature_list.json if exists) | | |

## Differentiators
(What makes this product different — from AGENTS.md or product decisions)
```

## RELIABILITY.md Template

Extract from runtime code:

```markdown
# Reliability

## Error Handling
| Layer | Strategy | File |
|---|---|---|
| (from middleware, exception handlers, error boundaries) | | |

## Retry & Fallback
| Operation | Retry Policy | Fallback | File |
|---|---|---|---|
| (from HTTP clients, DB sessions, external API calls) | | | |

## Observability
| Signal | Tool | File |
|---|---|---|
| Logging | (from logging imports) | |
| Health checks | (from /health endpoints) | |
| Metrics | (from instrumentation) | |

## Deploy & Rollback
(From docker-compose, CI/CD files, release scripts)
```

## Rules

1. **Extract, don't invent.** Every claim must trace to a file:line in the codebase. If you can't find it, say "unknown" — don't guess.
2. **Create only what's missing.** If ARCHITECTURE.md already exists but is stale, update it. If all 3 exist and are current, output "Context layer complete — no gaps."
3. **One doc per invocation.** Don't create all 3 at once. Propose the most critical gap first, get approval, then write.
4. **Keep each doc ≤200 lines.** They're references, not tutorials. Link to detailed docs when needed.
5. **Never duplicate AGENTS.md content.** Context layer complements AGENTS.md — it doesn't repeat rules or entry points.

## Output

Before writing any file, produce:

```
Context Layer Audit:

ARCHITECTURE.md:
  Subsystems: [score/4]
  Data flow:  [score/4]
  Tech stack: [score/4]
  Entry points: [score/4]
  Gap: [yes/no] → Proposed source files to analyze: [...]

PRODUCT.md:
  What it does: [score/4]
  User journey: [score/4]
  Differentiator: [score/4]
  Active features: [score/4]
  Gap: [yes/no] → Proposed source: AGENTS.md, feature_list.json, route names

RELIABILITY.md:
  Error handling: [score/4]
  Retry/fallback: [score/4]
  Observability: [score/4]
  Deploy/rollback: [score/4]
  Gap: [yes/no] → Proposed source files: [...]

Most critical gap: [doc name]
Proposed action: create [doc name] from [source files]
Approve before I write anything.
```

Then wait for approval. Write only after approval.
