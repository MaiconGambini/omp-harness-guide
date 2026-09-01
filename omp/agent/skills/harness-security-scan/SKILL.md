---
name: harness-security-scan
description: Use when scanning OpenCode/Cursor harness skills, agents, plugins, MCP configs, scripts, and goal memory for secrets, prompt injection, Unicode, and dangerous shell patterns.
---

# Harness Security Scan

Run from the repository root:

```powershell
node .opencode/scripts/harness-security-scan.mjs
```

Rules:

- Never print secret values; report file/key locations only.
- Treat skills, agents, plugins, MCP configs, scripts, and goal memory as supply-chain surfaces.
- WARN on inline secrets, hidden Unicode, prompt-injection HTML comments, and dangerous shell/network commands.
- Convert CRITICAL findings into a remediation plan before editing.
