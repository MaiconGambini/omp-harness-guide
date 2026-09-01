---
sidebar_position: 4
---

# Existing Project

How to add the harness to a project that already exists.

## Step 1: Audit

```text
/harness-init
```

The initializer inspects the project without writing files. It discovers:

- Existing instructions.
- Current progress and feature state.
- Verification and startup commands.
- The evaluation/Judge layer, skills, security posture, context budget, and
  agent permissions.

The result is a gap report — what exists, what is missing, each with a
recommended fix.

## Step 2: Install the minimum viable

For small projects, the useful minimum is:

| Artifact | Why it exists |
|---|---|
| Short `AGENTS.md` | Rules, entry points and security |
| `feature_list.json` | WIP and next units |
| Progress file | Blockers and next action |
| Verification command | Objective baseline |
| `session-handoff.md` | Resume on another day |

## Step 3: Or install the full package

```text
/harness-bootstrap
```

The bootstrap proposes the full package with confirmation. It detects the
stack, discovers how to verify the project, and shows each file as create,
merge or skip.

## Step 4: First session with the harness

1. Run the discovered verification command.
2. If it fails, record the error before creating features.
3. Fill in or review the feature list.
4. Ensure WIP=1.
5. Start every session with `/harness-session-start`.

Add the rest of the artifacts only when a real failure mode is observed —
do not create bureaucracy without need.
