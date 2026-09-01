---
name: harness-worktree-lifecycle
description: Use when parallel agents or multiple worktrees may be involved; reports clean, dirty, stale, and safe cleanup recommendations without deleting files.
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
