# Harness Agent OS Specs

Create and maintain Agent OS specs for meaningful work.

## When to Create a Spec

Create `agent-os/specs/YYYY-MM-DD-HHMM-slug/` when work is medium or larger, crosses subsystems, changes architecture, or needs durable decisions.

Small one-file fixes may use progress state only.

## Files

- `spec.md` — requirements and acceptance criteria
- `plan.md` — implementation approach and files
- `tasks.md` — WIP=1 task list
- `verification.md` — commands and expected evidence
- `decisions.md` — dated decisions and tradeoffs

## Workflow

1. Slug the feature name.
2. Create directory under `agent-os/specs/`.
3. Copy templates from `~/.config/opencode/templates/agent-os/specs/_template/`.
4. Replace template markers with concrete requirement IDs, scope, commands, and decisions.
5. Link the spec from `feature_list.json` or progress state.

## Rules

- No placeholders after planning.
- Acceptance criteria must be observable.
- Verification must name commands or manual checks.
- PREVC Judge evaluates against these files when present.
