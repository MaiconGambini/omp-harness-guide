---
name: harness-progress-log
description: Manage generic harness progress files. Use when updating STATE.md, docs/harness/progress.md, or agent-progress.md while preserving blockers and decisions.
---

# Harness Progress Log

Abstract project progress across common files.

## File Priority

1. `.specs/project/STATE.md`
2. `docs/harness/progress.md`
3. `agent-progress.md`

If none exists, propose creating `docs/harness/progress.md` and ask approval.

## Required Sections

```markdown
## Current Active Work
## Verification Status
## Blockers
## Decisions Log
## Next Best Action
```

## Update Rules

- Preserve existing blockers and decisions.
- Append new decisions with date and reason.
- Record verification as actual command output or explicit not-run reason.
- If work is blocked, include exact failing command or missing dependency.
- Keep progress readable by a fresh session.

## Output Before Writing

```markdown
Progress file: ...
Sections present: ...
Sections missing: ...
Proposed update: ...
Approval needed: yes/no
```

Do not create a new progress file without approval.
