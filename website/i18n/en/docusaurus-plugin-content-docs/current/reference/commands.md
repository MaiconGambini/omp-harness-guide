---
sidebar_position: 1
---

# Commands

Global commands available in Oh My Pi after installing the harness. Each
command runs a global skill or a diagnostic script. This reference lists
every command by family and then walks through the usage of the main
commands.

Names start with `/` when invoked in the Oh My Pi chat (for example,
`/prevc`).

## Overview by family

### Lifecycle and planning

| Command | When to use | What it does |
|---|---|---|
| `/prevc` | Any significant work | The sole lifecycle controller: plan, review, execute, validate, judge, refine, confirm, handoff. Every phase transition is durable (`harness-prevc-state.mjs`). |
| `/planner` | Plan significant work | Size-gated pipeline: `wayfinder` for large efforts, `grill-with-docs` in AUTO, `to-tickets` to decompose; ends at `awaiting_plan_approval` |
| `/harness-spec` | Medium or large feature | Creates or proposes an Agent OS spec in `agent-os/specs/<slug>/` from the global templates. |
| `/propose-skill` | Recurring process in history | Scans history for repeated command sequences and proposes (or, with `--activate`, installs) a generated skill. Zero auto-activation. |

### Session

| Command | When to use | What it does |
|---|---|---|
| `/harness-session-start` | At the start of every session | Reads global context, durable PREVC phase, feature state, handoff, and startup path; runs the baseline if safe; declares the active task with AC. |
| `/harness-clean-handoff` | At the end of every session | Reads the durable lifecycle, collects evidence, blockers, progress notes, and git status; returns a handoff report. Never marks completion by itself. |

### Project

| Command | When to use | What it does |
|---|---|---|
| `/harness-init` | First time in a project | Non-mutating audit of Entry, Context, State, Feedback, Evaluation, and Skills layers; produces a gap report with recommended fixes. |
| `/harness-bootstrap` | Install the full harness package | Proposes the full package (`AGENTS.md`, `feature_list.json`, `docs/harness/*`, `docs/{ARCHITECTURE,PRODUCT,RELIABILITY}.md`, `agent-os/*`) and writes only after confirmation. |
| `/harness-standards` | Before planning or implementing | Detects the stack and loads project and global standards; returns risk, validation, and skill profiles. |
| `/harness-status` | Check readiness | Prints git state, durable PREVC phase, handoff presence, context budget, security posture, score, fallback events, capabilities, and red-team status; identifies the next best action. |

### Quality, Refine, and tracing

| Command | When to use | What it does |
|---|---|---|
| `/quality` | Before a commit (or any time) | Runs the measured quality gate (`--mode local` by default, `--mode full` before a commit) and the risk router; prints the metric table and the tier with its reason. Exit 1 = fix the metric, never relax the threshold; exit 2 = harness blocker. An unavailable metric or a missing/stale report is a named gap, never a pass. |
| `/refine` | After Judge, or to record an operator note with `--note "<what I fixed by hand>"` | Dispatches the read-only `refiner` over the findings window; routes proposals by blast radius; writes nothing. `--note` records an `operator_note` finding that alone clears the propose bar. |
| `/score` | On demand | Derives the aggregate quality score (0-10) from the newest gate reports and persists it to the project's quality area (derived observability only — never a gate input). |
| `/trace` | Inspect the trace | Verifies the hash-chained event stream (`--verify`), reads recent records (`--read`), prunes records older than 90 days (`--prune`), or appends lifecycle records (`--record`) through the shared contract. |
| `/capabilities` | Multimodal routing | Detects and reports per-model multimodal capabilities (text / text+image) and persists `docs/harness/capabilities.json`. |
| `/fallback` | Provider-fallback log | Records, reads, or prunes provider-fallback events (one bounded re-dispatch per lane; orchestrator failures are alert-only, never auto-retried). |

### Security and diagnostics

| Command | When to use | What it does |
|---|---|---|
| `/harness-security-scan` | Audit the security surface | Scans the repo harness, MCPs, and configuration for secret and supply-chain risks; summarizes PASS/WARN/FAIL without printing values. |
| `/harness-mcp-inventory` | Inventory MCPs | Lists MCP servers and detects drift or secret-bearing keys without exposing values. |
| `/harness-context-budget` | Audit context load | Reports the context budget of skills, commands, and MCP surfaces; recommends lazy-loading. |

## Validate and install the public package

The real package is under `omp/agent/`; there are no public `omp:*` npm
scripts or exporter. From the reviewed checkout, run the validator and then
copy the tree into a clean installation:

```powershell
node scripts/validate-public-subset.mjs --check-manifest
$target = Join-Path $env:USERPROFILE ".omp\agent"
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -Path ".\omp\agent\*" -Destination $target -Recurse -Force
```

## The harness scripts

All scripts live in `~/.omp/agent/scripts/` and run with Node:

```powershell
node ~/.omp/agent/scripts/harness-prevc-state.mjs init|transition|inspect
node ~/.omp/agent/scripts/harness-quality-gate.mjs --mode local|full
node ~/.omp/agent/scripts/harness-risk-router.mjs
node ~/.omp/agent/scripts/harness-trace.mjs --verify|--read|--prune|--record
node ~/.omp/agent/scripts/harness-findings.mjs --window|--json
node ~/.omp/agent/scripts/harness-score.mjs
node ~/.omp/agent/scripts/harness-status.mjs
node ~/.omp/agent/scripts/harness-redteam-scan.mjs
node ~/.omp/agent/scripts/harness-security-scan.mjs
node ~/.omp/agent/scripts/harness-briefing.mjs
```

## Step-by-step for the main commands

### 1. Work on something significant — `/prevc`

```
/prevc prepare <objective>
```

- Runs the global `prevc-workflow` skill, the single lifecycle controller for
  significant work.
- `prepare <objective>` performs discovery, classifies risk
  (`harness-risk-router.mjs`), and creates the plan via the planner, stopping
  at `awaiting_plan_approval`.
- No agent other than PREVC may write the lifecycle phase. Agents and skills
  cannot transition lifecycle state, approve evidence, or self-confirm
  completion.

```
/prevc run
```

- Accepts explicit operator approval in plain language or `/prevc run`.
- An operator instruction to execute a **named** plan or spec end to end is
  itself the authorization for an autonomous run: no separate `/prevc run`,
  no per-task approval; the run stops once at `awaiting_confirmation`.
- Automates Execute → Validate → Judge → Refine within the approved scope.
- On low-risk work, allows a limited repair pass for a newly exposed
  verification prerequisite and then runs full validation again.
- Preserves the low, medium, high, and untrusted risk paths: medium+
  requires context/security evidence or a documented skip; high/untrusted
  requires explicit risk acknowledgment before executing.
- Never commits remotely, pushes, deploys, switches branches, or runs remote
  Git operations automatically.

### 2. Audit a project — `/harness-init`

```
/harness-init
```

- Runs the global `harness-initializer` skill.
- Produces a non-mutating gap report with recommended fixes.
- Does not create or edit files unless the user approves a specific fix.
- Does not assume that `init.ps1`, `feature_list.json`, or a specific
  progress file exist.

### 3. Install the full harness — `/harness-bootstrap`

```
/harness-bootstrap
```

- Runs the global `harness-bootstrap` skill.
- Always proposes the full package: `AGENTS.md`, `feature_list.json`,
  `docs/harness/` (progress, session-handoff, sprint-contract),
  `docs/{ARCHITECTURE,PRODUCT,RELIABILITY}.md`,
  `agent-os/judges/project-judge.md`, `agent-os/standards/`,
  `agent-os/quality-thresholds.json`, and the spec templates.
- First audits the current repo, detects the stack, and discovers the startup
  path.
- Shows the exact files to create, merge, or skip and asks for explicit
  confirmation before writing anything.

### 4. Start the session — `/harness-session-start`

```
/harness-session-start
```

- Runs the global `harness-session-start` skill as a direct routine
  operation, not PREVC work.
- Reads the global context in `~/.omp/agent/docs/context.md` (or reports the
  gap).
- Reads the durable PREVC lifecycle (`harness-prevc-state.mjs inspect
  --json`): a missing, unreadable, or unknown phase is a WARN, never a pass;
  a `blocked` phase persists with its blocker.
- Locates feature state (`feature_list.json`, `agent-os/specs/*/`).
- Reads `docs/harness/session-handoff.md`, if present.
- Discovers the startup command and runs it if safe.
- Runs `git log --oneline -3` in git repos.
- Applies WIP=1 (via the `todo` tool) and declares the active task with
  observable acceptance criteria.

### 5. Close the session — `/harness-clean-handoff`

```
/harness-clean-handoff
```

- Runs the global `harness-clean-handoff` skill as a PREVC handoff
  subroutine.
- Reads the durable lifecycle first; a missing handoff is a WARN when the
  phase is `awaiting_confirmation` or `complete`; a `blocked` phase persists
  with its blocker.
- Collects evidence, blockers, progress notes, and git status.
- Only PREVC writes lifecycle transitions after the operator's decision.
- When invoked directly, it returns only a handoff report: it does not mark
  feature state, infer confirmation, or assert completion.

### 6. Plan significant work — `/planner`

```
/planner <objective>
```

- Runs the planning pipeline in the scheduler's Planning role: size-gate
  (`wayfinder` for large efforts), sharpen (`grill-with-docs` in AUTO),
  decompose (`to-tickets`).
- Writes the canonical artifacts under
  `agent-os/specs/<YYYY-MM-DD-HHMM-slug>/` (spec, plan, verification,
  decisions, tickets) **before** approval.
- Outputs the reviewable plan and stops at `awaiting_plan_approval`; does
  not edit anything before approval.

### 7. Quality gate — `/quality`

```
/quality
/quality full
```

- Runs `harness-quality-gate.mjs` (default `--mode local`; `--mode full`
  before a commit) then `harness-risk-router.mjs`. Both read
  `agent-os/quality-thresholds.json` from the project.
- Exit 1 = fix the metric, never relax the threshold. Exit 2 = a harness
  blocker, not a code failure.
- Every `unavailable` metric is named as a gap — a green exit code over a
  handful of measured rows is not evidence.
- For large suites, shard the tests across parallel `test-runner` lanes
  before reading coverage.

### 8. Refine — `/refine`

```
/refine
/refine --note "<what I fixed by hand>"
```

- Gathers the findings window, the newest gate report, and the learned-rules
  ledger; dispatches the read-only `refiner`; routes `enforcement == prose`
  and non-high-risk targets to the `rule-verifier` for refutation.
- Never proposes edits to `~/.omp/agent/**` or the harness scripts;
  proposals target the project's `agent-os/standards/` only.
- `--note` records an `operator_note` finding through the scheduler's
  write-once findings path and stops.

## Quick commands (cheat sheet)

```text
# Unknown project: audit without writing
/harness-init

# Project without harness: propose full install
/harness-bootstrap

# Start of a normal session
/harness-session-start

# Prepare significant work
/prevc prepare <objective>

# Approve the prepared plan (plain language works); run the approved plan
/prevc run

# Autonomous run: an instruction to execute a named plan/spec end to end is
# itself the authorization — no separate /prevc run, no per-task approval

# Pause or close with durable context
/harness-clean-handoff

# Plan significant work
/planner <objective>

# Quality, refine, and observability
/quality              # measured quality gate + risk router (--mode full before a commit)
/refine               # Refine phase after Judge (or --note "<what I fixed by hand>")
/score                # aggregate 0-10 score from the newest gate reports
/trace                # verify/read/prune the redacted event trace

# Global diagnostics
/harness-status
/harness-security-scan
/harness-context-budget
/harness-mcp-inventory
```
