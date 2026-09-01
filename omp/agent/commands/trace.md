---
name: trace
description: "Inspect the OMP native event trace: verify the hash-chained stream, read recent records, or append lifecycle records through the shared T01 contract."
---

The OMP trace adapter (`~/.omp/agent/extensions/harness-omp-trace.ts`, installed by the
exporter) subscribes to the **native OMP extension event bus** and persists the runtime
spine into `docs/harness/traces/trace.jsonl` under the project root:

- `session_start` / `session_switch` / `session_shutdown` → `session` records.
- `agent_start` / `agent_end` → one `run` record per agent turn (parent `session`).
- `tool_execution_start` / `tool_execution_end` → `tool` records (parent `run`),
  carrying only the tool name and call id — never tool input or result bodies.
- `agent_end` → one `model` record with the model identity plus usage/cost/context
  exactly as the runtime supplied them (explicit `unavailable` when missing).

Every record passes the shared contract module (`~/.omp/agent/scripts/harness-trace.mjs`)
at append time: stable-ID validation, redaction, SHA-256 chaining, size/event bounds, and
unavailable semantics. The stream is audit evidence **only after `--verify` passes**.

## Verify the stream

```
node ~/.omp/agent/scripts/harness-trace.mjs --verify --root .
```

A clean report prints `"ok": true` with zero integrity errors. Hash-chain breaks,
truncated writes, or unparseable lines fail closed (exit 2) and refuse further appends
until repaired; dangling parent links are surfaced as correlation-gap warnings, never
silently dropped.

## Read recent records

```
node ~/.omp/agent/scripts/harness-trace.mjs --read --limit 20 --root .
```

## Bounds and retention

```
node ~/.omp/agent/scripts/harness-trace.mjs --prune --root .
```

Prune drops records older than 90 days and re-chains the survivors deterministically.

## Append lifecycle records (phases, gates, findings, reviews, Judge, handoff)

The adapter captures the runtime spine automatically. Lifecycle records are appended by
their owning harness commands via the same contract:

```
node ~/.omp/agent/scripts/harness-trace.mjs --record '<json>' --root .
```

The JSON must carry stable `trace_id` / `run_id` / `session_id` values (use the IDs
returned by `--read`), an `entity` with a known type (`session|run|lane|tool|phase|gate|
finding|review|judge|handoff|model`), and an optional `parent`. Malformed or missing
correlation IDs are refused with a non-zero exit and nothing is written.

## What this is NOT

- Raw session JSONL, history/agent databases, the statusline, and ad-hoc shell history
  are **never** tracing. Only native extension events and explicit `--record` appends
  through the shared contract produce stream records.
- `hub op:"jobs"` snapshots are coordination state, not trace records.
- A passing status display never substitutes for `--verify`.
