---
sidebar_position: 2
---

# Pros and Cons

A transparent, balanced evaluation of what the harness delivers alongside its operational costs and engineering trade-offs.

## Pros

### Deterministic cross-session continuity
You close the terminal and return the next morning with full context intact. The PREVC lifecycle phase, recorded blockers, design choices, and structured handoff (`session-handoff.md`) persist on disk. Developers avoid burning tokens and engineering time re-explaining background context to a new agent.

### Cognitive focus discipline (WIP=1)
Restricting execution to a single active task prevents attention dispersion (*context mixing*). A default 3-attempt ceiling on validation macro-loops (`fixLoop.maxAttempts`) prevents infinite back-and-forth loops between author and reviewer, pausing cleanly for human intervention before exhausting budgets.

### Objective evidence and transparent Quality Gate
Verbal assertions from the model carry zero evidentiary value. The Quality Gate evaluates deterministic metrics and transparently displays measurement coverage (**`Measured: N/M`**). Explicit warnings alert reviewers whenever fewer than half of available tooling suites ran.

### Independent review across competing model families
Assigning implementation to one model (e.g., Gemini Flash) and review to a competing architecture (e.g., GPT Luna) eliminates blind spots and shared error correlations from a single provider. Domain contracts (`docs/review.md`) enforce focus on critical bugs while suppressing cosmetic noise.

### Complete traceability and rollback procedures
Standardized Pull Request templates mandate explicit Risk Tiers, executed test commands with captured output, formal rollback instructions (`How to revert`), and designated human ownership. Commit trailers cryptographically bind delivery to the validation report hash (`sourceHash`).

### Governed parallel dispatch and Maestri teams
The orchestrator dispatches parallel lanes with declared file ownership and automated synchronization, enabling specialized agent teams with strictly bounded responsibilities (architecture, testing, infrastructure, security, and review).

## Cons

### Increased token and provider costs
Running independent reviewers on premier models, executing multi-agent team sessions, and evaluating continuous regression suites increases token consumption and provider credential overhead.

### Governance file overhead
The harness introduces specifications in `agent-os/specs/`, gate reports, domain contracts in `docs/review.md`, handoffs, and PR templates. For small single-script utilities, this structure can feel overly bureaucratic.

### Constant operational discipline required
The harness's value depends on strict adherence: honoring WIP=1, capturing real output, and updating handoffs every session. Taking shortcuts or editing files outside PREVC degrades durable state integrity.

### Does not replace product discernment and engineering judgment
The harness enforces process, traceability, and empirical measurement; it does not invent good architecture or ensure business value. Flawed design remains flawed design, even when validated with exhaustive evidence ("you land it, you own it").

### Initial learning curve
Initial adoption requires understanding phase boundaries, command conventions, and configuration files. While the investment pays off on long-term projects, it requires initial team orientation.

### Clean folder installation
No automated merge exists over existing installations. Upgrades require backing up customized configs and copying the clean `omp/agent/` distribution.
