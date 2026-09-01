---
name: harness-redteam-check
description: Bounded mandatory adversarial check (R1): deterministic diff scan plus operator-approved security review. Run on every reconciled lane diff before the gate/commit; escalate only when the scan fires or the risk tier is sampling/full. Authorized, defensive, own-repo only — deep active exploitation is never part of this loop.
---

# Harness Red-Team Check (bounded, R1)

Every task carries a lightweight adversarial check of its reconciled diff. The ceremony is
bounded: the deterministic scan is ≤ 2 minutes, and the whole red-team step for a
simple/medium task stays under 10 minutes wall-clock. Deep active exploitation remains a
separate, explicitly authorized activity and NEVER enters this loop.

## Procedure

1. **Scan the reconciled diff** with the deterministic quickcheck:
   `node scripts/harness-redteam-scan.mjs --metric`
   (or `node ~/.omp/agent/scripts/harness-redteam-scan.mjs --metric` on OMP; pass
   `--target <diff-file|dir>` when the lane is not in a git repo).
2. **Read the metric contract**: the LAST line is the FAIL count. `0` = clean.
   `status: unavailable` (no number) = named gap — the scan could not run, which is never
   a green.
3. **Route by findings and tier**:
   - Tier `auto` + FAIL count 0 → done. No reviewer dispatch. Total ceremony must fit the
     10-minute budget.
   - FAIL count > 0 → every finding is a real, typed issue class (secrets,
     parent-directory traversal, injection sinks, dangerous commands). Fix the diff,
     re-scan until 0.
   - Tier `sampling`/`full` (risk router) OR scan findings that survive fixing → request
     operator-approved security review over the sampled/full diff (read-only,
     authorized, defensive review of the operator's own repo).
4. **Never weaken the contract**: an unreadable target, a vanished file, or a failed scan
   is reported as findings/unavailable — a partial scan never reads as clean.
5. **Record**: scan output (or the named gap) is evidence in the lane envelope; findings
   escalate to the findings manifest when a review ran.

## Boundaries

- Authorized targets only: the operator's own repository tree and explicit fixtures.
- The scan is read-only and deterministic: no network calls, no mutations, no active
  exploitation patterns, no third-party targets.
- Image-bearing or multi-runtime payloads follow the capability contract
  (`harness-capability-check.mjs`), not this skill.

## Time budgets (measured in the guardrails run)

| Step | Budget |
|---|---|
| Deterministic scan (full gate) | ≤ 2 min |
| Total ceremony, simple/medium task | ≤ 10 min wall-clock |
| Escalation to operator-approved security review | only on findings or tier ≥ sampling |
