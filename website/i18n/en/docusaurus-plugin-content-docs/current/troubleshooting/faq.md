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

By default, confirmation depends exclusively on the human operator (`--operator-action confirm`) after reviewing evidence and the session handoff file. While the harness supports `autoConfirm` parameterized by objective gate criteria and evals, this capability is strictly opt-in and remains disabled by default.

### "Why is `autoConfirm` disabled by default?"

To prevent premature completions based on weak or incomplete evidence. When agents close tasks without human review, superficial tests or partial mocks can pass unnoticed. Auto-confirm should only be enabled in specific automated pipelines and requires that all critical metrics are measured and green.

### "The gate returned pass with few measured metrics. Does that prove the code is ready?"

No. The gate is a readiness signal, not an absolute guarantee against defects. The gate outputs `Measured: N/M` and raises an explicit warning when fewer than half of the configured metrics were actually executed. A `pass` status with low measurement coverage merely indicates that the few tests that ran did not fail; critical checks may be unavailable or unconfigured.

### "What is the difference between `unavailable`, `not_configured`, and `not_applicable` metrics?"

- **`unavailable`:** the required tool, linter, or test runner was not found in the environment or failed during preflight checks.
- **`not_configured`:** the metric belongs to the harness catalog, but the project has not declared thresholds or rules for it in the quality configuration.
- **`not_applicable`:** the stack router detected that the technology is not present in the project (for example, checking TypeScript rules in a purely Python repository).

### "What happens when the fixLoop is exhausted?"

The self-correction loop has a default limit of three attempts (`fixLoop.maxAttempts = 3`). If attempts are exhausted without resolving the failure, the harness generates a detailed warning and logs remaining errors in the progress file. The session is not aborted destructively: control returns to the operator to inspect root causes and adjust the plan.

### "Does the `/maestri-team` command consume many sessions or tokens?"

The `/maestri-team` command only provisions specialist role definitions across dedicated terminals. You can run `/maestri-team --dry-run` to audit roles and tools without any cost. Each specialist acts only when dispatched for a specific lane in their area. In case of context accumulation in idle terminals, `--reset` reinitializes roles while preserving shared workspace history.

### "How does context reset work and when should I use it?"

Context reset clears in-session conversation history while preserving durable on-disk state (progress files and PREVC lifecycle state). It should be triggered when context noise accumulates during debugging or when token budgets are reached. Because the handoff preserves the next action, the new session picks up immediately without rediscovering the project.

### "Can I use the harness in a project without Git?"

No. Git is an essential prerequisite. PREVC lifecycle tracking, gate diff inspections, worktree lane isolation, and file-change audits rely on the Git object tree to bound scope and compute flow metrics.
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
