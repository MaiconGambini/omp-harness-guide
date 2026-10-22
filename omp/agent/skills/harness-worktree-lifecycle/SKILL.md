---
name: harness-worktree-lifecycle
description: "Inspect git worktrees for dirty, stale, or safe states. Use when coordinating multiple parallel worktrees. Do NOT use for creating worktree branches (use using-git-worktrees)."
---

# Harness Worktree Lifecycle

Run from the repository root:

```bash
node .opencode/scripts/harness-worktree-lifecycle.mjs
```

Rules:

- Never delete a worktree automatically.
- Dirty worktrees are `keep-salvage-first`.
- Clean worktrees may be pruned only after explicit user approval.
- Use this before overlapping parallel implementation work.
