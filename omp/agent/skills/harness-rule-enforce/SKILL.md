---
name: harness-rule-enforce
description: "Promote approved prose rules into enforced lint or test tickets. Use when an active ledger rule is approved for automation. Do NOT use for rule discovery (use harness-refine)."
---

# Harness Rule Enforce

Promotion is **one more lane, not out-of-band operator engineering**. Running the linter is already
automatic: `harness-clean-handoff` step 5 runs the discovered startup verification, and
`harness-startup-path` discovers `uv run ruff check .`, `npm run lint`, and equivalents. What remains is
authoring a rule once — ordinary bounded work, which is exactly what a lane does.

This skill's whole output is **a ticket**. It never patches a project's lint rule, thresholds, tests,
or reports itself. The promotion is picked up by the automation that already exists — the project's
existing lint command, discovered by `harness-startup-path` and run by `harness-clean-handoff` — not
by a new runner.

The procedure lives here; the reasoning lives in `docs/harness/continual-harness.md`; the rule record
lives in `agent-os/learned-rules.json`; the governing numbers live in
`agent-os/quality-thresholds.json#learned_rules`.

## 1. Triage — is this rule mechanically checkable?

Not every convention is. The first job is to classify honestly: a rule forced into a linter it does not
fit produces false positives, and false positives get checks disabled.

| Class | Example | Enforcement |
|---|---|---|
| structural / import shape | "server state lives in a store, not a composable ref" | `lint` — ESLint `no-restricted-imports`, a custom rule, or dependency-cruiser |
| forbidden API or pattern | "no bare except", "no `any` in props" | `lint` — Ruff select, ESLint rule |
| file placement / naming | "composables live in `src/composables`" | `lint` — a path rule |
| behavioural invariant | "every provider raises the project's error type" | `test` — a contract test over the module set |
| numeric bar | anything with a threshold | `gate_metric` — and it may not stay `prose` at all, per invariant 13 |
| genuinely judgement | "this is the architectural direction we want" | **stays `prose`, permanently, and is marked so** |

A rule marked permanently-prose is a **first-class outcome, not a failure**. The scheduler records it
in the ledger as `enforcement: "prose"` with `prose_permanent: true` and the reason, and it is
**excluded from `enforced_fraction`'s denominator** — that exclusion is what stops the metric from
creating pressure to mechanise the unmechanisable.

## 2. Emit a ticket, not a patch

Output is a **tracer-bullet ticket** in the current spec's `tickets/` directory
(`agent-os/specs/<slug>/tickets/`), in the standard shape: objective, exact file-ownership set, the
verification command, and the owning capability (`fixer`). It is then dispatched by the scheduler like
any lane.

The ownership set is **exactly the lint config plus its fixture** — nothing else. No thresholds file,
no reports, no test files beyond the fixture that proves enforcement.

```markdown
# <NN> — <rule id>: promote to <lint | test | gate_metric>

**Blocked by:** the ticket that owns the lint config, if it exists.
**Owner capability:** `fixer`
**Files owned:**
- <the lint config file>
- <the fixture reproducing the violation from provenance.source_findings>

## What to build

<objective: enforce the ledger rule, quoting its `text` verbatim and its `anchor`>

## Verify

- <the project's existing lint command, verbatim — discovered by harness-startup-path,
  run by harness-clean-handoff; no new runner>
- the check FAILS on the fixture before the rule exists and PASSES after (fail-first)
- the corrected form passes and clean code is not flagged
```

## 3. The test that must fail first

The promotion's acceptance criterion is fixed and non-negotiable: **a case that fails before the rule
exists and passes after** — the same discipline as invariant 14. A bug fix without a regression test is
not a fix; a rule without a failing case is not enforcement.

The produced lane must deliver:

- the linter/test rule itself
- a fixture reproducing the violation the ledger recorded, drawn from `provenance.source_findings`
- evidence that the check flags the fixture and passes on the corrected form

Without the fixture the promotion is a claim. With it, `enforced_fraction` counts something real.

## 4. Fixed-slot promotion and deletion test

The scheduler treats `max_active_rules_per_target` as a fixed slot count for each target. Count only
rules with `status: "active"` and `enforcement: "lint" | "test" | "gate_metric"`.

- If the target has a free slot, admit the candidate.
- If the target is full, rank the weakest rule by fewest citations, oldest approval, then existing
  linter coverage. Evict that rule only when the candidate is stronger; record `displaced_by` on the
  retirement and admit the candidate in the same confirmed rulebook write.
- If the candidate does not beat the weakest rule, reject it and preserve its reason in
  `agent-os/rejected-rules.json`. Do not exceed the slot count.
- The promotion lane must include a deletion test: the fixture passes with the rule absent, fails with
  the rule present, and passes again after the rule or enforcement is deleted. This proves the check is
  coupled to the promoted rule.

All rulebook mutations use `scripts/harness-learned-rules.mjs`; this skill never adds a second write
path.

## 5. Update the ledger, after the lane lands

`enforcement` moves `prose → lint | test | gate_metric`, and the record gains a pointer to the config
file and the fixture. **The scheduler writes it, after operator confirmation, in the rulebook commit**
— same path and same ordering as any other ledger write (D13: gate → trailer → code commit → rulebook
commit). This skill never writes the ledger, the standards, or the lint config.

## 6. When a promotion fails

If the lane cannot produce a rule that flags the fixture without flagging clean code, it returns
`blocked: not mechanically checkable` and the ledger records `enforcement: "prose"` with
`prose_permanent: true` and the reason. **Do not ship a noisy rule** — a linter people disable is worse
than prose nobody automated.

## Contract — the T11 verify bullets and where this skill satisfies them

| Verify bullet (T11) | Satisfied by |
|---|---|
| a structural rule from the ledger produces a ticket whose ownership set is the lint config plus a fixture | §2 — the ownership set is exactly the lint config plus its fixture |
| the produced lane's verification shows the check failing on the fixture before the rule exists and passing after (fail-first) | §3 — "fails before the rule exists and passes after", fixture drawn from `provenance.source_findings` |
| a judgement rule is classified permanently-prose, is marked so, and is excluded from `enforced_fraction`'s denominator | §1 — `prose_permanent: true` plus the denominator exclusion |
| a numeric rule is refused as prose and routed to `gate_metric` or rejected (invariant 13) | §1 — the numeric bar row |
| a rule that cannot be checked without false positives returns `blocked` and is not shipped | §6 — `blocked: not mechanically checkable`, no noisy rule shipped |
| after a promotion lands, the ledger's `enforcement` and its config/fixture pointers are written in the rulebook commit, after the code commit — never by this skill | §5 — scheduler writes it in the rulebook commit (D13 ordering); this skill never writes |
| promotion evicts before admission and the deletion test proves coupling | §4 — fixed slots, weakest-rule eviction, and absent/present/deleted fixture checks |
| the project's existing lint command — discovered by `harness-startup-path`, run by `harness-clean-handoff` — now flags the recorded violation; the promotion is picked up by the automation that already exists, not a new runner | intro and §2 — the emitted ticket's verification command is the existing lint command, verbatim |

