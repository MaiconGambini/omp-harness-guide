---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go. Runs interactive (HITL) by default, or autonomous (AFK) when driven by a scheduler.
---

Run a `/grilling` session, using the `/domain-modeling` skill.

## Modes

**HITL (default)** — interview the operator live, one question at a time. Use when a human is driving and reachable.

**AUTO (AFK)** — self-driven, no live operator. Use when a scheduler (e.g. `spec-lead` inside an authorized run) needs the plan sharpened without pausing. In this mode:

- Do **not** pause to ask the operator. Walk each branch of the decision tree and, for every question, **take your own recommended answer** — resolving it from the codebase, existing ADRs, `CONTEXT.md`, and stated requirements.
- Record every resolved question as a decision, and label the ones you answered on assumption as **assumptions**, so the plan review can see them.
- Write ADRs and glossary entries via `/domain-modeling` exactly as in HITL — the docs are the same, only the questioner changed.
- Escalate to the operator **only** on a genuine blocker: an ambiguity no source can settle, a decision that is hard to reverse *and* has no defensible default, or a scope change. Everything else resolves autonomously. (Same halt bar as an autonomous run.)

The mode is chosen by the caller; absent an explicit AUTO instruction, run HITL.
