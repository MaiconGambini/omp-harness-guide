---
name: harness-agent-permissions
description: "Configures least-privilege tool permissions for agent roles. Use when defining allowed tools and bash permissions for roles. Do NOT use for vulnerability scanning (use harness-security-scan)."
---

# Harness Agent Permissions

Default matrix:

| Role | read | edit | bash | task | external_directory |
|---|---|---|---|---|---|
| Planner | allow | deny | ask | allow | deny |
| Generator | allow | scoped | ask | allow | deny |
| Evaluator | allow | deny | allow targeted checks | allow | deny |
| Security reviewer | allow | deny by default | ask | allow | deny |

Integrate this matrix into `/harness-standards` and `/prevc` before delegation.
