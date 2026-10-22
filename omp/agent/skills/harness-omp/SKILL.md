---
name: harness-omp
description: "Bridges OpenCode harness conventions to Oh My Pi primitives. Use when running harness workflows or agents inside Oh My Pi. Do NOT use for Cursor configuration (use harness-cursor-parity)."
---

# harness-omp — the harness on Oh My Pi

This is the OpenCode harness ported to omp-native config under `~/.omp/agent/`,
combining the strengths of both architectures: OpenCode's **PREVC** lifecycle,
**measured quality gates**, **risk router**, **judge/evaluator**,
**refine / learned-rules loop**, **WIP=1** discipline and **evidence-before-
assertion** rigor — now running on omp's native robust **parallel `task`
dispatch** + **`hub`** coordination + the **`todo`** and **`goal`** tools +
**per-agent model roles** (`config.yml` `modelRoles`). The headline win over the
OpenCode original: slow tests and quality gates in large projects are fixed by
native concurrency (see `skill://harness-omp-parallel`).

## Commands (`~/.omp/agent/commands/*.md`)

| Command | Use it when |
|---|---|
| `/prevc` | Drive the full lifecycle: `prepare` an objective, execute an approved plan, validate with evidence, judge, confirm. |
| `/quality` | Run the measured quality gate + risk router (`/quality full` = full tier over the reconciled tree). |
| `/refine` | Run the refine loop: refiner proposes, rule-verifier checks, operator confirms learned rules. |
| `/harness-session-start` | Start of a session: discover state, task, startup + verification commands. |
| `/harness-clean-handoff` | End of a session: update evidence/progress/handoff, show git status. |
| `/harness-bootstrap` | Install/scaffold the harness into a project. |
| `/harness-init` | Non-mutating audit of a repo's harness readiness (writes nothing). |
| `/harness-standards` | Establish/route the project's coding standards. |
| `/harness-spec` | Turn a settled objective into an Agent OS spec. |
| `/harness-status` | Quick readiness check: git state, PREVC phase, handoff, budgets. |
| `/harness-security-scan` | Run the security scan over harness + project surfaces. |

## Agents (`~/.omp/agent/agents/*.md`)

Harness agents:

- `scheduler` — Execute-phase parallel scheduler; fans lanes out in one
  `tasks[]` batch and reconciles.
- `code-reviewer` + `architecture-reviewer` — the two concurrent reviewers of
  the quality gate (read-only, dispatched together).
- `refiner` + `rule-verifier` — the refine loop: propose, then verify.
- `test-runner` — one per test shard for parallel suites.
- `implementer` — the write-capable lane worker.

Dispatch policy: every dispatched subagent MUST be one of the 24 versioned
source profiles installed under `~/.omp/agent/agents/` (rendered from the repo
`agent/` tree); `task` is only the dispatch tool — every `tasks[]` item names an
explicit source agent (`explorer` for recon, `implementer`/`fixer` for edits,
`test-runner` for shards, `code-reviewer`/`architecture-reviewer`/
`security-analyst` for reviews, `judge` for verdicts). Never select
bundled/built-in runtime profiles.

## OpenCode → omp mapping

| OpenCode artifact | omp equivalent |
|---|---|
| `opencode.jsonc` command | `~/.omp/agent/commands/*.md` |
| `agent/*.md` + `opencode.jsonc` agent block | `~/.omp/agent/agents/*.md` |
| `modelRoles` in `opencode.jsonc` | `~/.omp/agent/config.yml` `modelRoles` |
| background subagent stub + status polling | omp `task` `tasks[]` batch (auto-deliver) + `hub` |
| `start-parallel.ps1` / `start-serial.ps1` | native — nothing to launch |
| `scripts/*.mjs` | `~/.omp/agent/scripts/*.mjs` (portable; read project `agent-os/quality-thresholds.json`) |
| `harness-*` skills | discovered as-is via omp's opencode provider |
| opencode plugins (permission-policy / security-guard) | omp per-agent `tools` allowlist + `security_scan` tool/hooks |
| opencode plugin event hooks (tool-activity, context-monitor) | OMP extension event bus — `extensions/harness-omp-trace.ts` (native `pi.on` events) |


## Shared global context

The static global harness context is shipped as `docs/context.md`, installed at `~/.omp/agent/docs/context.md`, loaded by `/harness-session-start`, and referenced by the scheduler dispatch contract. It is generated from the canonical OpenCode tree; do not hand-edit the installed copy.

Project `docs/ARCHITECTURE.md`, `docs/PRODUCT.md`, and `docs/RELIABILITY.md` remain separate project context artifacts, and domain `CONTEXT.md` remains the project glossary. The shared global file does not replace any of them.
## The 5 harness layers

- **Entry** — commands in `~/.omp/agent/commands/` (`/prevc`, `/harness-*`).
- **Context** — `agent-os/` docs + the discovered `harness-*` skills.
- **State** — the `todo` tool (WIP=1) + `goal` + handoff docs.
- **Feedback** — `~/.omp/agent/scripts/*.mjs` measured gate, risk router, ship
  evidence, findings.
- **Evaluation** — the reviewers, judge/evaluator, and `refiner`/`rule-verifier`
  refine loop.

## Project profile and tools

On session start, if `agent-os/project-profile.json` is missing OR `--detect --json` differs from it, run `node scripts/harness-project-profile.mjs --root . --write --publish-cerebro` without asking the operator. Handle status: `published` = done; `not_registered` = done (no cérebro; mention `novo-projeto` skill if user wants one); `needs_agent_fix` = fix listed notes in `~/.task-pipeline/staging/<name>/` (never in vault, never inside `<!-- gerado -->` or `<!-- harness-profile -->` blocks), rerun up to 3 attempts, then escalate with findings; `blocked_secret` = escalate as `secret_or_credential`, do not publish.

Wrong profile command (exit 127, command not found, missing script): correct `agent-os/project-profile.json` marking the section with `"detected": false`, keep `evals.runnerAllowlist` aligned with the same runner, and re-run `node scripts/harness-project-profile.mjs --root . --write --publish-cerebro` in the same session so the cérebro hub does not stay stale. If the status reports the command was rejected in the hub, the runner is not in the trusted catalog: escalate as `scope_change`, do not edit the catalog. Any edit to `agent-os/project-profile.json`, manual or self-correction, is followed by `--write --publish-cerebro`.

| tool | when | command | never-blocks behavior |
|---|---|---|---|
| `harness-project-profile.mjs` | Setup, detection & cérebro publication | `node scripts/harness-project-profile.mjs --root . --detect [--write [--publish-cerebro]]` | Emits detected capabilities; automatic cérebro sync never blocks session initialization |
| `harness-eval-runner.mjs` | Eval validation & preflight | `node scripts/harness-eval-runner.mjs --preflight-smoke` / `--verify-fail-before [--write]` | No docker and profile not requiring it -> status `skipped` exit 0; isolation `process` or `none` from profile |
| `harness-model-broker.mjs` | Model evaluation & proxying | `node scripts/harness-model-broker.mjs --self-test` | 503 without provider key |
| `harness-failure-digest.mjs` | Failure diagnosis & autofix loop | `node scripts/harness-failure-digest.mjs --gate <file>` / `--eval <file>` / `--ci latest` | `gh` missing -> `unavailable` exit 0 |
| `harness-risk-router.mjs` | Reconciled diff risk scoring | `node scripts/harness-risk-router.mjs --json --since <ref>` | Missing or unparseable refs fall back safely to full tier |
| `harness-ship-evidence.mjs` | Commit trailer & PR packaging | `node scripts/harness-ship-evidence.mjs --commit-trailer` / `--pr-body` | Refuses on red/stale gate without corrupting repository state |
| `harness-delivery-preflight.mjs` | Deployment preflight checking | `node scripts/harness-delivery-preflight.mjs --discover --json` / `--check-deploy --env <e> --root .` | `delivery.mode: none` or `manual` -> `not_applicable` exit 0 |
| `harness-learned-rules.mjs` | Scoped prompt rule injection | `node scripts/harness-learned-rules.mjs --render --fenced --scope <path>` | Caps at `max_active_rules_per_target`; sanitizes fence delimiters |
| `~/.task-pipeline/intake-cerebro.mjs` | Knowledge base ingestion | `node ~/.task-pipeline/intake-cerebro.mjs --dry` | Staging quarantine before the Obsidian vault |
| `harness-eval-runner.mjs` | Eval mining & regression gate | `node scripts/harness-eval-runner.mjs --mine --write` / `--regression --metric` | Gate metric `eval_regressions`, blocking; `not_applicable` exit 0 without a dataset |
| `harness-security-contract.mjs` | Authz & IDOR verification gate | `node scripts/harness-security-contract.mjs --run --metric` | Gate metric `authz_controls`, blocking; status `unavailable` exit 2 when a required service is down |
| `harness-delivery-preflight.mjs` | Delivery config validation | `node scripts/harness-delivery-preflight.mjs --config-check --metric` | Gate metric `delivery_config`, observe; never deploys |

The Maestro dispatches lanes with `maestri ask --batch` and verifies each lane itself before trusting its report.

## Guardrails v2 — mandatory bounded controls (spec 2026-08-31-1317-harness-guardrails-v2)

- **Per-lane red-team quickcheck (R1).** After reconciling each lane's diff, run
  `node ~/.omp/agent/scripts/harness-redteam-scan.mjs --metric` (≤ 2 min; explicit
  `--target` outside git). FAIL count 0 → done. Findings → fix and re-scan, or escalate
  to `security-analyst` — and escalate on any tier ≥ `sampling` even with a clean scan.
  Simple/medium task ceremony ≤ 10 min wall-clock; deep active exploitation never enters
  this loop (authorized-only).
- **Dependency cooldown (R3).** Never add a dependency under the fixed 7-day cooldown;
  the full gate enforces `harness-dependency-cooldown.mjs` via `dependency_cooldown`
  (`--approve <name>@<version> --yes` is the only operator escape).
 - **Provider fallback (R7).** Common subagents get exactly ONE retry, only for
   provider/auth/quota/rate/timeout/incapacity errors, on `openai-codex/gpt-5.6-luna:high`.
   Test failures and findings never trigger fallback; exhaustion is `blocked` and logged.
   The OMP scheduler uses Luna `xhigh` with no fallback/downgrade: alert and block.
 - **Model matrix (R8).** `modelRoles.scheduler` is Luna `xhigh`; default, implement,
   recon and review are Luna `medium`; research, test and refine are GLM Flash `high`.
   Explorer/research/test-runner/refiner/rule-verifier use GLM Flash `high`; all other
   implementer/advisor/reviewer/Judge roles use Luna `medium`.
 - **Multimodal (R6).** Images stay in the main session; capability failures block and
   never silently convert, downgrade, or route through a text-only fallback.

## Observability: native event trace (T04)

The OMP port ships a validated native event-to-trace adapter:
`~/.omp/agent/extensions/harness-omp-trace.ts` (generated by the exporter, installed
through the install/check boundary — the only managed extension path). It subscribes
to the native OMP extension event bus (`session_start`, `session_switch`,
`agent_start`, `tool_execution_start`, `tool_execution_end`, `agent_end`,
`session_shutdown` — all validated live in omp v18) and persists the T01 envelope
into `docs/harness/traces/trace.jsonl` through the shared contract module:

- `session` records for session start/switch/shutdown;
- one `run` record per agent turn (parent `session`);
- `tool` records per execution, carrying only the tool name and call id — never tool
  input/output bodies;
- one `model` record per run with identity + usage/cost/context exactly as the
  runtime supplied them (missing → explicit `unavailable`, never zero or inferred).

Every append is validated, redacted, hash-chained, and bounded by
`harness-trace.mjs` at write time; the stream is audit evidence only after
`node ~/.omp/agent/scripts/harness-trace.mjs --verify --root .` passes. `/trace`
drives verify/read/prune and appends lifecycle records (phase/gate/finding/review/
judge/handoff) from their owning commands with the same trace/run/session IDs.

Boundaries: session JSONL, history/agent databases, the statusline, `hub` job
snapshots, and ad-hoc shell commands are never tracing and never substitute for
`--verify`. The adapter observes only — model/capability/fallback policy and
permission outcomes stay independent of it.

## Performance note

Large-project test and quality-gate slowness (the OpenCode harness's serial
fallback) is fixed in omp by native concurrency. Whenever Execute/Validate feels
slow, read **`skill://harness-omp-parallel`**: shard tests across `test-runner`
subagents, run reviewers concurrently, and run the measured gate once.

## First run in a project

1. `/harness-init` — audit readiness (writes nothing).
2. `/harness-bootstrap` — install the harness artifacts.
3. `/harness-session-start` — discover state + startup/verification commands.
4. `/prevc prepare <objective>` — plan the work.
5. Approve the plan.
6. Run it (Execute → scheduler fans lanes out in parallel).
7. `/quality full` — measured gate over the reconciled tree.
8. `/harness-clean-handoff` — record evidence and hand off.
