---
name: harness-verify-audit
description: "Audit generated verification skills for drift against source. Use when verifying that executable skills match code. Do NOT use for creating new skills (use harness-verify-bootstrap)."
---

# Harness Verify Audit

Read-only drift auditor for generated verification skills.

## Statuses

Returns exactly `clean`, `changed`, or `blocked` (JSON includes `status`). Renamed, selector-changed, and deleted mapped features are reported as source observations. `clean` and `changed` require one source reader and one live pass per mapped feature; otherwise result is `blocked`.

## Safety

Auditor never edits target or product code. It compares target contract and source observations against generated `feature-map.json`.

## Usage

`node scripts/harness-verify-audit.mjs --target <repo> --skill <generated> --json`.
