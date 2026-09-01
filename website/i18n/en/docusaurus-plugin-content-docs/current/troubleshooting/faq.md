---
sidebar_position: 1
---

# Frequently Asked Questions

## Installation

### "What do I need to install?"

Clone the repository, review `omp/agent/omp-port-manifest.json`, run the
validator, and copy `omp/agent/*` into a clean `~/.omp/agent` directory. The
site is not an OMP runtime dependency.

### "`npm ci` failed"

`npm ci --prefix website` installs dependencies for local site development
only. Check Node.js 20+ and the `website/` lockfile; this is not required to
copy the OMP core.

```powershell
node --version
```

### "Oh My Pi does not recognize the commands"

Close and reopen Oh My Pi. The configuration in `~/.omp/agent` loads only at
startup.

### "Can I install over my current configuration?"

No. The installation is clean — rename `~/.omp/agent` to
`omp-agent-backup` before copying the package. There is no automatic merge.

### "What is `omp-port-manifest.json` for?"

It is the public inventory with hashes for distributed files. Validate the
checkout with `node scripts/validate-public-subset.mjs --check-manifest`; there
is no `omp:check` command that compares a local installation.

## Usage

### "What does WIP=1 mean?"

Only one work unit can be `in_progress` at a time. This prevents abandoned
parallel work and keeps focus. The `todo` tool holds the active session unit.

### "Do I need a sprint contract for every task?"

No. Simple tasks (1-3 files, obvious scope) use fast mode. The sprint contract
is for complex or ambiguous features.

### "What happens if I skip the handoff?"

The next session does not know what was done. You lose continuity and must
re-explain the context. Handoff is required at the end of every session, even
when work is unfinished.

### "Can I work on more than one feature at the same time?"

No. WIP=1 is a core rule. If you discover adjacent work, add it as
`not_started` and continue on the active feature.

### "Why did a PREVC transition fail with exit 2?"

Exit 2 means the harness refused the transition: illegal lifecycle edge,
invalid state or receipt, missing/stale/unreadable gate, or failed verification.
Read the error before retrying.

### "Who confirms that work is finished?"

No one but the operator. The final transition
(`awaiting_confirmation → complete`) requires `--operator-action confirm` and
an existing `docs/harness/session-handoff.md`. No agent self-confirms.

## Errors

### "The project verification fails but the project works"

Record the error as a blocker in the progress file. Fix it before creating new
features. The harness should not operate with a broken baseline.

### "The documentation site build fails"

Broken links or missing pages cause a build failure. Check the error message —
Docusaurus identifies the file and problematic link.

### "I lost the session state"

If the handoff was not done, check whether `docs/harness/progress.md` and
`docs/harness/session-handoff.md` contain enough information. Otherwise,
reconstruct the context manually; the harness has no automatic session
recovery without a handoff.

### "The trace does not show what I typed"

That is by design. The redacted envelope records only native events (session,
run, tool name + call id, model) — never input/output bodies, messages, session
JSONL, local databases, or shell history.
