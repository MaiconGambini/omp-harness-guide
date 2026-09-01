---
name: harness-initializer
description: Non-mutating harness-init audit for any repo. Inspect Entry, Context, State, Feedback, Evaluation, and Skills layers; write nothing without approval.
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
4. **State** — find `feature_list.json`, `.specs/features/*/tasks.md`, `.specs/project/STATE.md`, `docs/harness/progress.md`, or `agent-progress.md`.
5. **Feedback** — find `init.ps1`, `init.sh`, `make check`, package scripts, test/build/lint commands, or none.
6. **Evaluation** — find `agent-os/judges/`, project rubrics, CI checks, or none.
7. **Skills** — find project `.opencode/skills/harness-*` and global harness skills.
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

Then propose a minimal bootstrap plan and ask approval before writing anything.

## Rule

Do not assume `init.ps1`, `feature_list.json`, `.specs/project/STATE.md`, or `zharnessengineering/` exist.
If a discovered startup command fails, make that the first fix unless the user asks for an audit-only report.
Context layer gaps are non-blocking — flag them but continue the audit.
