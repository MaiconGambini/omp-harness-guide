---
name: harness-architecture-checks
description: Propose executable architecture boundary checks from actual docs and layout. Use when preventing cross-layer imports, secret leaks, or boundary drift.
---

# Harness Architecture Checks

Generate checks only from evidence. Do not write scripts without approval.

## Inputs

1. `docs/ARCHITECTURE.md` if present.
2. Root instructions and project docs.
3. Directory layout and package boundaries.
4. Existing lint, test, or CI checks.

## Candidate Checks

- Frontend must not import backend internals.
- Browser/client code must not import server-only secrets.
- Route handlers call services, not database directly.
- Domain code does not depend on UI.
- Shared packages do not import app-specific layers.

## Output

```markdown
## Architecture Check Proposal
Boundary observed: ...
Evidence: file/path or unknown
Proposed check: ...
Script target: scripts/check-architecture.ps1 | scripts/check-architecture.sh | existing linter
False-positive risk: ...
Approval needed before writing: yes
```

## Rules

- If architecture docs are missing, propose `harness-context-layer` first.
- Prefer inspection commands before custom scripts.
- No generated script without explicit approval.
- Checks must be explainable to the next agent.
