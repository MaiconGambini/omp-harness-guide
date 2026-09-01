---
name: capabilities
description: "Detect and report per-model multimodal capabilities (text / text+image)."
---

Run `node ~/.omp/agent/scripts/harness-capability-check.mjs` (OpenCode:
`node "$env:USERPROFILE\.config\opencode\scripts\harness-capability-check.mjs"`).

It probes the runtime model catalog when reachable, falls back to the frozen static
table (research.md facts), and persists `docs/harness/capabilities.json` with a 24 h
cache. Facts: `deepseek-v4-flash` is text-only; `glm-5.3-flash` and `gpt-5.6-luna` accept
text+image.

Dispatch rule: image-bearing work stays in the main (scheduler-equivalent)
session by default; a `glm-5.3-flash` lane may receive an image only when its role
explicitly permits it and this probe passes; a text-only subagent returns
`blocked: multimodal-unsupported` — never strip, silently convert, or send images
through a text-only fallback.
