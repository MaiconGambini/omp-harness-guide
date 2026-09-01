---
name: harness-readable-workspace
description: Audit fresh-session readability. Verify a new agent can orient from repo files alone. Use when harness is modified or a new session fails to orient.
---

# Harness Readable Workspace

Use when the harness has been modified or a session fails to orient correctly.

## Fresh-Session Readability Test

Simulate a new session with zero chat history. Read only repo files. Answer each:

1. What does this system do?
2. How is it organized?
3. How do I install and start it?
4. How do I verify it works?
5. What is the current progress?
6. What is the next task?

If any question is unanswerable from files: that is a harness gap.

## Common Gaps and Fixes

| Unanswerable Question | Root Cause | Fix |
|---|---|---|
| What does this system do? | No `AGENTS.md` summary | Add 2-3 line summary to `AGENTS.md` top |
| How do I start it? | No startup commands documented | Add Quick Start section to `AGENTS.md` |
| What is current progress? | `STATE.md` stale or placeholder | Update Current Active Work section |
| What is the next task? | No `in_progress` feature | Set one feature to `in_progress` in `feature_list.json` |
| What decisions were made? | No decisions log | Add to `STATE.md` Decisions Log |

## Output

For each of the 6 questions:
`[question] | answerable: yes/no | source file | gap if no`

Then propose one fix per gap. Ask user to approve before writing.
