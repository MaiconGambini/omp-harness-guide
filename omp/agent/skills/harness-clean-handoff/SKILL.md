---
name: harness-clean-handoff
description: Generic harness clean handoff. Use before ending a session to update evidence, progress, handoff, run discovered verification, and show git status.
---

# Harness Clean Handoff

Run before closing a session. Incomplete work still needs handoff.

## Exit Checklist

1. Identify active task from `feature_list.json`, the active `agent-os/specs/*/` spec
   (its `tasks.md` and `tickets/` — each ticket is a v1.1 lane; note which tickets
   landed and which remain open), `.specs/features/*/tasks.md`, or session todo.
2. Collect actual evidence, blockers, and next steps. Suggest a status transition to
   PREVC, but do not write `passing`, `blocked`, or any lifecycle status.
   **Evidence means the gate report**, not a description of one: the metric table from the newest
   `docs/harness/quality/*.json`, the router tier, and the commit trailer if one was produced.
3. Prepare progress notes for `.specs/project/STATE.md`, `docs/harness/progress.md`,
   or `agent-progress.md` when present. PREVC decides whether and how to persist
   lifecycle status.
4. Create or update `docs/harness/session-handoff.md` when a harness docs folder
   exists or the user approves creating it.
5. Run discovered startup verification only when PREVC includes it in the approved
   handoff scope. If skipped, record why.
6. Run `git status` in git repos.

## Handoff Sections

Use these headings:

- `## Verified Now` — include the metric table verbatim from the gate report, plus the tier. A
  handoff that says "tests pass" makes the next session re-derive trust from zero.
- `## Changed This Session`
- `## Broken Or Unverified` — every **red** metric *and* every **`unavailable`** metric. An
  unmeasured metric is unverified work; reading it as fine is the failure mode this section exists
  to catch.
- `## Decisions Made` — including any threshold change, with its `quality-decisions.md` reason.
- `## Next Best Step`
- `## Commands` — the gate command and mode used, the report path, and the commit trailer if one
  was produced, so the next session can reproduce rather than believe.

## Refine Phase Fallback

If this session ran no scheduler, and this session's primary agent is the scheduler, run the Refine phase
here and present its proposal in the handoff report. Produce a report only — never write the ledger,
the refine log, or any standards file.

Both conditions matter. **Only `scheduler` holds `task: "allow"`**; every subagent is `task: "deny"`, so
in any other primary the refiner cannot be dispatched at all. And the handoff's own contract says "return
a handoff report only; do not mark feature state, infer confirmation, or claim completion" — so it must
not write either.

## Rules

- Invoke this as a PREVC handoff subroutine after PREVC and the operator determine
  the lifecycle outcome.
- Do not transition lifecycle state, accept evidence, or declare completion. PREVC
  owns those decisions.
- When invoked directly, return a handoff report only. Do not persist lifecycle
  status or infer operator confirmation.
- When the Refine fallback fires, write nothing — present the proposal in the report only.
- Do not claim done if verification failed or was skipped without reason.
- A stale or missing gate report is recorded under `## Broken Or Unverified`, never omitted.
- Do not require `.specs/project/STATE.md`; use alternate progress files.
- Do not require `init.ps1`; use the discovered startup command.
- Never delete files during handoff.
