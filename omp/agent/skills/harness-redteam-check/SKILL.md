---
name: harness-redteam-check
description: "Run bounded adversarial scans on reconciled diffs. Use when verifying lane diffs before gates or commits. Do NOT use for full harness secret audits (use harness-security-scan)."
---

# Harness red-team check

Every reconciled lane runs one bounded adversarial check against that lane's changed files or
explicit diff. The runner owns a 120-second scan deadline. The complete red-team ceremony for a
simple or medium task has a 10-minute wall-clock budget. Deep active exploitation is not part of
this loop.

## Procedure

1. Identify the changed files or explicit diff for one reconciled lane. Do not pass the whole
   repository when a lane target is available.
2. Call the bounded runner:

   ```text
   node scripts/harness-redteam-runner.mjs --lane-target <changed-files-or-diff> --deadline-ms 120000 --json
   ```

   On OMP, use the installed runner path. The runner delegates detection to
   `harness-redteam-scan.mjs`, reports `result`, `elapsedMs`, `scannedScope`, and findings, and
   never dispatches an agent.
3. Branch on the typed result:
   - `pass`: at tier `auto`, finish the check without a reviewer. At tier `sampling` or `full`,
     escalate once to the read-only `security-analyst` for the reconciled lane. A wave may use one
     aggregated review instead. Never dispatch once per file.
   - `fail`: block lane reconciliation. Fix every finding, run the same lane target again, and
     keep reconciliation blocked until a subsequent result is `pass` or an approved reviewer
     decision changes the lane state.
   - `unavailable`: block lane reconciliation and record the reason. A timeout, crash, invalid
     target, unreadable target, or malformed scanner response is never a pass.
4. Measure the aggregate wall-clock ceremony from runner start through any required review. If it
   exceeds 10 minutes for a simple or medium task, record a blocking `unavailable` result. Do not
   convert a budget overrun into `pass`.
5. Store the runner result, exact scanned scope, elapsed time, and any review decision in the lane
   evidence. Findings remain tied to the lane that produced them.

## Boundaries

- Authorized targets are the operator's own repository tree and explicit fixtures only.
- The scan is read-only and deterministic. It makes no network calls, mutates no target, and does
  not perform active exploitation.
- Escalation is a scheduler decision. The runner never dispatches an agent.
- Image-bearing or multi-runtime payloads follow `harness-capability-check.mjs`, not this skill.

## Time budgets

| Step | Budget |
|---|---|
| Per-lane deterministic runner | 120 seconds maximum |
| Total ceremony for a simple or medium task | 10 minutes wall-clock maximum |
| Security-analyst escalation | Once per reconciled lane, or once per aggregated wave |
