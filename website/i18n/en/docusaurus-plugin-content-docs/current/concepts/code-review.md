---
sidebar_position: 8
---

# Code Review with Agents

Code review in agent-assisted engineering is not about asking a model to "read the diff and say if it looks good." The harness implements a layered, continuous review architecture combining deterministic checks, competing model families, localized domain rules, and convergence limits.

The primary goal of this review model is to protect the most scarce resource in the process: human attention. Instead of forcing developers to hunt for formatting quirks or trivial checks, agents and the Quality Gate eliminate mechanical flaws before the pull request ever reaches the operator.

## Review layers

Inspired by large-scale agentic software engineering practices, the review pipeline is organized into sequential layers:

| Layer | Mechanism | Responsibility |
|---|---|---|
| **L1 — Pre-PR verification** | Local linters, compilers, and test suites | Require real executable output before opening code for external inspection. |
| **L2 — Competing model family reviewer** | Independent model (e.g., GPT Luna vs Gemini Flash) | Evaluate logic under an alternative model architecture to eliminate the author's blind spots. |
| **L3 — Domain REVIEW contract** | `docs/review.md` with cataloged critical defects | Direct reviewer attention toward defects that historically escape in that specific domain. |
| **L4 — Standardized PR template** | Four mandatory sections in the Pull Request | Declare Tier, Test Evidence, Rollback Procedure, and Human Owner. |
| **L5 — Convergence ceiling** | `fixLoop.maxAttempts` defaulted to 3 | Cap back-and-forth cycles between author and reviewer, notifying the operator upon exhaustion. |
| **L6 — "Bug becomes test" rule** | Regression test with proven fail-before evidence | Prevent bugfixes from closing without durable, automated regression coverage. |
| **L7 — Flow metrics** | `harness-flow-metrics` reading Git history | Measure real reverts, follow-up fixes, and throughput without vanity metrics. |

## Reviewers from competing model families

When the same model both writes a patch and reviews its own diff, it tends to replicate the same false assumptions and overlook identical edge cases.

To break error correlation, the harness assigns distinct model families in `config.yml`:

```yaml
modelRoles:
  implement: google-antigravity/gemini-3.8-flash
  review: openai-codex/gpt-6-luna:high
```

The reviewer receives the complete diff, PR intent, and repository context without inheriting the implementer's conversational history. It examines the change independently and returns concrete, code-anchored findings.

## Domain REVIEW contracts (`docs/review.md`)

Unconstrained AI reviewers generate excessive noise: purely stylistic debates, trivial refactoring suggestions, or restatements of personal preferences.

The harness mitigates this through local domain guidelines (`docs/review.md` or `docs/review-<area>.md`):

1. **What the gate already covers:** Explicit instructions for the reviewer not to flag typing, formatting, or basic coverage already checked by linters.
2. **Domain-critical defects:** A checklist of critical defect classes in that subsystem (for instance: unhandled transactions, unsynchronized concurrency, queries lacking tenant filters, or authorization flaws).
3. **Strict evidence guidelines:**
   - Every substantive finding must specify an exact `file:line` pointer.
   - The review comment must begin with a count of findings by severity.
   - A strict ceiling of 3 minor comments (*nits*); purely cosmetic items must be discarded.

## Standardized Pull Request template

Every governed repository installs `.github/pull_request_template.md` structured in five mandatory sections following the canonical order:

```markdown
## O que muda e por quê
<!-- 2 a 4 linhas explicando o que muda e o motivo. Link da task no Linear ou issue. -->

## Tier
<!-- Regra de bolso: se hesitar, suba um tier. -->
- [ ] auto — docs, copy, config sem lógica
- [ ] sampling — baixo risco, revisão por amostra
- [ ] full — auth, pagamento, banco, migração, segurança, dados de cliente

## Testing
<!-- Comando exato executado e saída real. Para bugfix: teste de regressão que falhava antes e passa depois (ou justificativa escrita). -->

## Como reverter
<!-- Passo exato de reversão: git revert <sha>, feature flag, rollback de migração. Sem reversão automática exige justificativa. -->

## Responsável
<!-- Nome do humano que responde por este merge. O agente não é responsável. -->
```
Requiring these sections ensures immediate traceability: any engineer inspecting history knows how the code was validated and how to safely revert the commit if production degrades.

## Risk routing and triage

Review depth is determined by the **nature of the change**, not by author seniority:

- `risk:low` — documentation updates or peripheral configuration files.
- `risk:medium` — well-isolated feature additions with unit test coverage.
- `risk:high` — changes touching authentication, financial transactions, database migrations, or harness governance rules.

During task triage (whether via native PREVC planning or an operator triage skill), the mandatory first question before planning is: *"Is this worth building?"*. This is a preliminary check: if the answer is negative or doubtful, delivery begins with an explicit recommendation not to build or to redefine product scope, making code planning optional; the question does not close the task automatically.

## Criteria-based auto-confirmation (auto-confirm)

For low-risk tasks or routine maintenance pipelines, PREVC supports criteria-based auto-confirmation (`auto-confirm`), configured in `agent-os/prevc-autonomy.json`:

```json
{
  "schemaVersion": 1,
  "autoConfirm": false,
  "maxRevisionCycles": 3
}
```

By default, auto-confirmation is **strictly disabled** (`autoConfirm: false`) across all projects. When explicitly opted into by the operator, autonomous completion requires, cumulatively:

1. **Autonomy policy:** `agent-os/prevc-autonomy.json` file present with `autoConfirm: true` and valid `maxRevisionCycles` (integer from 0 to 10).
2. **Revision budget:** total `revision_requested` cycles in history does not exceed `maxRevisionCycles` (if exceeded, auto-confirm is refused with "revision budget exhausted, operator required").
3. **Judge receipt:** recorded receipt with verdict `accept` and an empty `blockingCriteria` list.
4. **Fresh green Quality Gate:** full-mode gate report with passing verdict, matching the exact `sourceHash` of the inspected working tree.
5. **Approving reviews:** at least one review in the project's PREVC review files and receipts written after the latest validate cycle carrying `Verdict: APPROVE` (and no line with any other verdict).
6. **Session handoff:** regular `session-handoff.md` present and fresh (written after the current `awaiting_confirmation` cycle).

If any of these conditions fails, auto-confirmation is refused immediately (*fail-closed*) and escalated to the human operator.

## Fix loop convergence ceiling

In automated workflows, an AI author and AI reviewer can enter infinite, circular revision loops.

The harness sets `fixLoop.maxAttempts` to a default of **3 attempts**. Exhaustion of this ceiling is strictly **advisory**:

- When attempts reach or exceed the ceiling, the `validate -> execute` transition is still accepted by the orchestrator.
- The orchestrator emits an advisory notice `fix-loop-exhausted (N/max)` alongside detailed diagnostics of the failing metric.
- Work continues forward; nothing aborts destructively or stops automatically. The human operator receives the diagnostic to decide whether to intervene, redirect the plan, or confirm delivery.
## Bug becomes a test

No defect fix (*bugfix*) is marked complete without a durable automated test demonstrating the problem:

1. **Fail-before proof:** Prior to patching, the test runs against the baseline code, verifying that the assertion fails with the expected error.
2. **Resolution:** The implementation patch is applied.
3. **Pass-after proof:** The same test runs again, proving it now passes cleanly with exit code 0.

This discipline ensures fixed bugs do not silently regress in future releases.

## Flow metrics

Rather than tracking lines of code or raw commit counts as vanity metrics, `harness-flow-metrics.mjs` extracts objective indicators directly from Git history:

```bash
node ~/.omp/agent/scripts/harness-flow-metrics.mjs --root <project> --since 28d --json
```

The command returns a JSON object with real schema fields:
- `status`: execution status (`ok`).
- `root`: resolved root path of the inspected repository.
- `since`: time window evaluated (default `28d`).
- `definition`: explicit formula for `fixFollowups`.
- `weeks`: array of weekly buckets with commit counts, reverts, fixFollowups, and percentage ratios.
- `totals`: period totals (`commits`, `reverts`, `fixFollowups`, `revertRatio`, `followupRatio`).

It is critical to understand that `fixFollowups` serves as a **proxy** (defined as a commit with subject starting with fix, hotfix, or bugfix that touches a file modified by another commit in the preceding 7 days); it **does not prove** post-merge regression, but signals rework in unstable modules.
## Illustrative review verdict example

The reviewer's verdict is not saved in the policy document `docs/review.md` (which catalogs area rules and critical defect classes), but is returned in the agent's review response and recorded in the project's PREVC review files and receipts.

Illustrative example of a structured review output:

```markdown
# Review: Financial Reports Endpoint

Findings: 0 blockers, 1 warning, 1 nit

## Warnings
- src/services/reports.ts:42 — Payment query lacks an explicit tenant_id filter. Risk of cross-account data leakage if session objects are reused.

## Nits
- src/services/reports.ts:89 — Variable `tempTot` can be renamed to `accumulatedTotal` to match module conventions.

Verdict: REQUEST CHANGES
```

## What this proves and what it does not prove

### What it proves
- That code underwent scrutiny by an independent model family focused on critical defects for that area.
- That the PR contains reproducible test execution data and explicit rollback procedures.
- That bugfixes include automated tests that demonstrably failed prior to patching.
- That the revision loop adheres to bounded convergence limits without burning unbounded tokens.

### What it does NOT prove
- It does not prove that the feature should have been built in the first place: product direction and business value remain human judgments ("you land it, you own it").
- It does not guarantee the absence of deep conceptual or architectural vulnerabilities uncataloged in repository review docs.
- Agent approvals never supersede the authority or responsibility of the human operator landing the merge.

## Next step

Explore the automated metrics backing this review process in [Quality Gate](./quality-gate) or learn how the harness learns from feedback in [Continual Harness](./continual-harness).
