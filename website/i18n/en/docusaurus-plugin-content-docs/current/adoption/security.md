---
sidebar_position: 3
---

# Security

The security section documents the boundaries, safeguards, and mandatory guardrails of the Oh My Pi Harness, distinguishing active protections from operating system boundaries. It is essential to understand both what the harness actively protects and what it deliberately does not — real security resides in the planning and pre-approval phase, not in reactive automated interception.

## What the harness protects

- **Durable state and traceability:** Decisions, blockers, executed commands, and session handoffs are persisted in Git files; no critical information lives solely in volatile chat memory.
- **Declarative per-role permissions:** Every agent role operates under a strict tool allowlist; dangerous operations (package mutations, out-of-boundary directories, uncataloged commands) require explicit human confirmation.
- **Fail-closed verification:** The Quality Gate fails immediately if any required metric crashes, encounters an unknown scanner exit code, or returns corrupted output (`unavailable`). Crashing tools are never masked as zero defect counts.
- **Staging quarantine and secret scrubbing:** Artifacts destined for second-brain vaults (Obsidian) pass through a dedicated quarantine folder with secret scanning (via public `harness-security-scan.mjs` or local operator scripts outside the public distribution) and privacy sanitization before synchronization.
- **Strict telemetry redaction:** Native event tracing (`harness-omp-trace.ts`) captures only tool names and execution identifiers, suppressing full payloads, request bodies, and environment variables.

## Mandatory guardrails

### Mandatory red-team audit in full tier
For initiatives classified as tier `full` (or `high` risk), `harness-prevc-state.mjs` compulsorily blocks the `judge -> refine` transition unless accompanied by an approved security audit report bound to the same `sourceHash` containing the line `Red-team: N tentativas` (with N >= 3) and `Verdict: APPROVE`. In the operator's workspace, these exploit attempts against the modified surface are executed by the operator's security agent; the public distribution does not include the offensive `security-analyst` subagent.

### Executable security contract (`authz_controls`)
The `harness-security-contract --run --metric` command evaluates protected routes, authentication token integrity, and multi-tenant isolation rules (RLS/IDOR) declared in `agent-os/security-contract.json`. If a required backing service (e.g., a test PostgreSQL database) is unreachable, the command yields `unavailable` and the gate fails compulsorily.

### Delivery preflight without live deployment (`delivery_config`)
The `harness-delivery-preflight --config-check --metric` script validates the structural syntax of Docker Compose files, Dockerfiles, and cloud manifests before merge, preventing broken deployment configurations from reaching production without triggering slow builds or deployments.

### Dependency cooldown
The `harness-dependency-cooldown.mjs` script operates strictly offline: it tracks newly added packages in project lockfiles against the local `agent-os/dependency-ledger.json` file. Any dependency whose first observed appearance (`firstSeen`) is less than 7 days ago blocks the full Quality Gate, unless the operator explicitly approves it via `--approve <package>@<version> --yes`.

## Terminal safeguards and guardrails

In the public distribution, protection against dangerous shell commands relies on preventive governance: strict per-role tool allowlists, human command inspection during the planning phase, and scans via `/harness-security-scan`. In private environments, operators may complement this protection with local runtime extensions (such as `harness-security-guard.ts`, maintained locally outside the public package) to intercept:

- Indiscriminate recursive removals (`rm -rf /` or equivalents).
- Destructive unbounded Git commands (`git reset --hard`, `git clean -fdx`).
- Remote reverse shell invocations.
- Direct curl/wget pipe-to-shell constructs (`curl | bash`).
- Unauthorized access attempts targeting system certificate stores or private key paths.
## Secret handling

Never record private keys, passwords, API tokens, or personal identifying data in specification files, test reports, session handoffs, or governance notes.

When documenting confidential service integrations, use redacted phrasing: *"Integration credentials loaded via environment secret store; values not exposed"*.

## What the harness does NOT protect

### No operating system sandboxing on the host
Tool allowlists and guardrails substantially reduce mistake potential, but they **do not constitute an OS-level security boundary**. Any command approved in the plan and executed in the terminal runs with the local user's host privileges.

### Does not replace human review and approval
The Judge evaluates objective criteria and reviewers inspect code under domain contracts, but final delivery authority remains the sovereign responsibility of the human operator.

### Guardrails do not substitute for engineering judgment
Pattern scanners intercept recognized syntax, but cannot discern subtle malicious business logic or missing tenant boundaries. **The primary security defense is the developer carefully reading the execution plan prior to running `/prevc run`**.

## Best practices

1. **Review the complete plan before approval:** Confirm every command and declared file target corresponds strictly to the requested feature.
2. **Run `/harness-security-scan` regularly:** Detect excessive permissions or accidentally committed credentials early.
3. **Store secrets in environment variables or local vaults:** Never commit tokens into version-controlled files.
4. **Scrutinize unfamiliar packages:** Verify repository reputation and release age before adopting new libraries.
