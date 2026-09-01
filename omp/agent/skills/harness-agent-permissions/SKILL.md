---
name: harness-agent-permissions
description: Use when assigning safe permissions to OpenCode/Cursor agents and subagents based on planner, generator, evaluator, reviewer, or security roles.
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
