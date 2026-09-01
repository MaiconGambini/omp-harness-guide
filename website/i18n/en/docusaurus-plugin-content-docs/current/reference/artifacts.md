---
sidebar_position: 3
---

# Artifacts

Files that the harness reads and writes during the lifecycle.

## Installation (global)

| Path | Purpose |
|---|---|
| `~/.omp/agent/config.yml` | Public global configuration |
| `~/.omp/agent/extensions/` | Native runtime extensions |
| `~/.omp/agent/scripts/` | Node utilities (`harness-*.mjs`) |
| `~/.omp/agent/commands/` | Global commands (`/prevc`, `/planner`, ...) |
| `~/.omp/agent/skills/` | General and defensive skills loaded lazily |
| `~/.omp/agent/agents/` | Source-agent definitions |
| `~/.omp/agent/docs/` | Global harness context |
| `~/.omp/agent/omp-port-manifest.json` | Public package inventory and hashes |

## State (per project)

| File | Path | Purpose |
|---|---|---|
| `AGENTS.md` | root | Project rules, entry points |
| `feature_list.json` | root | WIP=1 source of truth |
| `STATE.md` | `.specs/project/` | Durable progress, blockers, decisions |
| `progress.md` | `docs/harness/` | Durable progress, blockers, next action |
| `session-handoff.md` | `docs/harness/` | Transfer between sessions |
| `sprint-contract.md` | `docs/harness/` | Scope, AC, verification plan |
| `prevc.json` | harness state area | Durable PREVC lifecycle phase (written by `harness-prevc-state.mjs`) |
| `<timestamp>.json` | Judge-receipts area | Judge receipts (one per run) |
| `<run>.json` | findings area | Append-only typed-findings window bound to the gate |
| `trace.jsonl` | trace area | Redacted, hash-chained runtime spine (via `pi.on` events) |
| `refine-log.md` | `docs/harness/` | Proposals, rejections, and Refine-cycle decisions |
| `quality-thresholds.json` | `agent-os/` | Metrics, risk routing, and governing keys |
| `learned-rules.json` | `agent-os/` | Project-local ledger of active, conflicting, and retired rules |
| `specs/<slug>/` | `agent-os/` | Spec, plan, verification, decisions, and tickets |

## Feature list

Each feature in `feature_list.json` uses the fields below:

| Field | Description |
|---|---|
| `id` | Unique identifier |
| `priority` | Execution order |
| `area` | Project area |
| `title` | Short name |
| `user_visible_behavior` | What the user/agent sees when it works |
| `dependencies` | IDs of features that must be completed first |
| `status` | `not_started`, `in_progress`, `passing` or `blocked` |
| `verification` | Command that proves it works |
| `evidence` | Real output captured after verification |
| `notes` | Additional information |

## Status rules

- Only ONE feature `in_progress` at a time (WIP=1).
- `passing` requires `evidence` filled with real output.
- `blocked` requires the exact cause in the `evidence` field.
- No feature `in_progress` with unresolved dependencies.

## Lifecycle artifact ownership

- `harness-prevc-state.mjs` is the sole writer of the lifecycle phase.
- Reviewers return records; the scheduler validates and writes each findings
  file once.
- Refine reads findings and the ledger but writes neither.
- Approved rules land after code as a separate change because the rulebook
  remains inside the gate source hash.
- Governing numbers live in `quality-thresholds.json`, never in prose.
