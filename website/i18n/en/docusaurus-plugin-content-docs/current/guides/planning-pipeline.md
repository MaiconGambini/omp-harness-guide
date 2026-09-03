---
sidebar_position: 0
---

# How plans are made

Planning is a **fixed pipeline** inside PREVC's plan phase, run by the
`/planner` command (the scheduler's Planning role). The result is more
consistent, with less slop, and faster than ad-hoc spec writing.

## The pipeline (`/planner`)

The planner works in three steps, sizing the depth to the work:

```text
/planner <objective>
        |
        v
1. SIZE-GATE  -> wayfinder  (only large/foggy/cross-subsystem work)
        |          map of decision tickets; resolve decisions first
        v
2. SHARPEN    -> grill-with-docs (AUTO)
        |          self-interview + domain-modeling, decides on its own,
        |          labels assumptions, writes ADRs/glossary
        v
3. DECOMPOSE  -> to-tickets = the LANE TABLE
        |          tracer-bullet vertical slices with blocking edges
        v
awaiting_plan_approval  (the operator reviews and approves once)
```

### 1. Size-gate → wayfinder (large only)

If the effort is larger than one agent session, foggy, or cross-subsystem,
`wayfinder` draws a **map of decision tickets** and resolves the open
decisions first. Normal work **skips** this step — wayfinder's own rule is
"no fog, no map".

### 2. Sharpen → grill-with-docs (AUTO)

`grill-with-docs` runs in **AUTO mode**: it does not pause to ask the
operator. It walks every branch of the decision tree and takes its own
recommended answer, resolving from the code, decisions, context, and
requirements. Each answer becomes a decision; the ones it resolved on its
own are **labeled as assumptions** for the operator to see at review.
Decisions and glossary are written via `domain-modeling`.

It only escalates to the operator on a **real blocker**: an ambiguity no
source can settle, a hard-to-reverse decision with no defensible default, or
a scope change. This is the same halt bar as an autonomous run.

### 3. Decompose → to-tickets = the lane table

`to-tickets` breaks the sharpened plan into **tracer-bullet vertical slices**
under `agent-os/specs/<slug>/tickets/`, each declaring its blocking edges.
**A tracer-bullet ticket IS a lane**: vertical, sized to one context window,
with a single owner. From each ticket comes the lane's exact file-ownership
set, its dependencies (the blocking edges), and its verification command.

## Where the canonical artifacts live

Every plan writes the canonical Agent OS artifacts under
`agent-os/specs/<YYYY-MM-DD-HHMM-slug>/` **before** `awaiting_plan_approval`:

```text
agent-os/specs/<YYYY-MM-DD-HHMM-slug>/
  spec.md            # canonical PRD (objective, requirements, AC)
  plan.md            # approach, file boundaries, lane table, validation, rollback, risks
  verification.md    # how each acceptance criterion is proven, with commands
  decisions.md       # every resolved decision (incl. research/prototype records)
  research.md        # primary sources (only when research ran)
  prototype/         # disposable prototypes (only when the prototype stage ran)
  tickets/           # the tracer-bullet lane table (never before spec.md)
```

The `tickets/` set **is** the task list: "all tasks in the plan" = the ticket
set, and the scheduler reads it directly as the lane table.

## Execute: implement, no race

After approval, the scheduler dispatches each lane (see
[parallel dispatch](./parallel-dispatch)). Each lane is executed by a
specialist following the `implement` skill's discipline — TDD at agreed
seams, typecheck and per-file tests, then code review.

**Specialists do not commit.** Only the scheduler commits, reconciling all
lanes into one local commit — so parallel lanes never race on git. One lane
writes one file at a time.

**Plan + execute in a single session**

The scheduler can plan **and** execute in the same session:

- It may write planning artifacts (spec, `tickets/`, `decisions.md`,
  `feature_list.json`) during planning.
- It may edit source directly when working **sequentially** (for example,
  doing task 1 itself before any dispatch).
- **It never edits while parallel specialists are in flight** — there the
  lanes own their files; only they edit and only the scheduler commits.

## Summary

| Aspect | Value |
|---|---|
| Speed | fast (auto-grill + generated tickets) |
| Consistency | tracer-bullet slice = rigid contract |
| Decisions | decisions + labeled assumptions |
| Lane table | **is** the ticket set |
| Interaction | a single approval gate |
