---
sidebar_position: 3
---

# Security

Security boundaries of Harness Oh My Pi. It is important to understand both
what the harness protects and what it deliberately does not protect —
security lives in the planning and approval phase, not in automatic blocks.

## What the harness protects

- **Durable state** — blockers, decisions, and handoffs are recorded in
  files. No state information lives only in the chat memory.
- **Declarative permissions** — configuration defines rules for editing,
  command execution, and access to external directories. The fallback rule
  for mutating Bash commands is **ask**.
- **Dangerous-command guard** — `harness-security-guard.ts` blocks
  recognized patterns of: recursive removal, `git reset --hard` and
  destructive variants, forced `git clean`, remote shells, download followed
  by execution, and access to sensitive paths.
- **Three-layer verification** — every result is validated before being
  marked as complete.
- **Traceability** — each change is associated with a feature, with evidence
  and approval recorded.
- **Redaction** — the trace adapter persists only metadata: native event
  name, tool name, and tool call id. Raw session JSONL, history/agent
  databases, the statusline, and message bodies are never read or stored.
  Records are SHA-256 chained; the stream is audit evidence only after
  `--verify` passes.
- **Secret scanning** — `/harness-security-scan` scans the repo harness,
  MCPs, and configuration for secret and supply-chain risks and summarizes
  PASS/WARN/FAIL without printing values.
- **Red-team quickcheck (R1)** — every reconciled lane diff is scanned with a
  deterministic, read-only scan (`harness-redteam-scan.mjs`); findings or a
  `sampling`/`full` tier escalate to a specialized security review.
- **Dependency cooldown (R3)** — a dependency first seen fewer than 7 days
  ago blocks the full gate; only explicit operator approval releases it.
- **Security contract (R2)** — `agent-os/security-contract.json` declares
  the project's tenant-isolation and authorization evidence paths; the gate
  requires the contract's presence and the existence of the declared
  evidence (`authz_controls`). Without a contract, the gap is named
  `unavailable` — never a pass.
- **Public-subset validation** — a manifest and CI check reject excluded
  families, private evidence, and secret-shaped text from the public tree.

## Permission policy (asks for approval)

Explicit approval is required for:

- Git push.
- Package mutation.
- Deploy.
- External directory requests.

In the continual loop, `refiner` and `rule-verifier` are read-only: they
cannot edit, run shell, delegate, or access external directories. Reviewers
do not write findings either; the scheduler validates and writes them.
Configuration changes require a restart before they affect the Oh My Pi
process.

## Logs and retention

The trace adapter keeps **redacted**, hash-chained records with bounded
retention (prune drops records older than 90 days). Logs help with
diagnosis; they do not prove that an objective was completed correctly.

## Secrets

Never include credentials, tokens, personal data, or sensitive payloads in:
goals, evidence, session handoff, trace records, or governance documents.
When you need to record a sensitive fact, use a redacted description — for
example: "integration token present and loaded by the secret store, never
the value".

## What the harness does NOT protect

### There is no operating-system sandbox

Permission policies reduce risk, but they are **not** an operating-system
security boundary. An approved command run in the shell has full access to
the system. The harness never claims OS isolation.

### Does not replace human review

The Judge evaluates the work against objective criteria, but the final
confirmation still depends on the operator. The harness reduces the risk of
premature completion — it does not eliminate the need for review.

### No application authorization proof

The harness checks that a project declares its tenant-isolation and
authorization evidence paths, and that the declared evidence exists. It does
**not** prove that an application's authorization is correct — applications
are outside this repository, and a missing declaration is a named gap, never
a pass.

### The guard does not cover everything

The security guard blocks *recognized* patterns, but it is not infallible.
Real security still lives in the planning and approval phase: review every
command in the plan before approving.

## Best practices

1. **Review the plan before approving.** Every command listed in the plan
   will be executed — read every line.
2. **Keep the configuration under version control** and review the
   permissions before sharing it.
3. **Do not store tokens or credentials in configuration files.** Use
   environment variables.
4. **Run `/harness-security-scan` periodically** to detect exposed secrets
   and excessive permissions.
5. **Remember that the repository is public** — do not commit anything that
   should not be visible to anyone.
