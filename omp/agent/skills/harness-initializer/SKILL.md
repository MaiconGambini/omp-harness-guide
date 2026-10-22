---
name: harness-initializer
description: "Conducts a non-destructive audit of harness readiness. Use when assessing a repo before harness setup to inspect conventions. Do NOT use for installing files (use harness-bootstrap)."
---

# Harness Initializer

Audit any project before writing. Propose before creating. Write only with explicit user approval.

## When to Use

Use for `/harness-init`, new projects, missing harness artifacts, or before declaring harness maturity complete.

## Audit Sequence

Run in order from the current project root. Record each result. Do not create files during audit.

1. **Repo root** — locate `.git`, package files, or current directory. If unknown, say unknown.
2. **Entry** — `AGENTS.md`, `CLAUDE.md`, `README.md`, or no root instructions?
3. **Context** — `docs/ARCHITECTURE.md`, `docs/PRODUCT.md`, `docs/RELIABILITY.md` present or missing?
4. **State** — find `feature_list.json`, `.specs/features/*/tasks.md`, `.specs/project/STATE.md`, `docs/harness/progress.md`, or `agent-progress.md`. Also check for `agent-os/learned-rules.json` (learned rules ledger), `agent-os/prevc-autonomy.json` (PREVC autonomy policy: verificar se existe e se `autoConfirm` é `false`; aviso se `true`), `agent-os/project-profile.json` (verificar se `fixLoop.maxAttempts` <= 3), and `docs/harness/session-handoff.md`.
5. **Feedback & Review** — find `init.ps1`, `init.sh`, `make check`, package scripts, test/build/lint commands, or none. Check if `agent-os/quality-thresholds.json` exists and which commands are wired (`bypass_scan`, `skill_lint`, `redteam`). Check if `docs/review.md` exists and contains real critical failures. Check if `.github/pull_request_template.md` (or `docs/pull-request.md`) exists and contains the 4 required sections (`O que muda e por quê`, `Tier`, `Testing`, `Como reverter`). Check if the `review` role in `config.yml` uses a different model family from `implement`.
6. **Evaluation** — find `agent-os/judges/`, project rubrics, CI checks, or none.
7. **Skills & Evolution** — find project `.opencode/skills/harness-*` and global harness skills. Also check for `agent-os/skills-proposals/` (project-local skill proposals mined from failure traces).
8. **Fresh-session test** — answer from files only:
   - What does this repo do?
   - How is it organized? (architecture)
   - How do I start and verify it?
   - What is currently unfinished?
   - What is the next task?
   - What decisions were made and why?

## Output

Produce a table. Then stop. Do not create files.

| Layer | Artifact | Status | Gap | Recommended Fix |
|---|---|---|---|---|
| Review | `.github/pull_request_template.md` | Present/Missing | Missing 4 required sections | Install PR template with required sections |
| Review | `docs/review.md` | Present/Missing | Generic checklist, no real critical failures | Populate real area critical failures |
| Autonomy | `agent-os/prevc-autonomy.json` | Present/Missing | Missing or `autoConfirm: true` | Ensure `autoConfirm: false` |
| Profile | `agent-os/project-profile.json` | Present/Missing | `fixLoop.maxAttempts` > 3 | Set `fixLoop.maxAttempts` <= 3 |
| Roles | `config.yml` | Checked | `review` uses same model family as `implement` | Configure distinct model family for review |

Then propose a minimal bootstrap plan and ask approval before writing anything.

## Rule

Do not assume `init.ps1`, `feature_list.json`, `.specs/project/STATE.md`, or `zharnessengineering/` exist.
If a discovered startup command fails, make that the first fix unless the user asks for an audit-only report.
Context layer gaps are non-blocking — flag them but continue the audit.
