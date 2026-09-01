---
sidebar_position: 6
---

# Evidence and Handoff

```text
prepare → plan → execute → validate → judge → refine → confirm
```

This page is about the evidence boundary and the session handoff.

The harness requires that every completion has evidence — "it worked on my
machine" is not enough.

## Verification layers

Before declaring a feature complete, three layers are verified:

1. **Static** — typecheck and lint pass.
2. **Runtime** — the sprint contract's acceptance criteria are observable,
   commands were run, and the output was recorded.
3. **System** — the project's verification command exits with code 0, and
   `feature_list.json` and the progress state reflect the new state.

## The lane evidence envelope

Each lane returns a small, structured terminal envelope:

- status (`completed | blocked | needs_input`);
- files actually written;
- evidence (real command output, not a description);
- failed attempts;
- decision, blocker, and next step.

## Auditable tracing

The native trace adapter (`harness-omp-trace.ts`) records the runtime spine —
sessions, runs, tools, and models — in a redacted envelope. It consumes only
events from the extension bus (`pi.on`): `session_start`, `session_switch`,
`agent_start`, `tool_execution_start`, `tool_execution_end`, `agent_end`,
`session_shutdown`. Tool records carry only the tool name and the call id —
never input or output bodies.

The stream is audit evidence only after verification passes:

```powershell
node ~/.omp/agent/scripts/harness-trace.mjs --verify --root .
```

Hash-chain breaks or unparseable lines fail closed (exit 2) and refuse
further appends until repaired.

## Handoff

Every session ends with `/harness-clean-handoff`. It fills in:

- **Verified Now** — what was completed in this session.
- **Changed** — modified files.
- **Broken** — what broke (if anything broke).
- **Next Best Step** — the single next action.

It also carries the durable PREVC phase: a missing handoff is a WARN when
the phase is `awaiting_confirmation` or `complete`, and a `blocked` phase
persists with its blocker text until the operator resolves it.

If the work did not finish, the handoff is still produced — the feature goes
to `blocked` with the exact cause, and the `Next Best Step` says exactly what
to do.
