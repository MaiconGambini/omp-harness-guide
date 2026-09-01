---
name: harness-context-budget
description: Use when auditing OpenCode/Cursor context load from skills, plugins, commands, MCPs, and always-loaded instructions before large PREVC work.
---

# Harness Context Budget

Run:

```powershell
node .opencode/scripts/harness-context-budget.mjs
```

Use the report to reduce context pressure and attack surface:

- Prefer lazy-loading task-specific skills.
- Prefer scripts over always-on MCPs for audits.
- Keep Cursor parity minimal and do not duplicate `the durable PREVC state` state.
