---
name: harness-context-budget
description: "Audits token load from skills, plugins, and MCP tools. Use when checking context window overhead before major tasks. Do NOT use for system architecture docs auditing (use harness-context-layer)."
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
