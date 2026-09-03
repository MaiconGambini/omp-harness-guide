---
sidebar_position: 3
---

# First Session

This guide shows how to use the harness in a project for the first time. It
assumes a base Oh My Pi installation and the public `omp/agent/` package copied
to `~/.omp/agent`; cloning `website/` installs only site dependencies and does
not enable the runtime.


## 1. Audit the project

Inside Oh My Pi, run:

```text
/harness-init
```

This command inspects the project without modifying anything. It looks for:

- Root instructions (`AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`).
- Progress and feature state.
- The startup and verification commands.
- The evaluation/Judge layer, harness skills, security posture, context
  budget, and agent permissions.

The result is a gap report — what exists, what is missing, and what would
be created.

## 2. Install the full package (optional)

If the project is new or you want to standardize it:

```text
/harness-bootstrap
```

The bootstrap proposes the full package with explicit confirmation. It
detects the project stack and shows each file as **create**, **merge**, or
**skip** before writing.

## 3. Start the session

Every productive session begins with:

```text
/harness-session-start
```

It reads the global context in `~/.omp/agent/docs/context.md`, the durable
PREVC lifecycle (`harness-prevc-state.mjs inspect --json`), the feature
list, the previous handoff, and the discovered verification command. At the
end, it declares the active task:

```text
Active task: feat-001 — Health endpoint. AC: curl /health returns 200.
```

## 4. Do work with PREVC

For meaningful work:

```text
/prevc prepare Add health check endpoint
```

`/prevc prepare` starts **Prepare**, which groups `prepare` and `plan`. After
explicit approval, use `/prevc run`: OMP enters **Execute**, dispatches
independent lanes with `task` in `tasks[]`, and coordinates messages through
`hub` when the plan allows it. **Validate** groups `validate` and `judge`;
**Confirm** groups `refine` and `confirm`.

The seven steps remain in this order:

```text
prepare → plan → execute → validate → judge → refine → confirm
```

The phase is durable: each transition is written by
`harness-prevc-state.mjs` to the project's lifecycle file and survives across
sessions.

## 5. End the session

At the end, always run:

```text
/harness-clean-handoff
```

It records what was done, what broke, and the next action, and it carries
the durable lifecycle phase into the handoff. The next session reads these
files and knows exactly where to continue.

## Next step

Read [Why a harness?](../concepts/why-a-harness) to understand the
problem the harness solves.
