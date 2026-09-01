---
name: harness-cleanup-scanner
description: Report cleanup candidates without deleting. Use to find debug files, temp reports, stale TODOs, orphan artifacts, large untracked files, and old handoffs.
---

# Harness Cleanup Scanner

Scan and report only. Cleanup requires approval.

## Checks

- Debug files and scratch scripts.
- Temporary reports and generated artifacts.
- Stale TODO/FIXME notes with no owner.
- Orphan harness artifacts.
- Large untracked files.
- Old handoffs or duplicate progress files.

## Output

```markdown
## Cleanup Scan
Category | Path | Evidence | Risk | Recommended action
---|---|---|---|---
```

## Rules

- Do not delete by default.
- Do not modify files during scan.
- Separate safe cleanup from risky cleanup.
- Include exact paths and why each item is suspicious.
- Ask approval before any cleanup action.
