---
sidebar_position: 2
---

# Skills and Agents

Skills are `SKILL.md` files that Oh My Pi loads lazily, only when the task
matches their description. Agents are specialized subagent definitions in
`~/.omp/agent/agents/*.md`. The repository's sets are organized below by
area; the lists track the repository and have no fixed count (they derive
from the actual directories under `skills/` and `agents/`).

## Harness — lifecycle and workflow

| Skill | When to use |
|---|---|
| `prevc-workflow` | Control the lifecycle of significant work (plan, review, execute, validate, judge, refine, confirm) |
| `harness-omp` | Index and bridge for the Oh My Pi harness: how the PREVC contract maps onto OMP native primitives. Read first when using the harness in OMP |
| `harness-omp-parallel` | OMP native parallel execution: shard slow tests and run reviewers/lanes concurrently via `task` |
| `harness-session-start` | Start of every session: discovers instructions, state, and active task |
| `harness-clean-handoff` | End of every session: closes the state with evidence and handoff |
| `harness-session-handoff` | Record the handoff between sessions |
| `harness-continuity` | Multi-session work: WIP=1 state machine and blocked protocol |
| `harness-wip-control` | Before a multi-step prompt: decomposes into WIP=1 units, defines AC and non-goals |
| `harness-progress-log` | Maintain the durable progress log |
| `harness-feature-state` | Normalize feature state across `feature_list.json` and Markdown task files |
| `harness-role-separation` | Complex or UI tasks: separates Planner → Generator → Evaluator |
| `harness-startup-path` | Discover the project's startup command |
| `harness-root-instructions` | Locate and read the repo's root instructions |
| `harness-runtime-feedback` | Capture runtime feedback during the work |
| `harness-readable-workspace` | Session that does not orient itself: fresh-session test and gap mapping |
| `harness-context-layer` | Inconsistent decisions: audits ARCHITECTURE, PRODUCT, RELIABILITY |
| `harness-refine` | The Refine phase after Judge: dispatches the read-only refiner and routes proposals by blast radius |
| `harness-redteam-check` | Bounded defensive adversarial check (R1): deterministic diff scan with operator-approved security escalation |

## Harness — setup, portability, and stack

| Skill | When to use |
|---|---|
| `harness-initializer` | First time in the project: non-mutating audit of the layers |
| `harness-bootstrap` | Install the full harness package with confirmation |
| `harness-stack-router` | Detect the stack from the files |
| `harness-standards-router` | Route applicable project and global standards |
| `harness-agent-os-specs` | Create Agent OS specs from the templates |
| `harness-agent-permissions` | Define and audit the agent permission matrix |
| `harness-portability` | Ensure harness portability across projects |

## Harness — verification, quality, and diagnostics

| Skill | When to use |
|---|---|
| `harness-termination-check` | Before declaring "done": a 3-layer check (static → runtime → system) |
| `harness-evaluator-rubric` | Before the Judge: builds the task-specific rubric |
| `harness-eval-contract` | Define the evaluation contract for the work |
| `harness-architecture-checks` | Propose executable architecture boundary checks |
| `harness-quality-snapshot` | Create a milestone quality scorecard with evidence |
| `harness-capstone-audit` | Comprehensive closing audit |
| `harness-benchmark` | Propose project-specific benchmark scripts and thresholds |
| `harness-cleanup-scanner` | Scan for residue and files to clean up |
| `harness-security-scan` | Audit secrets and supply-chain without exposing values |
| `harness-mcp-inventory` | Inventory MCPs and detect drift |
| `harness-context-budget` | Audit context load and recommend lazy-loading |
| `harness-status` | Report readiness: git, PREVC phase, handoff, context, security, score, fallback events, capabilities, red-team |
| `harness-worktree-lifecycle` | Worktree lifecycle safety for parallel agents |
| `harness-quality-gate` | Run the measured quality gate and the risk router; per-change and binary |
| `harness-project-calibration` | Derive the project's own quality thresholds and high-risk paths from its measurements |
| `harness-rule-enforce` | Promote an operator-approved prose rule to an enforced rule as a normal dispatchable lane |

## Planning and specs

| Skill | When to use |
|---|---|
| `brainstorming` | Before any creative work: explores intent, requirements, and design before implementation |
| `writing-plans` | Before touching code, with a spec or multi-step task requirements |
| `to-spec` | Turn an idea or note into a spec |
| `to-tickets` | Break a spec into actionable tickets |
| `research` | Investigate a topic or domain before deciding |
| `grill-me` | Be relentlessly questioned about a plan or design until there is shared understanding |
| `grill-with-docs` | Grilling backed by the existing documentation |
| `grilling` | Relentlessly grill the operator about a plan, decision, or idea |
| `wayfinder` | Plan a huge chunk of work as a shared map of decision tickets |
| `domain-modeling` | Model the domain before designing the solution |
| `codebase-design` | Design a module interface, test seam, or architecture boundary |
| `improve-codebase-architecture` | Improve the architecture of an existing codebase |
| `prototype` | Build a throwaway prototype to answer a design question |
| `implement` | Implement a piece of work based on a spec or a set of tickets |

## Agents

Specialized subagents are defined in `~/.omp/agent/agents/*.md`. The main
roles:

| Agent | Role | Edits? |
|---|---|---|
| `scheduler` | Execute-phase dispatcher and Planning role | no (commits reconciled lanes) |
| `planner` | Planning pipeline (scheduler's Planning role) | planning artifacts only |
| `implementer` / `fixer` | Scoped lane implementation | yes |
| `test-runner` / `test-automation-engineer` | Tests and test automation | yes |
| `code-reviewer` / `architecture-reviewer` | Quality gates over the diff | no |
| `judge` | Read-only Judge: returns one receipt per run | no |
| `refiner` | Read-only Refine proposals | no |
| `rule-verifier` | Refutes prose-rule proposals | no |
| `explorer` | Read-only discovery in unfamiliar code | no |
| `requirements-interrogator` | Requirements discovery | no |
| `system-design-advisor` / `architecture-advisor` / `design-patterns-advisor` | Design guidance | no |
| `design-director` | Design direction | no |
| `web-platform-engineer` / `vue-engineer` / `python-engineer` / `kotlin-engineer` / `postgres-engineer` / `backend-infra-engineer` | Stack specialists | yes |

## Frontend, backend, Python, TypeScript, and testing

These are the curated development skills that ship with the harness:

- **Frontend:** `frontend-design`, `interface-design`, `emil-design-eng`,
  `ui-ux-designer`, `frontend-dev-guidelines`, `frontend-developer`,
  `frontend-mobile-development-component-scaffold`, `frontend-slides`,
  `frontend-ui-dark-ts`, `react`, `nextjs-app-router-patterns`,
  `nextjs-best-practices`, `shadcn-ui`, `nextjs-supabase-auth`.
- **Backend and architecture:** `backend-architect`,
  `backend-dev-guidelines`, `nodejs-development`, `modular-monolith`,
  `software-architecture`, `software-engineering`.
- **Python:** `python-pro`, `python-patterns`,
  `python-development-python-scaffold`, `python-fastapi-development`,
  `async-python-patterns`, `python-packaging`,
  `python-performance-optimization`, `python-testing-patterns`,
  `uv-package-manager`.
- **TypeScript:** `typescript`, `typescript-pro`,
  `typescript-advanced-types`.
- **Testing, debugging, and review:** `tdd`,
  `test-driven-development`, `systematic-debugging`,
  `verification-before-completion`, `reviewing-code`, `code-review`,
  `requesting-code-review`, `receiving-code-review`.
- **Security (defensive, curated):** `frontend-security-coder`,
  `backend-security-coder`, `frontend-mobile-security-xss-scan`.
- **Meta and tooling:** `writing-skills`, `writing`,
  `prompt-engineering`, `dispatching-parallel-agents`, `using-git-worktrees`,
  `resolving-merge-conflicts`, `playwright-cli`, `obsidian`.

## Note on the public distribution

The public distribution excludes offensive, recon, exploitation, pentest,
attack-chain, and WSTG skill families, as well as local runtime evidence. The
exclusions are declared in the harness manifest and machine-checked: the
validator refuses a public tree that violates them. The curated defensive
security skills listed above remain.
