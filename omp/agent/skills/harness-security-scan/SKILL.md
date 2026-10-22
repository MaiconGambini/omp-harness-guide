---
name: harness-security-scan
description: "Scan harness configs, skills, and MCPs for secrets and prompt injections. Use when auditing tooling and plugin security. Do NOT use for per-lane diffs (use harness-redteam-check)."
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
