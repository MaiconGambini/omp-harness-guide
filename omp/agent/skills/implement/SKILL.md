---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
---

Implement the work described by the user in the spec or tickets.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, run the quality gate at `--mode local` (`harness-quality-gate`) and use /code-review to
review the work — at the depth the router's tier says, not always the full pass.

Commit your work to the current branch.

## When dispatched by a scheduler

If you were dispatched as a bounded specialist by a scheduler (e.g. `spec-lead` running a lane in parallel), **do not commit**. Edit and verify only, then return your result. The scheduler is the sole committer — it reconciles all lanes and creates one local commit, so parallel lanes never race on git. Committing here would break that invariant.

Before returning, run the gate at `--mode local --label <your-lane-id>` and **include its metric
table in your result** — a lane that returns "tests pass" hands the scheduler nothing to reconcile.

Three rules for a lane specifically:

- **Do not run `--mode full`.** Mutation and e2e cost minutes and would multiply across every
  parallel lane. The scheduler runs `full` once over the reconciled tree.
- **Write a lane-labelled report.** Two lanes finishing in the same minute would otherwise overwrite
  each other's report.
- **Never write `agent-os/quality-thresholds.json`.** Baselines are the scheduler's `full` run only.
  Concurrent writes to one JSON lose updates and break the one-writer-per-file invariant.
