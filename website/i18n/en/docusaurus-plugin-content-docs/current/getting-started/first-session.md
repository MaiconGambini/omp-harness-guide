---
sidebar_position: 3
---

# First Session

This guide shows how to use the harness in a project for the first time. It
assumes a base Oh My Pi installation and the public `omp/agent/` package copied
to `~/.omp/agent`; cloning `website/` installs only site dependencies and does
not enable the runtime.

![Session start and automatic project profiling workflow](/omp-harness-guide/img/diagrams/inicio-de-sessao.png)
*Project profile detection, brain loading, and session initialization.*


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

## 3. Automatic onboarding and session start

On the first turn of any session opened inside a repository, the harness detects the technical stack, identifies the project profile, and consults the second-brain registry (Obsidian + graphify). Architectural rules and project preferences are loaded into operational memory automatically before processing any request.

To formalize the working session and align context:

```text
/harness-session-start
```

This command reads current state, the feature list (`feature_list.json`), the previous handoff, and configured verification commands. Then, it declares the active task along with its acceptance criteria:

```text
Active task: feat-001 — Health endpoint. AC: curl /health returns 200.
```

## 4. Assemble specialist roles with `/maestri-team` (optional)

If your environment includes Maestri for multi-agent canvas coordination, assemble the specialist team for the project:

```text
/maestri-team --dry-run
```

The underlying script `harness-maestri-team.mjs` explicitly requires either `--dry-run` or `--apply`. The `/maestri-team` slash command mediates this choice and manages operator consent: invoking it with `--dry-run` (or `preview`) executes only preflight discovery, reporting planned roles without recruiting terminals. Invoking it without `--dry-run` constitutes explicit operator consent to recruit the team and executes the script with `--apply`, provisioning necessary specialists. In subsequent sessions, `--reset` reinitializes reused terminals while preserving tool boundaries and shared history.

## 5. Do work with PREVC

For meaningful work:

```text
/prevc prepare Add health check endpoint
```

`/prevc prepare` starts **Prepare**, which groups `prepare` and `plan`. After
explicit operator approval, `/prevc run` places the runtime into **Execute**,
dispatching independent lanes with `task` in `tasks[]`, and coordinating messages through
`hub` when the plan allows it. **Validate** groups `validate` and `judge`, evaluating
acceptance criteria against a read-only Judge.

**Confirm** groups `refine` and `confirm`:

```text
prepare → plan → execute → validate → judge → refine → confirm
```

In the durable lifecycle state file (`harness-prevc-state.mjs`), this conceptual workflow maps directly to the canonical states: `prepare` → `awaiting_plan_approval` → `execute` → `validate` → `judge` → `refine` → `awaiting_confirmation` → `complete`.

By default, **`autoConfirm` is disabled**: the final transition to completion requires deliberate confirmation by the human operator (`--operator-action confirm`). No agent silently self-confirms. The auto-confirm feature is strictly opt-in and, even when enabled, requires that all critical gate metrics are green and measured.

Each phase transition is durable, recorded by `harness-prevc-state.mjs` in the project state file, surviving restarts or interrupted connections.

## 6. End the session with a clean handoff

At the end, always run:

```text
/harness-clean-handoff
```

It records what was done, what broke, and the next action, and it carries
the durable lifecycle phase into the handoff. The next session reads these
files and knows exactly where to continue.

## What this proves and what it does not

- **What it proves:** that the workflow advances through auditable stages recorded on disk, that onboarding recovers project profile and brain context at initialization, and that wrap-up preserves exact context for the next turn.
- **What it does not prove:** it does not prove that the implemented architecture is optimal nor that test coverage is exhaustive across all production scenarios.

## Next step

Read [Why a harness?](../concepts/why-a-harness) to understand core principles and isolation and continuity components.
