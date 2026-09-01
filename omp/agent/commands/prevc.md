---
name: prevc
description: "PREVC: sole lifecycle controller — plan, review, execute, validate, judge, refine, confirm, handoff."
---

Execute the `skill://prevc-workflow` skill. PREVC is the sole lifecycle controller for significant work. This command is the OMP adapter of that runtime-neutral contract: it owns the lifecycle phase and its dispatch. Track the single active unit with the `todo` tool (WIP=1). The lifecycle phase is durable: every transition is written by `harness-prevc-state.mjs` to `docs/harness/state/prevc.json` and survives across sessions.

The OMP adapter:
- `todo` — holds the session's WIP=1 active unit.
- `scheduler` — the Execute-phase dispatcher for approved lanes; its Planning role runs under `planner`.

Guardrails v2 (spec 2026-08-31-1317) apply to every Execute run: per-lane red-team
quickcheck (`node ~/.omp/agent/scripts/harness-redteam-scan.mjs --metric`, findings or
tier ≥ `sampling` escalate to an operator-approved security review); fixed 7-day dependency cooldown
(`harness-dependency-cooldown.mjs`, operator `--approve` only); provider fallback = ONE
re-dispatch on the alternate allowed model (`opencode-go/deepseek-v4-flash` ⇄
`opencode-go/glm-5.3-flash`), exhaustion → `blocked: provider-fallback-exhausted`, the
scheduler never auto-downgrades, events in `docs/harness/quality/fallback-events.json`;
multimodal images stay in the main session (`glm-5.3-flash` only with capability-checked
permission; text-only lanes return `blocked: multimodal-unsupported`); model matrix:
  scheduler = `openai-codex/gpt-5.6-luna:xhigh` ONLY, every other subagent =
`opencode-go/deepseek-v4-flash:max` or `opencode-go/glm-5.3-flash:max`, normal
`glm-5.3`/DeepSeek Pro never assigned.
- `task` with a `tasks[]` array + `hub` — native parallel dispatch and reconciliation; results auto-deliver, there is no background stub.
- `harness-prevc-state.mjs` — the persistent transition boundary. Run `node ~/.omp/agent/scripts/harness-prevc-state.mjs init --objective <text> --spec <path> --risk <low|medium|high|untrusted>` at `prepare`, then `transition --to <phase>` for every phase move, and `inspect --json` to read the state. Exit 2 means the transition was refused. Ordinary refusals — illegal edges, invalid state or receipt, missing/stale/unreadable gates — write NOTHING; the sole exception is the red-gate guard: `validate -> judge` against a red full gate atomically persists `blocked` with the derived metric/value/threshold blocker and still returns exit 2. Every write is serialized by a repository-local lock (`docs/harness/state/.prevc.lock`, atomic mkdir; a lock older than 60s AND owned by a dead or missing owner is reclaimed under a second recovery mutex, `docs/harness/state/.prevc-recover.lock`): concurrent transitions cannot interleave, and the loser re-reads the new phase and exits 2. The recovery mutex never auto-steals — if a crash leaves `.prevc-recover.lock` behind, remove it manually (its owner.json names the dead owner). Only this script writes the phase; nothing else may write the lifecycle phase.

No agent other than PREVC may write the lifecycle phase. Agents and skills are bounded capabilities: they cannot transition lifecycle state, approve evidence, or self-confirm completion.
The Judge boundary:
- Before `validate -> judge`, the full gate (`node ~/.omp/agent/scripts/harness-quality-gate.mjs --mode full`) must be green AND fresh: its `sourceHash` must equal the current tree hash. Missing, stale, unreadable, or unconfigured gates refuse the transition (exit 2) with NO write; a red gate refuses and atomically persists `blocked` with metric/value/threshold in the blocker.
- The read-only `judge` agent returns one receipt JSON (schemaVersion 1, sourceHash, gateReport, tier, verdict accept|revise|block, rubricScore, blockingCriteria, evidencePaths, judge, judgedAt). PREVC writes it to `docs/harness/judge/<timestamp>.json` and passes it to `transition --to refine --judge-receipt <path>`; the receipt's sourceHash must equal the latest full green gate's.
- `refine -> awaiting_confirmation` requires the recorded receipt verdict `accept`; `revise`/`block` route to `revision_requested`/`blocked`.
- `awaiting_confirmation -> complete` requires `--operator-action confirm` AND an existing `docs/harness/session-handoff.md`.

Route routine low-risk operations (session start, status checks, explicit dependency installation, formatting, narrow test repairs) through a direct fast path with objective verification instead of PREVC ceremony.

`prepare <objective>` (or `$ARGUMENTS`) means: discovery + risk classification (run `node ~/.omp/agent/scripts/harness-risk-router.mjs`) + plan creation via `planner`, ending at a conversational `awaiting_plan_approval`. Do NOT edit anything before explicit approval; read-only discovery is always allowed. The sole pre-approval write exception is the planning pipeline itself: `planner` may create the canonical artifacts under the active `agent-os/specs/<slug>/` (spec.md, plan.md, verification.md, decisions.md, tickets/, research.md, prototype/).

Accept approval in plain language or `/prevc run`; no goal ID is required. An instruction to execute a named plan or spec end to end is itself the authorization for an autonomous run: automate every task's Review → Execute → Validate → Judge to the end of the plan with no per-task approval, and stop once at `awaiting_confirmation` for the whole spec. Halt mid-run only for a real blocker: a task needing operator/live action, a scope change beyond the plan, push/deploy/branch/worktree/remote Git, or an unrecoverable validation failure after one bounded repair.

On an approved/named-plan run, dispatch the `scheduler` agent via the `task` tool as the Execute-phase scheduler. The omp parallel execution model (see `skill://harness-omp-parallel`):
- The scheduler parallelizes independent lanes in ONE `task` batch (`tasks[]` array, up to 32 truly-concurrent subagents; results auto-deliver — there is no background stub ).
- Reviewers run concurrently: `code-reviewer` + `architecture-reviewer` in one `task` batch.
- Tests shard across parallel `test-runner` subagents (split by test file/dir/tag), then reconcile pass/fail — never run a large suite serially in the main agent.
- Each lane runs the measured gate at `--mode local` and returns its metric table; the full gate (`node ~/.omp/agent/scripts/harness-quality-gate.mjs --mode full`) runs ONCE over the reconciled tree.

Validate requires the measured gate green at `--mode full`. Preserve the low / medium / high / untrusted risk paths: medium+ requires context/security evidence or a documented skip; high/untrusted requires explicit risk acknowledgement before execution. Local commits of reconciled, validated work are allowed once a run is authorized. Never push, deploy, create/change branches, create worktrees, or perform remote Git operations automatically — the operator authorizes each. Do not assume repository paths, stack, harness files, or project-specific commands.
