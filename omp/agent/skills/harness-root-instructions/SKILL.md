---
name: harness-root-instructions
description: Audit or draft concise root agent instructions such as AGENTS.md. Use when bootstrap or cleanup needs a 50-200 line router.
---

# Harness Root Instructions

Keep root instructions short, durable, and routing-focused.

## Target Shape

```markdown
## Harness
## Project Summary
## Quick Start
## Verification
## State Files
## Hard Rules
## Links
```

## Audit

1. Read `AGENTS.md` if present. If not, check `CLAUDE.md`, `README.md`, and docs.
2. Count lines. Target 50-200 lines.
3. Identify essential rules: startup, handoff, WIP, verification, security, style.
4. Identify details that belong in docs or skills instead of root instructions.
5. Preserve project-specific constraints and entry points.

## Output

```markdown
## Root Instructions Audit
Current file: ...
Line count: ...
Essential rules preserved: ...
Too detailed / move out: ...
Missing: ...
Proposed replacement outline: ...
```

## Rules

- Do not delete project rules silently.
- Do not replace domain context with generic harness text.
- Ask approval before writing or trimming.
- Treat root instructions as a router, not a full manual.
