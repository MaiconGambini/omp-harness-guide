---
name: harness-standards
description: "Detect stack and load relevant standards + skills."
---

Execute `skill://harness-stack-router`, then `skill://harness-standards-router`. Detect the stack from files before guessing. Load the project's `agent-os/standards/` first, then the global standards templates.

Return: risk profile, validation profile, security standards, check minimums, and the applicable skills for the current task. Do not implement code — produce the standards/skills routing report only.
