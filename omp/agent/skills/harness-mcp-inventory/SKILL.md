---
name: harness-mcp-inventory
description: "Audits MCP server definitions for drift, duplicates, and secrets. Use when reviewing MCP setups across OpenCode and Cursor. Do NOT use for agent role permissions (use harness-agent-permissions)."
---

# Harness MCP Inventory

Run:

```powershell
node .opencode/scripts/harness-mcp-inventory.mjs
```

Report:

- Config locations.
- Whether MCPs are present.
- Whether inline secret-bearing keys exist.
- Redacted remediation steps only.
