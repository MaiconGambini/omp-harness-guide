---
name: harness-mcp-inventory
description: "Inventory MCP configuration and detect drift/secrets without exposing values."
---

Run `node ~/.omp/agent/scripts/harness-mcp-inventory.mjs`. Report MCP server names, locations, enabled status when discoverable, and secret-bearing keys redacted (never print secret values). Flag drift or duplication across config sources. Reference `skill://harness-mcp-inventory`.
