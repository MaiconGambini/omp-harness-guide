---
sidebar_position: 1
---

# Frequently Asked Questions

## Installation

### "npm install failed"

Check that Node.js 20+ is installed:

```powershell
node --version
```

If it is below 20, update it at [nodejs.org](https://nodejs.org).

### "Oh My Pi does not recognize the commands"

Close and reopen Oh My Pi. The configuration in `~/.omp/agent` is loaded
only at startup.

### "Can I install on top of my current configuration?"

No. The installation is clean — back up your `~/.omp/agent` before
installing. If what you have is a legacy harness layout, `omp:migrate`
replaces only managed files, with byte-exact backup of collisions and
preservation of unmanaged files.

### "What is `omp:check` and what is it for?"

It is the parity check: it compares the installed tree in `~/.omp/agent`
with the manifest and reports drift. Run it after every install or
migration.

### "What does omp:check report on a clean install?"

```json
{ "ok": true, "drift": [] }
```

Any missing or hash-drifted managed path is listed in `drift` and is a
failure.

## Usage

### "What does WIP=1 mean?"

Only one feature can be `in_progress` at a time. This prevents abandoned
parallel work and keeps focus. During a session the `todo` tool holds the
single active unit.

### "Do I need the sprint contract for every task?"

No. Simple tasks (1-3 files, obvious scope) use fast mode. The sprint
contract is for complex or ambiguous features.

### "What happens if I skip the handoff?"

The next session does not know what was done. You lose continuity and need
to re-explain the context. The handoff is mandatory at the end of every
session, even if the work has not finished — and a missing handoff blocks
the `complete` transition when the phase requires it.

### "Can I work on more than one feature at the same time?"

No. WIP=1 is a core rule. If you discover adjacent work, add it as
`not_started` and continue on the active feature.

### "Why did my PREVC transition fail with exit 2?"

Exit 2 means the transition was refused: an illegal lifecycle edge, an
invalid state or receipt, or a missing, stale, or unreadable gate. Ordinary
refusals write nothing. The one exception is the red-gate guard:
`validate → judge` against a red full gate persists `blocked` with the
metric/value/threshold blocker and still returns exit 2.

### "Who confirms that the work is finished?"

No one but the operator. The final transition
(`awaiting_confirmation → complete`) requires `--operator-action confirm`
and an existing `docs/harness/session-handoff.md`. No agent self-confirms.

## Errors

### "The project baseline fails but the project works"

Record the error as a blocker. Fix it before creating new features. The
harness should not operate with a broken baseline.

### "The documentation site build fails"

Broken links or missing pages cause a build failure. Check the error
message — Docusaurus indicates the file and the problematic link.

### "`omp:check` reports drift"

Read the listed paths. Unmanaged files (yours) are expected and preserved —
drift is only a problem when a **managed** path diverged from the manifest;
in that case, reinstall with `omp:install`.

### "I lost the session state"

If the handoff was not done, check whether the progress file and
`docs/harness/session-handoff.md` have enough information. If not, you will
need to reconstruct the context manually — the harness has no automatic
recovery of sessions without a handoff.

### "The trace does not show what I typed"

That is by design. The redacted envelope records only native events (session,
run, tool name + call id, model) — never input/output bodies, messages,
session JSONL, local databases, or shell history.
