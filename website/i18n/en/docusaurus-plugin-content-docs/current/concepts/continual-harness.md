---
sidebar_position: 4
---

# Continual Harness

```text
prepare → plan → execute → validate → judge → refine → confirm
```

This page is about the continual loop: how review feedback becomes a
structured signal that can guide later runs.

The loop turns review feedback into a structured signal that can guide later
runs. It does not claim that an agent "learns by itself": the loop is
project-local, measured through configured signals, and bounded by
permissions and human confirmation.

## Behavior loop

```text
ticket and risk
  -> manifest and active rules by ownership
  -> lanes execute and run local gates
  -> scheduler runs full gate and risk router
  -> reviewers return typed findings
  -> scheduler validates and writes the findings window
  -> code commit and Judge
  -> Refine proposes, without writing or voting
  -> awaiting_confirmation shows literal text
  -> approved rule lands separately
  -> next run injects the rule into matching lanes
```

The gate measures the artifact, not agent reputation. Metrics and policies are
declared in `agent-os/quality-thresholds.json`; learned-loop controls live
under its `learned_rules` key. A missing value, stale report, or missing
roster is a fail-closed gap.

## Typed findings

Reviewers return records; they do not write files. The scheduler validates
them and is the sole writer of the project's findings files (`<run>.json`).

| Class | Meaning |
|---|---|
| `rule_violation` | A written rule was broken; requires an exact pointer |
| `operator_note` | The operator recorded a manual correction |
| `blind_spot` | A real issue has no applicable rule yet |
| `defect` | A defect a gate should have caught |
| `nit` | A preference with no rule behind it |

The envelope also binds each finding to its gate, roster, tier, and lane
manifest. Without that context, zero may mean no review rather than no
problems.

## Ledger and injection

`agent-os/learned-rules.json` keeps project active rules, conflicts, and
retired rules. Allowed targets and enforcement levels are validated; a prose
rule cannot accidentally become blocking.

During Planning, the scheduler matches active rules to each lane's ownership
and pastes only relevant rules into its prompt inside an untrusted-data
fence. Injection closes the loop: a rule affects behavior only when it
reaches the capability making the change.

## Refine

Refine runs after Judge and before `awaiting_confirmation`. It reads the
findings window, gate report, ledger, and adherence history and returns a
bounded proposal per component.

Refine:

- cannot edit, run shell, delegate, or access external directories;
- does not appear in the Judge payload or verdict;
- cannot approve its own proposal;
- cannot change governing numbers;
- never proposes edits to `~/.omp/agent/**` or the harness scripts —
  proposals target the project's `agent-os/standards/` only, inside
  `targets_allowed`;
- writes nothing on its own.

```text
/refine
```

To record a manual fix as evidence:

```text
/refine --note "<what I fixed by hand>"
```

Literal text, target, source findings, and refutation mechanism are shown to
the operator. Rules that can block and high-risk effects preserve human
approval. A rule lands after code as a separate change because the rulebook
is inside the gate source hash.

## Guardrails

The loop is bounded by mandatory guardrails:

- **Red-team quickcheck (R1)** — every reconciled lane diff is scanned by
  `harness-redteam-scan.mjs` (deterministic, read-only). Findings or a
  `sampling`/`full` tier escalate to a specialized security review.
- **Dependency cooldown (R3)** — a dependency first seen fewer than 7 days
  ago blocks the full gate; only explicit operator approval releases it.
- **Provider fallback (R7)** — a provider failure re-dispatches the lane
  exactly once on an allowed alternative; exhaustion blocks with
  `blocked: provider-fallback-exhausted`. The scheduler role is never
  auto-downgraded; every event is recorded in the fallback log.
- **Model matrix (R8)** — model roles are fixed by configuration (`config.yml`
  `modelRoles`); the scheduler role is reserved, and the remaining roles
  resolve to allowed alternatives.
- **Multimodal (R6)** — images stay in the main session; a lane without
  multimodal capability returns `blocked: multimodal-unsupported` instead of
  converting or dropping the image.

## Permissions

Agent-specific permissions are declared in configuration, and the read-only
roster backs them. Reviewers return results to the scheduler; `refiner` and
`rule-verifier` have no write path. These policies reduce blast radius but
are **not** an operating-system sandbox. Configuration changes require a
restart before they affect the Oh My Pi process.

## Tracing

The OMP-native trace adapter (`~/.omp/agent/extensions/harness-omp-trace.ts`)
subscribes to the **native extension event bus** (`pi.on`) and persists the
runtime spine into a project-local trace file (`trace.jsonl`):

- `session_start` / `session_switch` / `session_shutdown` → session records.
- `agent_start` / `agent_end` → one run record per agent turn.
- `tool_execution_start` / `tool_execution_end` → tool records carrying only
  the tool name and call id — never tool input or result bodies.
- `agent_end` → one model record with usage/cost/context exactly as the
  runtime supplied them (explicit `unavailable` when missing).

Every record passes the shared contract module (`harness-trace.mjs`) at
append time: stable-ID validation, redaction, SHA-256 chaining, size/event
bounds, and unavailable semantics. The stream is audit evidence only after
`--verify` passes.

**What tracing is NOT:** raw session JSONL, history/agent databases, the
statusline, and ad-hoc shell history are never tracing. Only native extension
events and explicit `--record` appends through the shared contract produce
stream records.

## What is live

- Deterministic findings and ledger schemas and validation.
- Measured gates, risk routing, and fail-closed behavior.
- Manifest, injection, typed-review, and Refine contracts.
- Native OMP event tracing with redaction and hash chaining.
- Automated tests for deterministic paths.

## What is not live or proven

- Automatic prose-rule activation is not active; the auto-activation control
  ships off.
- Live model acceptance is not complete; there is no measured-gain or
  full-flow acceptance claim.
- Changed configuration does not affect an already-running Oh My Pi process
  without a restart.
- Findings measure what reviewers detect; they do not prove complete recall.
- Refine proposes an improvement but cannot guarantee it is correct or
  accepted.

See [Use Cases](../adoption/use-cases) to select the right workflow.
