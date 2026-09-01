---
name: harness-security-scan
description: "Scan repo harness, MCPs, and config for secret/supply-chain risks."
---

Run `node ~/.omp/agent/scripts/harness-security-scan.mjs` from the repo. Summarize PASS/WARN/FAIL without printing any secret values. If WARN/FAIL, propose remediation before editing anything. Reference `skill://harness-security-scan` for interpretation.
