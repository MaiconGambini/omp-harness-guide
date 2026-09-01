---
name: harness-status
description: Use when checking harness readiness: git state, PREVC phase, handoff presence, security scan command, and context budget command.
---

# Harness Status

Run:

```powershell
node .opencode/scripts/harness-status.mjs
```

Use the result before handoff, before PRs, and when resuming a session.
