---
name: harness-cursor-parity
description: Use when keeping Cursor aligned with the OpenCode harness without duplicating the durable PREVC state state or exposing Cursor MCP secrets.
---

# Harness Cursor Parity

Cursor is a **peer**, not a secondary surface: it runs the full lifecycle
(PREVC, the measured quality gate, refine) standalone, without OpenCode in the
runtime loop. Both surfaces are fed by one source of truth — `opencode.jsonc` —
via `scripts/export-to-cursor.mjs` (`--install` to `~/.cursor`, `--check` to
detect drift). Edit the harness in one place; re-export to propagate.

Check:

- `.cursor/skills/` has only minimal portable harness skills.
- Cursor MCP inventory does not print secret values; no secrets in `.cursor/mcp.json`.
- Permissions are enforced via hooks (`permission-matrix.json` +
  `hooks/permission-policy.mjs`), not fields on `.cursor/agents/*.md` — Cursor
  agent files support only `name` + `description` + prompt.
- Handoff/status can be read by both OpenCode and Cursor (same repo artifacts).

See `docs/harness/cursor-peer.md` for the build/install/check runbook and honest
caveats (serial-degraded scheduler, restart-required for hooks/rules reload).
