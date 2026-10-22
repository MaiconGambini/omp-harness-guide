---
name: harness-status
description: "Check harness git state, PREVC phase, and guardrails. Use when verifying readiness before commits or after resuming. Do NOT use for quality thresholds (use harness-quality-gate)."
---

# Harness Status

Run:

```powershell
node .opencode/scripts/harness-status.mjs
```

Use the result before handoff, before PRs, and when resuming a session.

## Lifecycle & Blocked State Interpretation
- A non-green gate is a loop signal, not a work stopper. It never persists `blocked` automatically.
- The `blocked` phase is entered strictly by an explicit decision (`transition --to blocked`) or a Judge receipt verdict `block`.
- When `blocked`, coding can resume directly via `node scripts/harness-prevc-state.mjs transition --to execute` without re-authorizing planning.
