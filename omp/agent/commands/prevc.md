---
name: "prevc"
description: "PREVC is the sole lifecycle controller. Plan, review, execute, validate, judge, refine, confirm, and handoff."
---

Execute the `skill://prevc-workflow` skill. PREVC is the sole lifecycle controller for significant work. This command is the OMP adapter of that runtime-neutral contract. It owns the lifecycle phase and its dispatch. Track the single active unit with the `todo` tool (WIP=1). The lifecycle phase is durable. Every transition is written by `harness-prevc-state.mjs` to `docs/harness/state/prevc.json` and survives across sessions.

The OMP adapter:
- `todo` - holds the session's WIP=1 active unit.
- `scheduler` - the Execute-phase dispatcher for approved lanes. Its Planning role runs under `planner`.

Guardrails v2 (spec 2026-08-31-1317) apply to every Execute run. The per-lane red-team
quickcheck (`node ~/.omp/agent/scripts/harness-redteam-scan.mjs --metric`, findings or
tier ≥ `sampling` escalate to `security-analyst`); fixed 7-day dependency cooldown
(`harness-dependency-cooldown.mjs`, operator `--approve` only). Phase 1 provider policy:
scheduler uses `openai-codex/gpt-5.6-luna:xhigh`; the configured role
matrix assigns Luna `medium` to work, review, and advisory implementation roles and
GLM Flash `high` to research, test, and refine roles. Provider/auth/quota/rate/
timeout/incapacity failures are recorded and escalated. No automatic fallback target
is selected in Phase 1. Provider roster, retry, quorum, and degradation policy are
deferred to the Phase 2 panel backlog. Eventual bounded exhaustion is recorded as
`provider-fallback-exhausted`; it does not select a current retry target. Images stay
in the main session; capability failures block and never silently convert or downgrade.
- `task` with a `tasks[]` array + `hub` - native parallel dispatch and reconciliation. Results auto-deliver, and there is no background stub.
- `harness-prevc-state.mjs` is the persistent transition boundary. Run `node ~/.omp/agent/scripts/harness-prevc-state.mjs init --objective <text> --spec <path> --risk <low|medium|high|untrusted>` at `prepare`. Then run `transition --to <phase>` for every phase move and `inspect --json` to read the state. Exit 2 means the transition was refused. Refusals such as illegal edges, invalid state or receipt, and non-green gates write NOTHING: `validate -> judge` on a red or unavailable gate refuses the transition without writing state (phase stays `validate`, driving the `validate -> execute` autofix loop). Nothing persists `blocked` automatically from a gate result. Recovery edges `judge -> validate`, `refine -> validate`, and `blocked -> execute` allow flexible iteration without dead-ending. Every write is serialized by a repository-local lock at `docs/harness/state/.prevc.lock`. A lock older than 60s and owned by a dead or missing owner is reclaimed under a second recovery mutex at `docs/harness/state/.prevc-recover.lock`. Concurrent transitions cannot interleave, and the loser re-reads the new phase and exits 2. The recovery mutex never auto-steals. If a crash leaves `.prevc-recover.lock` behind, remove it manually. Its `owner.json` names the dead owner. Only this script writes the phase. Nothing else may write the lifecycle phase.

No agent other than PREVC may write the lifecycle phase. Agents and skills are bounded capabilities. They cannot transition lifecycle state, approve evidence, or self-confirm completion.
The Judge boundary:
- Before `validate -> judge`, the full gate (`node ~/.omp/agent/scripts/harness-quality-gate.mjs --mode full`) must be green AND fresh: its `sourceHash` must equal the current tree hash. Missing, stale, unreadable, unconfigured, or red gates refuse the transition (exit 2) with NO write (phase stays `validate`, driving the `validate -> execute` autofix loop). Nothing persists `blocked` automatically.
- The read-only `judge` agent returns one receipt JSON (schemaVersion 1, sourceHash, gateReport, tier, verdict accept|revise|block, rubricScore, blockingCriteria, evidencePaths, judge, judgedAt). PREVC writes it to `docs/harness/judge/<timestamp>.json` and passes it to `transition --to refine --judge-receipt <path>`; the receipt's sourceHash must equal the latest full green gate's.
- `refine -> awaiting_confirmation` requires the recorded receipt verdict `accept`; `revise`/`block` route to `revision_requested`/`blocked`.
- `awaiting_confirmation -> complete` requires `--operator-action confirm` AND an existing `docs/harness/session-handoff.md`.

## Size routing and fast-path bypass

Run `node scripts/harness-size-gate.mjs --objective "$ARGUMENTS" --files <comma-separated-files> --json`
before opening PREVC. If result is `fast-path`, consume that result and execute focused work directly;
skip PREVC lifecycle transitions, planner, scheduler, and panel ceremony. If result is `prevc` (`medium`
or `full`), use this lifecycle unchanged. This routing adds no lifecycle states and leaves the inert
scheduler plugin deferred. Every reply uses: `status`, `files_changed`, `verification`, `blocker`, `next_step`.

Route routine low-risk operations (session start, status checks, explicit dependency installation, formatting, narrow test repairs) through a direct fast path with objective verification instead of PREVC ceremony.

`prepare <objective>` (or `$ARGUMENTS`) means discovery, risk classification with `node ~/.omp/agent/scripts/harness-risk-router.mjs`, and plan creation via `planner`. It ends at a conversational `awaiting_plan_approval`. Do NOT edit anything before explicit approval. Read-only recon is always allowed. The sole pre-approval write exception is the planning pipeline itself. `planner` may create the canonical artifacts under the active `agent-os/specs/<slug>/` directory. These artifacts include `spec.md`, `plan.md`, `verification.md`, `decisions.md`, `tickets/`, `research.md`, and `prototype/` when applicable. product and implementation edits remain forbidden until approval.

Accept approval in plain language or `/prevc run`; no goal ID is required. An instruction to execute a named plan or spec end to end is itself the authorization for an autonomous run. Automate every task's Review → Execute → Validate → Judge to the end of the plan with no per-task approval, and stop once at `awaiting_confirmation`. Halt only for a real blocker. Real blockers include a task needing operator or live action, push/deploy/branch/worktree/remote Git, or an unrecoverable validation failure after one bounded repair.

On an approved/named-plan run, dispatch `scheduler` for Execute (see
`skill://harness-omp-parallel`), following this deterministic sequence:
1. Run lanes and focused test shards in parallel via a single-batch task dispatch with a tasks[] array (up to 32 parallel subagents), consuming the exact child envelope.
   ```json
   { "status": "ok" | "error", "summary": string, "artifact"?: string, "failures"?: string[] }
   ```
   MICRO-loop (inside execute): When a `test-runner` returns `status: "error"` or non-empty `failures`, do not
   ask the operator first. The scheduler dispatches exactly one bounded `fixer`
   with the failing lane ID, objective, declared ownership set, exact shard
   verification command, failure node IDs, and the full failure `artifact` pointer.
   Missing required failure IDs or artifacts is a blocked evidence gap.
2. Record the fixer evidence and rerun the same shard once. A passing rerun
   completes the lane. A failing rerun, or a fixer `status: "error"` summary
   prefixed `blocked:` or `needs_input:`, sets `blocked` with attempt count `1`.
   Never dispatch a second fixer or expand ownership.
3. Review wave: Dispatch `code-reviewer`, `architecture-reviewer`, and `security-analyst` in one
   parallel review wave over the same reconciled `sourceHash`. At risk tier `full`, `security-analyst`
   must run in red-team mode (at least 3 concrete attack probes) and produce a review file containing
   `sourceHash: <gate sourceHash>`, `Red-team: <n> tentativas`, and `Verdict: APPROVE` or `Verdict: REQUEST CHANGES`.
   PREVC refuses progression to Judge without this tier-full red-team review record.
4. Apply exceptional corrections only when a finding requires them; start a new lane/review wave only if the correction changes `sourceHash`.
5. Run the full quality gate over the reconciled tree. MACRO-loop (validate -> execute): If the full gate fails (red gate), route back from validate to execute for autofix, up to `fixLoop.maxAttempts` from `agent-os/project-profile.json` (default 3, clamped 1-10). When attempts reach `fixLoop.maxAttempts`, the transition carries `advisory: "fix-loop-exhausted (N/max)"`; report diagnosis to operator while work continues. Nothing persists `blocked` automatically.
6. When the full quality gate passes, run Judge.
7. Run Refine once; invoke `rule-verifier` only when Refine proposes a rule, then
   produce the deterministic handoff. Never re-run a completed phase speculatively.

Validate requires the measured gate green at `--mode full`. Preserve the low / medium / high / untrusted risk paths. Medium+ requires context/security evidence or a documented skip. High/untrusted requires explicit risk acknowledgement before execution. Local commits of reconciled, validated work are allowed once a run is authorized. Never push, deploy, create or change branches, create worktrees, or perform remote Git operations automatically. The operator authorizes each. Do not assume repository paths, stack, harness files, or project-specific commands.
