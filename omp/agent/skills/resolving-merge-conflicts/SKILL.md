---
name: resolving-merge-conflicts
description: Resolve an in-progress Git merge or rebase conflict by tracing each side's intent and verifying the resulting integration.
---

# Resolving Merge Conflicts

1. Inspect the merge or rebase state and list each conflicting file.
2. Read the commits, diffs, specs, and relevant code for both sides. Establish the intent before editing.
3. Resolve each hunk by preserving both intents where compatible. When they conflict, choose the behavior matching the merge goal and record the trade-off.
4. Do not invent unrelated behavior or discard changes for convenience.
5. Run the project's discovered typecheck, tests, and formatter. Fix regressions caused by the integration.
6. Complete the merge or rebase only after verification succeeds. Never abort a merge or rebase without explicit user direction.

Use `harness-clean-handoff` if the conflict cannot be completed in the current session.
