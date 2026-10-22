---
name: harness-verify-bootstrap
description: "Bootstrap executable verification skills for a target repository. Use when generating automated end-to-end verification suites. Do NOT use for auditing existing skills (use harness-verify-audit)."
---

# Harness Verify Bootstrap

Executable boundary for target-repository verification.

## Contract

`node scripts/harness-verify-bootstrap.mjs inspect --target <repo> --json` reports repository, run, drive, observe, isolate inventories. Missing answers appear in `gaps`; commands, selectors, and side effects are never inferred.

`bootstrap --target <repo> --output <dir>` executes launch, doctor, one mapped feature, evidence, and cleanup in staging. Final skill directory is written only when evidence survives cleanup. `--dry-run` is supported and performs no mutation.

Generated skill order: Launch, Doctor, Drive, Evidence, Cleanup, Helpers. Generated CLI commands: `launch`, `doctor`, `drive`, `evidence`, `cleanup`; mutating commands accept `--dry-run`, read commands accept `--json`.

## Evidence

Fixture proof is required. Failed drive exits nonzero and removes staging/final output. Errors name next action.
