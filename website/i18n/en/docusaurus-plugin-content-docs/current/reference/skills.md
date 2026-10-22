---
sidebar_position: 2
---

# Agents and Skills

The harness in Oh My Pi operates with two capability layers: **agents** (subagent profiles with predefined roles, tools, and permission boundaries) and **skills** (`SKILL.md` instruction files loaded on demand when a task matches the skill description).

## Agents

Agent profiles reside under `~/.omp/agent/agents/`. Every subagent dispatched via `task` **must** declare an explicit source agent from the installed profile roster—never an implicit runtime fallback. Each profile enforces its own tool allowlist and write boundaries. The public package includes 25 specialized profiles.

| Agent | Role | Can edit? |
|---|---|---|
| `scheduler` | Execute phase dispatcher: single `tasks[]` wave, reconciliation, local commit | no |
| `planner` | Planning pipeline (via `/planner` command) | plan artifacts only |
| `implementer` | Bounded lane implementation (TDD along established seams) | yes |
| `fixer` | Bounded lane fixes | yes |
| `explorer` | Read-only reconnaissance and codebase mapping | no |
| `test-runner` | Parallel test suite execution shards | yes |
| `test-automation-engineer` | Test suite implementation and execution | yes |
| `code-reviewer` | Quality gate — code review (cross-family model pairing) | no |
| `architecture-reviewer` | Quality gate — structural and modular integrity review | no |
| `judge` | Post-gate verdict receipt generator (structured JSON) | no |
| `refiner` | Post-Judge improvement proposal author (read-only) | no |
| `rule-verifier` | Adversarial refutation of candidate rules | no |
| `plan-architect` | Bite-sized task planning and breakdown | no |
| `requirements-interrogator` | Requirement probing and ambiguity resolution | no |
| `design-director` | Design direction, visual aesthetics, and token systems | no |
| `design-patterns-advisor` | Design patterns and decoupled modular structure | no |
| `system-design-advisor` | Distributed systems architecture and reliability | no |
| `architecture-advisor` | Boundary delineation and architecture transitions | no |
| `backend-infra-engineer` | Infrastructure, containerization, and CI pipelines | yes |
| `python-engineer`, `web-platform-engineer`, `vue-engineer`, `kotlin-engineer`, `postgres-engineer` | Ecosystem-specific implementation specialists | yes |
| `better-portuguese` | Brazilian Portuguese technical writing and editorial review | no |
| `comment-sicko` | Elimination of phase narration and redundant comments | no |

Dispatch rules:

- `refiner` and `rule-verifier` are strictly read-only: no file edits, no mutating shell operations, and no sub-delegation.
- The `code-reviewer` runs in a model family distinct from the implementation author to mitigate shared lineage blind spots.
- Reviewers return structured findings to the scheduler; they never persist findings directly into the project repository.
- `judge` produces a standardized verdict receipt (`accept`, `reject`, or `revise`); the PREVC lifecycle persists the receipt.
- Model role assignments are established in `config.yml` (`modelRoles`); the scheduler role is reserved and is never auto-demoted.

## Skills

Skills are `SKILL.md` instruction files lazily loaded by Oh My Pi only when a
task semantically matches the skill description. The public distribution bundles
110 curated engineering, workflow, and defensive skills. Offensive penetration
testing, exploit chains, WSTG exploitation, and reconnaissance families are
excluded from this public distribution.

### Harness — lifecycle and workflow

| Skill | When to use |
|---|---|
| `prevc-workflow` | Manage lifecycle for significant work (prepare → plan → execute → validate → judge → refine → confirm) |
| `harness-omp` | Map harness concepts to native Oh My Pi primitives (task, hub, todo, `pi.on`) |
| `harness-omp-parallel` | Coordinate concurrent execution in Oh My Pi: test sharding and simultaneous lanes |
| `orchestrate` | Orchestrate parallel implementation lanes and dependency graphs under PREVC |
| `harness-session-start` | Beginning of every session: discover instructions, durable state, and active task |
| `harness-clean-handoff` | End of every session: wrap durable state with structured evidence and handoff |
| `harness-session-handoff` | Record and verify handoff consistency between consecutive sessions |
| `harness-continuity` | Multi-session continuity: blocker protocol and state transitions under WIP=1 |
| `harness-wip-control` | Before multi-step requests: decompose into WIP=1 units, define acceptance criteria |
| `harness-progress-log` | Maintain and rotate durable progress and milestone logs |
| `harness-feature-state` | Prior to Execute: audit and synchronize `feature_list.json` |
| `harness-role-separation` | Complex or UI-heavy tasks: split roles across Planner, Generator, and Evaluator |
| `harness-startup-path` | Discover reproducible build, startup, and test commands |
| `harness-root-instructions` | Locate, audit, and adhere to repository root instructions |
| `harness-runtime-feedback` | Ingest runtime feedback and execution telemetry during tasks |
| `harness-readable-workspace` | Orientation difficulties: fresh-session test and workspace gap analysis |
| `harness-context-layer` | Align architectural decisions and clarify system conventions |
| `harness-refine` | Post-Judge Refine phase: dispatch read-only refiner and route proposals |

### Harness — setup, portability, and team

| Skill | When to use |
|---|---|
| `harness-initializer` | First interaction with repository: non-mutating layer audit |
| `harness-bootstrap` | Install complete harness configuration following operator approval |
| `harness-project-setup` | Detect stack, test suites, linters, and containerization during onboarding |
| `maestri-workspace-team` | Provision and coordinate the standard ten-role team in Maestri |
| `harness-stack-router` | Infer programming languages, frameworks, and tooling from file evidence |
| `harness-standards-router` | Load relevant project and global standards into planning context |
| `harness-agent-os-specs` | Author and maintain Agent OS specification files from templates |
| `harness-agent-permissions` | Configure and verify tool permission matrices per subagent profile |
| `harness-portability` | Ensure harness portability across varied host environments |
| `harness-cursor-parity` | Maintain configuration and command parity across editor platforms |

### Harness — verification, quality, and diagnostics

| Skill | When to use |
|---|---|
| `harness-termination-check` | Before declaring completion: layered verification (static → runtime → system) |
| `harness-evaluator-rubric` | Before Judge: construct objective rubric criteria for task evaluation |
| `harness-architecture-checks` | Enforce modular boundary isolation and forbidden import boundaries |
| `harness-quality-gate` | Run measured gate and handle exit codes (exit 1 = fix code, exit 2 = blocker) |
| `harness-quality-snapshot` | Capture milestone maturity scorecards for release tracking |
| `harness-capstone-audit` | Periodic structural audit of harness health and compliance |
| `harness-benchmark` | Profile harness performance and measure execution thresholds |
| `harness-cleanup-scanner` | Identify build residue, transient files, and abandoned TODOs |
| `harness-security-scan` | Scan repository and harness configuration for secrets and supply-chain risks |
| `harness-mcp-inventory` | Audit MCP servers and safeguard against accidental credential exposure |
| `harness-context-budget` | Audit tool context overhead and recommend lazy-loading strategies |
| `harness-status` | Generate operational readiness status reports |
| `harness-worktree-lifecycle` | Verify worktree isolation during concurrent parallel agent execution |
| `harness-project-calibration` | Calibrate quality thresholds and high-risk paths from repository history |
| `harness-rule-enforce` | Graduate approved candidate rules into automated pipeline tests or lints |
| `harness-redteam-check` | Rapid adversarial quickcheck over reconciled diffs prior to gate |
| `harness-verify-audit` | Audit drift between real codebase implementation and skill instructions |
| `harness-verify-bootstrap` | Scaffold automated verification and regression test suites |

### Planning, writing, and clean code

| Skill | When to use |
|---|---|
| `writing-plans` | Develop bite-sized implementation plans (2 to 5 minutes per step) with TDD |
| `to-spec` | Consolidate settled architectural requirements into formal `spec.md` files |
| `to-tickets` | Decompose implementation plans into dependency-linked issue tickets |
| `research` | Investigate technical documentation, third-party APIs, or architectures |
| `grilling` | Rigorously interview operators to surface edge cases and resolve ambiguity |
| `grill-with-docs` | Stress-test proposed designs against existing repository documentation |
| `wayfinder` | Map large, ambiguous initiatives into structured decision tickets |
| `domain-modeling` | Define core business domain models and boundary invariants |
| `codebase-design` | Refactor modular boundaries and introduce seams for testing |
| `prototype` | Validate state machines or UI mockups without committing to production code |
| `implement` | Execute approved specifications and tickets adhering to TDD discipline |
| `better-portuguese` | Write and revise Brazilian Portuguese technical copy and documentation |
| `no-comments` | Strip redundant AI code comments preserving closed keep lists |
| `unslop` | Remove inflated AI prose and simplify technical specifications |

### Engineering and stacks

Specialized engineering skills are packaged with the distribution (`react`, `nextjs-app-router-patterns`, `python-pro`, `fastapi`, `typescript`, `tdd`, `systematic-debugging`, `verification-before-completion`, `code-review`, `receiving-code-review`, `dispatching-parallel-agents`, `using-git-worktrees`, `resolving-merge-conflicts`, `playwright-cli`). Defensive security skills (`frontend-security-coder`, `backend-security-coder`, `frontend-mobile-security-xss-scan`) form the defensive baseline.

## What this proves and what it does not prove

- **What it proves:** skills constrain model behavior to tested workflows, provide deterministic step-by-step guidance, and enforce separation of concerns (such as authoring versus review, or planning versus execution).
- **What it DOES NOT prove:** skill activation does not guarantee flawless compliance by LLMs. Real validation occurs through automated test executions, cross-family code review, and measured quality gate metrics.

## Related documentation

- [Commands](./commands.md) — Available commands to invoke skills and harness operations.
- [Artifacts](./artifacts.md) — Durable schemas, contracts, and receipts managed by agents.
- [Parallel Dispatch](../guides/parallel-dispatch.md) — Distributing lanes across specialized subagents.
