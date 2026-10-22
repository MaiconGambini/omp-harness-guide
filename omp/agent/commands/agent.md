---
name: agent
description: "Switch or view active agent persona in OMP (e.g. /agent spec-lead, /agent clear)"
---

Adopt or inspect the active agent persona: $ARGUMENTS

If the argument is empty:
Report the active agent from ~/.omp/agent/active-agent and list available agents in ~/.omp/agent/agents/*.md.

If the argument is "clear" or "reset":
Clear the file ~/.omp/agent/active-agent if it exists, and confirm to the operator that the active agent was reset to default.

Otherwise:
1. Validate that ~/.omp/agent/agents/$ARGUMENTS.md exists. If not, list available agent files in ~/.omp/agent/agents/.
2. Write "$ARGUMENTS" to ~/.omp/agent/active-agent so the statusline widget and session persistently display [$ARGUMENTS].
3. Read ~/.omp/agent/agents/$ARGUMENTS.md and adopt its instructions, role, and capabilities for all subsequent interactions in this session.
4. Confirm to the operator: "Active agent set to: [$ARGUMENTS]".
