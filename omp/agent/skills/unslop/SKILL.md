---
name: unslop
description: "Detect and remove AI-generated prose clutter and decorative markdown. Use when linting docs or agent-os specs. Do NOT use for drafting original prose (use writing)."
---

# Unslop

Use `scripts/harness-prose-lint.mjs` as canonical detector. Scope is `docs/**` and
`agent-os/specs/**`; commit messages and `docs/harness/session-handoff.md` are out of scope.
The linter skips fenced Markdown code, excludes `review-findings.md` and any `evidence/`
directory, and reports one finding per tell per line.

## Procedure

1. Run `node scripts/harness-prose-lint.mjs --json <path>...` on changed documentation.
2. Fix long dashes, curly quotes, mid-sentence colons, title-case headings, and decorative emoji.
3. If a literal is intentional, add `prose-lint-ok: <reason>` on that same line. Keep reason
   specific; suppression is line-local and never suppresses neighboring lines.
4. For gate measurement use `--metric`; its final line is `count=<number>` and exit status remains
   zero so observe-mode metrics can report findings without blocking.

Do not seed adherence or learned-rule records from prose findings. Thresholds and promotion
remain governed by `agent-os/quality-thresholds.json` and `agent-os/quality-decisions.md`.
