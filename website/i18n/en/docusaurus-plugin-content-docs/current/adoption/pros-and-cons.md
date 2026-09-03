---
sidebar_position: 2
---

# Pros and Cons

An honest assessment of what the harness delivers and what it costs.

## Pros

### Continuity between sessions

You open Oh My Pi tomorrow and it knows exactly what you were doing. You do
not need to re-explain the context, re-read files or guess what was left
pending.

### Enforced WIP=1

The discipline of one task at a time reduces abandoned parallel work. Each
feature goes to the end or is recorded as blocked with an exact cause.

### Objective evidence

"It worked" is not enough. The harness requires commands run, output
captured and three-layer verification before marking a feature as complete.

### Durable lifecycle

The PREVC phase survives across sessions, written by
`harness-prevc-state.mjs`. No agent can silently mark work complete.

### Auditing and recovery

Decisions, blockers and handoffs are recorded in files. If something breaks,
you know when, why and what the previous state was.

### Planning separated from execution

For complex tasks, the harness separates the planner, generator and
evaluator roles. This reduces self-assessment bias.

## Cons

### More files

The harness adds `feature_list.json`, `STATE.md`, `session-handoff.md`,
`sprint-contract.md` and others. For small projects, this can feel like
bureaucracy.

### Constant discipline

WIP=1, three-layer verification and mandatory handoff require discipline in
every session. Skipping steps reduces the value of the harness.

### Maintenance cost

The state files need to be kept up to date. If `STATE.md` becomes outdated,
the next session starts with wrong information.

### It does not replace good engineering

The harness does not guarantee code quality; it structures traceability through
evidence. Bad code remains bad code even when the evidence is complete.

### Initial curve

The first session with the harness requires learning commands, concepts and
the PREVC flow. The investment pays off on long projects, but can be
excessive for single tasks.
### Clean installation, no merge

The public package is copied into a clean `~/.omp/agent` directory after a
backup. It does not silently merge into an existing configuration.
