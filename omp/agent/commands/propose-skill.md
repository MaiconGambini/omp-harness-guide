---
name: propose-skill
description: "Scan session/command history for recurring processes and propose (or activate) a generated skill."
---

Run `node ~/.omp/agent/scripts/harness-process-skill.mjs` (OpenCode:
`node "$env:USERPROFILE\.config\opencode\scripts\harness-process-skill.mjs"`).

- `--scan <history-file>` — a JSON array of `{ts, cmd}` entries (or `{entries: [...]}`).
  A command sequence repeated ≥ 3 times within 14 days writes one INERT proposal under
  `agent-os/skills-proposals/<slug>/SKILL.md` marked `generated: true`. Proposals are
  never auto-installed, never auto-activated, never dispatched.
- `--activate <slug>` — the single operator command that validates the candidate
  (frontmatter, naming, generated flag, no executable fields) and only then installs it
  into `skills/<slug>/` where the OMP exporter picks it up. Refuses invalid candidates.
- `--list` — existing proposals.

Zero auto-activation by design: `--scan` never writes into `skills/`.
