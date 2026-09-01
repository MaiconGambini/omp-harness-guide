---
name: harness-omp-parallel
description: 'Oh My Pi native parallel execution model for the harness — shard slow tests and run reviewers/lanes concurrently via the task tool to fix quality-gate and test slowness. Use during PREVC Execute/Validate on large projects.'
---

# harness-omp-parallel — native parallel execution for the omp harness

This skill is the performance core of the omp harness. Read it whenever a PREVC
**Execute** or **Validate** phase touches a large project and tests or the
quality gate feel slow.

## WHY this exists (the root cause we removed)

The original OpenCode harness parallelized work through
`OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` + background subagent handles + a
status polling loop. That path was a flaky stub race: the background
subagent handle was not always registered before the poll started, so lanes
routinely fell back to a **serial** execution path (~4–5 minutes per lane).
On large repos that serial fallback is exactly why tests and quality gates
crawled — every lane re-ran mutation/e2e work sequentially and the main agent
sat polling a status stub.

**omp deletes that mechanism entirely.** It has native, robust, truly-concurrent
subagent dispatch with automatic result delivery. There is nothing to poll and
no stub to race.

## THE MECHANISM

Dispatch a `tasks[]` **array in one `task` call**. Up to **32** subagents run
truly concurrently; their results **auto-deliver** — no polling, no background
stub, no status polling.

- Reconcile with the `hub` tool:
  - `op:"jobs"` — snapshot of running/settled jobs (a settled row IS the delivery).
  - `op:"wait"` — ONLY when you are fully blocked with no other work.
  - `op:"send"` — peer coordination between live subagents (e.g. shared-file handoff).
- For a multi-wave DAG, use `eval` instead: `parallel(thunks)` for one wave,
  `pipeline(items, ...stages)` for staged waves with a barrier between stages,
  and `agent(prompt, handle=true)` to name a node whose `handle`/`output` feeds
  a downstream node's prompt. Acyclic only — no node waits on its own descendant.

Fan out to *genuine* independent slices in a single batch. Never spawn one
subagent then idle, and never serialize slices that could run together.

## TEST SHARDING (the big win)

A slow suite is split into **N shards** by test file / directory / tag, and each
shard runs in its own `test-runner` subagent, all dispatched in ONE `task`
batch. Each subagent runs ONLY its shard with the project's real runner:

- **pytest** — pass paths or `-k`/`-m` selectors: `pytest tests/api tests/db`
- **vitest / jest** — pass file/dir args: `vitest run src/feature/**`
- **go** — `go test ./pkg/...` per package group
- **cargo** — `cargo test module::` per module

Then reconcile: merge each shard's pass/fail, union the failures, and **merge
coverage** (combine `.coverage`/`coverage-*.json`/`lcov` fragments). Only AFTER
reconciliation do you read merged coverage into the gate.

**Shard count rule of thumb:** `min(cpu_count, suite_dirs, 32)`.

### Worked example — pytest split by directory

Suppose `tests/` has `api/`, `db/`, `pipelines/`, `analysis/`, `cli/` and the
box has 6 cores. `min(6, 5, 32) = 5` shards, one per directory. Dispatch:

```
task(tasks=[
  { agent:"test-runner", name:"ShardApi",       task:"Run: pytest tests/api --cov=src --cov-report=json:cov-api.json -q. Return pass/fail counts, failing node ids, and cov-api.json path." },
  { agent:"test-runner", name:"ShardDb",        task:"Run: pytest tests/db --cov=src --cov-report=json:cov-db.json -q. Return the same." },
  { agent:"test-runner", name:"ShardPipelines", task:"Run: pytest tests/pipelines --cov=src --cov-report=json:cov-pipe.json -q. Return the same." },
  { agent:"test-runner", name:"ShardAnalysis",  task:"Run: pytest tests/analysis --cov=src --cov-report=json:cov-ana.json -q. Return the same." },
  { agent:"test-runner", name:"ShardCli",       task:"Run: pytest tests/cli --cov=src --cov-report=json:cov-cli.json -q. Return the same." },
])
```

Results auto-deliver. Reconcile: any shard failing → suite fails (report the
union of failing node ids); combine the five `cov-*.json` into one coverage
number (`coverage combine` for pytest, or sum covered/total lines) before the
gate reads it. Five directories that would have run serially now finish in the
time of the slowest single shard.

## REVIEWER CONCURRENCY

Dispatch `code-reviewer` + `architecture-reviewer` in ONE batch at tier **full**.
An operator-approved security review is also required. Reviewers are read-only,
so they never race and never need `hub` coordination. Never run reviewers serially.

```
task(tasks=[
  { agent:"code-reviewer",         task:"Review the reconciled diff for standards/quality; return findings JSON." },
  { agent:"architecture-reviewer", task:"Review boundaries/coupling on the reconciled tree; return findings JSON." },
  // Security review is an explicit operator action, not a bundled public agent.
  { task:"[tier=full] Operator-approved security review of the diff; return findings JSON." },
])
```

## GATE ONCE

The measured gate runs **once** over the reconciled tree, never per lane —
per-lane mutation/e2e work multiplies minutes for no signal:

```
node ~/.omp/agent/scripts/harness-quality-gate.mjs --mode full
```

Individual lanes run only `--mode local` and return their metric table; the
scheduler reconciles those tables, then runs `--mode full` a single time after
all lanes and test shards have landed and coverage is merged.

## LANE OWNERSHIP

One write-capable subagent owns a given file at a time. If two lanes' ownership
sets intersect, **serialize** them (or have one own the shared file and the
other message it via `hub op:"send"`); disjoint ownership sets run concurrently.
Read-only subagents (`explorer`, the reviewers) never conflict and can always run
alongside writers.

## Guardrails v2 — bounded controls on parallel dispatch (spec 2026-08-31-1317)

- **Red-team quickcheck per reconciled lane (R1):** after each lane lands, run
  `node ~/.omp/agent/scripts/harness-redteam-scan.mjs --metric`; findings escalate to
  an operator-approved security review (also at tier ≥ `sampling`). ≤ 2 min per scan, ≤ 10 min total
  ceremony for simple/medium tasks.
- **Dependency cooldown (R3):** never add a dependency under the fixed 7-day cooldown;
  `harness-dependency-cooldown.mjs` enforces it via `dependency_cooldown` (operator
  `--approve <name>@<version> --yes` only).
- **Provider fallback (R7):** a failed lane is re-dispatched ONCE on the alternate
  allowed model (`opencode-go/deepseek-v4-flash` ⇄ `opencode-go/glm-5.3-flash`), logged to
  `docs/harness/quality/fallback-events.json`; exhaustion → `blocked:
  provider-fallback-exhausted`. The scheduler never auto-downgrades.
- **Multimodal (R6):** images stay in the main session; a `glm-5.3-flash` lane takes an
  image only when its role permits it and the capability check passes; a text-only
  `deepseek-v4-flash` lane returns `blocked: multimodal-unsupported` (no text-only
  fallback, in-main handling).
- **Model matrix (R8):** scheduler = `openai-codex/gpt-5.6-luna:xhigh` (the orchestrator
  equivalent) ONLY; every other subagent = `opencode-go/deepseek-v4-flash:max` or
  `opencode-go/glm-5.3-flash:max`; normal `glm-5.3`/DeepSeek Pro never assigned.

## WHAT NOT TO DO

Never reference or reach for any of these — they do not exist in omp:

- background subagent stubs
- status polling loops
- `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`
- `start-parallel.ps1` / `start-serial.ps1`
- the background subagent stub / serial fallback

If you catch yourself wanting to poll for a subagent's status, stop: results
auto-deliver, and `hub op:"jobs"` gives a non-blocking snapshot.

## TRACE CORRELATION FOR PARALLEL LANES

The native trace adapter (see `skill://harness-omp`, T04) is **process-scoped**:
one OMP process carries one `trace_id`. A lane dispatched in the same process as
the scheduler shares that trace — its `agent_start`/`agent_end` emit `run` records
(parent `session`) with `tool` + `model` records underneath; a lane running in a
separate process carries its own `trace_id`. After reconciling a wave, run

```
node ~/.omp/agent/scripts/harness-trace.mjs --verify --root .
```

and use `--read` to check which lane run ids joined the stream and which carry a
different trace id — correlation is surfaced, never invented. `hub op:"jobs"`
snapshots are coordination state, not trace records, and never substitute for
`--verify`. A dangling-parent warning means a lifecycle record (phase/gate/judge/
handoff) has not been appended yet: surface the gap, do not fabricate the join.

## Cross-links

- `skill://prevc-workflow` — where Execute/Validate live in the lifecycle.
- `skill://harness-quality-gate` — the measured gate + risk router.
- Agents: `scheduler` (owns Execute-phase fan-out), `test-runner` (one per
  shard), `code-reviewer` + `architecture-reviewer` (concurrent reviewers).
