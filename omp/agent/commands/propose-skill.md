---
name: propose-skill
description: "Scan session and command history for recurring processes and propose or activate a generated skill."
---

Run `node ~/.omp/agent/scripts/harness-process-skill.mjs` (OpenCode:
`node "$env:USERPROFILE\.config\opencode\scripts\harness-process-skill.mjs"`).

- `--auto --root <project> --history-db <file> --sessions <file>`: run one bounded read-only
  scan from the project's SQLite `history` table and normalized session JSONL. SQLite is opened
  read-only. Every JSONL line must be valid and contain `ts` and `cmd`; malformed lines fail with
  their line number. Both sources are normalized to `{ts, cmd}` before recurrence detection.
  Repeated sequences write one inert proposal under
  `agent-os/skills-proposals/<slug>/SKILL.md`. This command never polls, watches, or writes to
  `skills/`.
- `--scan <history-file>`: scan a JSON array of `{ts, cmd}` entries or `{entries: [...]}`. A
  command sequence repeated at least 3 times within 14 days writes one inert proposal under
  `agent-os/skills-proposals/<slug>/SKILL.md` marked `generated: true`.
- `--activate <slug>`: the single operator command that validates the candidate (frontmatter,
  naming, generated flag, and no executable fields) and only then installs it into
  `skills/<slug>/` where the OMP exporter picks it up. Refuses invalid candidates.
- `--list`: list existing proposals.

Zero auto-activation by design. `--auto` and `--scan` never write into `skills/`.
