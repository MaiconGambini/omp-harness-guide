---
sidebar_position: 1
---

# Why a harness?

```text
prepare → plan → execute → validate → judge → refine → confirm
```

This page explains the problem the harness exists to solve.

Without a harness, Oh My Pi responds to a prompt but does not know what
happened in the previous session, which task was left open, which command
proves a change, or when it should stop.

PREVC addresses this as a common contract. OpenCode is the methodological and
continuity adapter for durable conventions, artifacts, and handoffs; Oh My Pi
is the native engine that supplies `task`, `tasks[]`, `hub`, `todo`, and
runtime-extension capabilities.

## The problem it avoids

| Without Harness | With Harness |
|---|---|
| Each session rediscovers the project | The session reads instructions, state, and handoff |
| Multiple ideas turn into parallel work | WIP=1 keeps a single active unit |
| "Done" is an opinion | Completion requires evidence, a Judge, and operator confirmation |
| An error gets lost in the chat history | The blocker is recorded for the next session |
| Skills and agents accumulate behavior | PREVC controls the lifecycle |

## What the harness answers

Before any significant change, the harness answers:

1. Where am I and what rules does this repository have?
2. What has already been done and what is blocked?
3. What is the single active unit of work?
4. How will I prove that the change worked?
5. Who decides whether the result can be accepted?
6. What does the next session need to read to continue?

## How this is implemented in Oh My Pi

- **State** — the `todo` tool holds the session's WIP=1 unit;
  `harness-prevc-state.mjs` writes the lifecycle phase to a durable project
  file, with a repository-local lock and survival across sessions.
- **Dispatch** — the `scheduler` uses the native `task` mechanism with one
  `tasks[]` wave and coordinates with `hub`; results are delivered
  automatically, with no background stub.
- **Tracing** — `harness-omp-trace.ts` consumes native events from the
  extension event bus (`pi.on`) and writes a redacted envelope, without
  reading message bodies or local databases.

## What the harness does NOT do

- It does not make the agent autonomous.
- It does not replace human review.
- It does not provide an operating system sandbox.
- It does not guarantee code quality; it structures traceability through
  evidence.

## Core principle

The repository is the system of record. State that lives only in the chat
is not trustworthy state.
