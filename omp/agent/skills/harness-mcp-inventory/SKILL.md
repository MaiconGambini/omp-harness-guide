---
name: harness-mcp-inventory
description: Use when auditing MCP servers across OpenCode, project MCP files, and Cursor mcp.json for drift, duplication, and inline secret headers.
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
