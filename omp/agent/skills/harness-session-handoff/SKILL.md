---
name: harness-session-handoff
description: Create or update docs/harness/session-handoff.md. Use to record verified evidence, changes, blockers, decisions, next steps, and commands.
---

# Harness Session Handoff

Write transfer state so the next session resumes from files, not chat.

## Target File

`docs/harness/session-handoff.md`

If missing, propose creating it and ask approval.

## Required Sections

```markdown
## Verified Now
## Changed This Session
## Broken Or Unverified
## Decisions Made
## Next Best Step
## Commands
```

## Content Rules

- Verified Now: exact commands and outputs, not summaries only.
- Changed This Session: files and why they changed.
- Broken Or Unverified: failing checks, skipped checks, unknowns.
- Decisions Made: decision plus reason.
- Next Best Step: one concrete next action first.
- Commands: startup, validation, focused checks, and recovery commands.

## Output

Before writing, show the proposed handoff content if the file is missing or structurally different.

Never hide incomplete work. Record blockers with exact causes.
