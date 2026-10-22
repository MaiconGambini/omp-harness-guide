---
sidebar_position: 1
---

# Commands

Global commands available in Oh My Pi after installing the public package,
located under `~/.omp/agent/commands/`. There are two distinct layers:

- **Contract-shared commands:** `/prevc`, `/quality`, `/refine`,
  `/harness-session-start`, and `/harness-clean-handoff` express lifecycle,
  quality, continuity, and confirmation independently of specific adapters.
- **OMP-native commands and surfaces:** `/planner`, `/harness-status`,
  `/score`, `/capabilities`, `/fallback`, `/trace`, `/harness-security-scan`,
  `/harness-mcp-inventory`, `/harness-context-budget`, `/maestri-team`, and `/agent`
  leverage runtime scheduling, observability, or team orchestration. There are no
  public `omp:*` commands.

Command names start with `/` when invoked within Oh My Pi chat (such as
`/prevc`). The list below organizes commands by operational function.

## Overview by family

### Lifecycle and quality

| Command | When to use | What it does |
|---|---|---|
| `/prevc` | Any meaningful work | Controls the complete lifecycle: prepare, plan, execute, validate, judge, refine, confirm, and handoff. Sole writer of the durable lifecycle phase (via `harness-prevc-state.mjs`) |
| `/quality` | Before a commit (or at any checkpoint) | Runs `harness-quality-gate.mjs --mode $ARGUMENTS` (defaults to `local`; use `full` before commits) and `harness-risk-router.mjs`; displays the metrics table and review tier. Exit 1 = fix the failing metric, never relax the threshold; exit 2 = harness blocker. Unavailable metrics or stale reports represent named gaps, not passes |
| `/refine` | After Judge, or to record operator notes via `--note` | Dispatches the read-only refiner over the trajectory window and routes proposals by blast radius; writes nothing. With `--note`, persists an `operator_note` finding |

### Coordination, team, and persona

| Command | Arguments | When to use | What it does |
|---|---|---|---|
| `/maestri-team` | `[--dry-run] [--apply] [--reset] [--root <dir>] [--specialist <backend-infra\|vue>] [--model <id>] [--thinking <level>]` | Multi-agent team orchestration in Maestri | Provisions or reuses the standard ten-role OMP team in the active Maestri workspace via `skill://maestri-workspace-team` and `harness-maestri-team.mjs`. Requires explicit operator consent to recruit terminals |
| `/agent` | `<profile-name> \| clear \| reset` | Switch or inspect active OMP persona | Adopts the agent profile in `~/.omp/agent/agents/<name>.md`, recording the active role and adapting session instructions and capabilities |

### OMP-native commands

| Command | Arguments | When to use | What it does |
|---|---|---|---|
| `/planner` | `<objective>` | Plan significant work in OMP | Size-gated planning pipeline in the scheduler role: `wayfinder` for large efforts, `grill-with-docs` in AUTO mode, and `to-tickets` for decomposition; halts at `awaiting_plan_approval` |
| `/harness-spec` | `<slug or objective>` | Medium or large features in OMP | Creates or drafts an Agent OS spec under `agent-os/specs/<slug>/` from global templates |
| `/propose-skill` | `[--activate <name>]` | Recurring procedures in OMP history | Scans repetitive command sequences and proposes a generated skill. Activation (`--activate`) is manual, validates candidate skills, and installs only upon explicit operator confirmation |
| `/trace` | `--verify \| --read \| --prune \| --record` | Inspect native OMP event trace | Verifies hash integrity (`--verify`), reads recent events (`--read`), prunes retention (`--prune`), or records lifecycle envelopes (`--record`) via `pi.on` |
| `/harness-status` | *(none)* | Verify operational readiness | Prints git status, durable PREVC phase, handoff presence, context budget, security posture, and observable surfaces; absent surfaces are reported as named `unavailable` gaps |
| `/score` | *(none)* | View aggregate score | Shows the 0-10 aggregate score computed from recent gate reports; never used as a gate blocker |
| `/capabilities` | *(none)* | Check multimodal capability facts | Summarizes multimodal support per model role from the capability probe |
| `/fallback` | *(none)* | Check provider fallback history | Summarizes provider fallback retry events from the scheduler log |
| `/harness-security-scan` | *(none)* | Audit security posture | Scans the harness and project for supply-chain and secret risks; summarizes PASS/WARN/FAIL without exposing secret values |
| `/harness-mcp-inventory` | *(none)* | Inventory MCPs | Lists MCP servers, detects configuration drift, and flags secret keys without displaying values |
| `/harness-context-budget` | *(none)* | Audit context load | Reports context budget consumed by skills, commands, and MCPs; recommends lazy-loading |

### Session and project

| Command | When to use | What it does |
|---|---|---|
| `/harness-session-start` | Beginning of every session | Discovers root instructions, progress state, feature state, and startup path; executes baseline verification if safe; declares active task |
| `/harness-clean-handoff` | End of every session | Collects evidence, blockers, progress notes, handoff state, and git status; generates structured handoff report. Does not mark feature state or claim unverified completion |
| `/harness-init` | First encounter with a repository | Non-mutating audit across harness layers; generates gap report with recommended remediations |
| `/harness-bootstrap` | Install complete harness suite | Proposes full harness configuration (AGENTS.md, feature_list.json, docs/harness, agent-os) and writes files only upon operator approval |
| `/harness-standards` | Prior to planning or implementation | Detects stack and loads applicable project and global standards; returns risk, validation, and tool permission profiles |

## Validate and install the public package

The runnable package lives under `omp/agent/`. The distribution does not publish
traditional semver releases; verify content using Git revisions and the manifest
hash inventory. At checkout, run the validator and copy to the target location:

```powershell
node scripts/validate-public-subset.mjs --check-manifest
$target = Join-Path $env:USERPROFILE ".omp\agent"
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -Path ".\omp\agent\*" -Destination $target -Recurse -Force
```

## Harness scripts

Node utilities reside in `~/.omp/agent/scripts/` and execute directly:

| Script | Representative usage | Purpose |
|---|---|---|
| `harness-prevc-state.mjs` | `node ~/.omp/agent/scripts/harness-prevc-state.mjs init\|transition\|inspect` | Manages and persists durable PREVC lifecycle states |
| `harness-quality-gate.mjs` | `node ~/.omp/agent/scripts/harness-quality-gate.mjs --mode local\|full` | Runs measured quality gates, calculates measurement coverage, and prints status reports |
| `harness-risk-router.mjs` | `node ~/.omp/agent/scripts/harness-risk-router.mjs` | Evaluates diff blast radius and determines review tier (`low`, `medium`, `high`) |
| `harness-flow-metrics.mjs` | `node ~/.omp/agent/scripts/harness-flow-metrics.mjs --root <repo> --since 28d --json` | Collects code flow stability metrics: commits, reverts, and followup bugfixes |
| `harness-maestri-team.mjs` | `node ~/.omp/agent/scripts/harness-maestri-team.mjs --dry-run\|--apply [--reset]` | Idempotently recruits and manages the ten-role team in Maestri |
| `harness-coverage-label.mjs` | *(support module / import)* | Derives measurement coverage labels and flags majority unmeasured states |
| `harness-delivery-preflight.mjs` | `node ~/.omp/agent/scripts/harness-delivery-preflight.mjs --root <repo>` | Validates delivery preflight authorizations without triggering deployment |
| `harness-project-onboarding.mjs` | `node ~/.omp/agent/scripts/harness-project-onboarding.mjs --root <repo>` | Executes automated project profile onboarding and harness checks |
| `harness-project-profile.mjs` | `node ~/.omp/agent/scripts/harness-project-profile.mjs [--detect] [--write] [--publish-cerebro] [--json] [--root <dir>]` | Extracts and maintains `agent-os/project-profile.json` with stack details and loop policies |
| `harness-trace.mjs` | `node ~/.omp/agent/scripts/harness-trace.mjs --verify\|--read\|--prune\|--record` | Manages redacted audit stream and telemetry event logs |
| `harness-status.mjs` | `node ~/.omp/agent/scripts/harness-status.mjs` | Reports operational readiness across git, PREVC, handoff, context, and guardrails |
| `harness-size-gate.mjs` | `node ~/.omp/agent/scripts/harness-size-gate.mjs` | Evaluates change batch size to prevent oversized pull requests |
| `harness-skill-lint.mjs` | `node ~/.omp/agent/scripts/harness-skill-lint.mjs` | Checks structural formatting and schema compliance of installed skills |

### Real execution example: flow metrics

Inspecting flow stability across recent commits without exposing private paths:

```bash
node ~/.omp/agent/scripts/harness-flow-metrics.mjs --root <projeto> --since 28d --json
```

Veridical output returned by the script:

```json
{
  "status": "ok",
  "root": "<projeto>",
  "since": "28d",
  "definition": "fixFollowups = commit fix/hotfix/bugfix que altera arquivo mexido por outro commit nos 7 dias anteriores (proxy de correção posterior; não prova merge).",
  "weeks": [],
  "totals": {
    "commits": 0,
    "reverts": 0,
    "fixFollowups": 0,
    "revertRatio": 0,
    "followupRatio": 0
  }
}
```

## Primary workflow walkthrough

### 1. Execute significant work — `/prevc`

```text
/prevc prepare <objective>
```

- Invokes global skill `prevc-workflow`, the primary lifecycle controller for non-trivial modifications.
- `prepare <objective>` performs discovery, classifies risk via `harness-risk-router.mjs`, and drafts an actionable plan via `planner`, stopping at `awaiting_plan_approval`.
- No code modifications take place before explicit approval, with the exception of canonical planning artifacts under `agent-os/specs/<slug>/`.
- Routine, low-risk operations (session starts, status queries, formatting, narrow test fixes) take a fast path with objective verification without requiring PREVC ceremony.

```text
/prevc run
```

- Accepts operator confirmation in plain language or `/prevc run`.
- An explicit directive to execute an approved plan or named spec end-to-end serves as autonomous execution authorization; execution halts once at `awaiting_confirmation`.
- Automates Execute → Validate → Judge within approved scope. The `scheduler` fans out independent lanes using `task` (a single `tasks[]` batch).
- Preserves risk pathways (`low`, `medium`, `high`, `untrusted`): medium+ requires documented context or security evidence; high/untrusted requires explicit risk acknowledgment.
- Never pushes, deploys, or alters remote Git state without manual confirmation.

### 2. Team in Maestri — `/maestri-team`

```text
/maestri-team
```

- Invokes `harness-maestri-team.mjs` in `--dry-run` mode to inspect canvas agents and render a preview roster report.
- Requires operator approval before applying (`--apply`), preventing unintended recruitment of billed model sessions.
- Supports `--reset` to issue `/new` to active reused terminals without killing background processes or losing tool permission boundaries.

### 3. Persona switching — `/agent`

```text
/agent spec-lead
```

- Validates existence of `~/.omp/agent/agents/spec-lead.md`, registers active persona name, and activates profile instructions in session.
- Running `/agent clear` clears active persona state and restores default harness instructions.

## What this proves and what it does not prove

- **What it proves:** commands provide structured, reproducible entry points into PREVC lifecycle management, non-mutating audits, and multi-agent coordination. Scripts run deterministic checks against the current working tree.
- **What it DOES NOT prove:** invoking a command does not guarantee that written code is functionally correct or bug-free. A passing `/quality` report only confirms compliance with active metrics; metrics with `unavailable` or `not_configured` statuses represent unmeasured blind spots rather than evidence of correctness.

## Related documentation

- [Skills and Agents](./skills.md) — Comprehensive inventory of subagent profiles and lazy-loaded skills.
- [Harness Artifacts](./artifacts.md) — State schemas, contracts, receipts, and handoffs.
- [Maestri Team Guide](../guides/maestri-team.md) — Operational manual for the ten-role multi-agent team.
