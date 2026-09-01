# Harness Bootstrap

Install a full harness into any project, but only after explicit user approval.

## Full Package

Propose these files:

- `AGENTS.md`
- `feature_list.json`
- `docs/harness/progress.md`
- `docs/harness/session-handoff.md`
- `docs/harness/sprint-contract.md`
- `docs/harness/matt-pocock-tracker.md`
- `docs/harness/refine-log.md`
- `docs/harness/findings/README.md`
- `docs/ARCHITECTURE.md`
- `docs/PRODUCT.md`
- `docs/RELIABILITY.md`
- `agent-os/judges/project-judge.md`
- `agent-os/standards/*`
- `agent-os/specs/_template/*`
- `agent-os/quality-thresholds.json`
- `agent-os/learned-rules.json`
- `agent-os/quality-decisions.md`
- `docs/review.md`
- `docs/pull-request.md`

### Install mapping — quality and continual-harness files

| Global template | Installs to |
|---|---|
| `templates/agent-os/quality-thresholds.json` | `agent-os/quality-thresholds.json` |
| `templates/agent-os/quality-decisions.md` | `agent-os/quality-decisions.md` |
| `templates/docs/review.md` | `docs/review.md` |
| `templates/docs/pull-request.md` | `docs/pull-request.md` |
| `templates/agent-os/learned-rules.json` | `agent-os/learned-rules.json` |
| `templates/docs/harness/refine-log.md` | `docs/harness/refine-log.md` |
| `templates/docs/harness/findings/README.md` | `docs/harness/findings/README.md` |

The thresholds template now carries `learned_rules` (the loop's governing knobs), so the first row
installs the knob block with the thresholds; the ledger itself is the separate row above. The ledger
ships with `rules`/`conflicts`/`retired` empty — no project's rules travel in a global template.

Install the thresholds file **at Phase A**, with every metric `observe` except
`regression_suite` — never carry another project's numbers into this one. After bootstrap,
recommend `harness-project-calibration` so the project derives its own thresholds, high-risk
paths, and tool-availability list from its own layout and history.

## Workflow

1. Detect repo root and existing files.
2. Run `harness-stack-router` to identify stack signals.
3. Run `harness-startup-path` to find startup/verification commands.
4. Compare target files with global templates in `~/.config/opencode/templates`.
5. Print a change plan: create, merge, skip, or preserve.
6. Ask: `Apply this full harness to the current repo? yes/no`.
7. If no: stop with the plan only.
8. If yes: create missing directories, write missing files, and preserve existing files unless user approved overwrite.
9. Run discovered verification if safe.
10. End with next command: `/harness-session-start`.

## Rules

- Never write before confirmation.
- Always install the full package, not minimal modes.
- Preserve project-specific content.
- If a file exists, propose a merge instead of overwriting.
- Do not assume `init.ps1`, `feature_list.json`, or `.specs/project/STATE.md` exist.
