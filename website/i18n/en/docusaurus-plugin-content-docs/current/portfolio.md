---
sidebar_position: 2
---

# OMP Portfolio

This record describes the problem, method, implementation, and evidence of the
public Oh My Pi core. It presents no performance numbers without reproducible
measurement.

## Problem

The PREVC contract needed to operate on OMP's native primitives without
publishing private state, runtime evidence, or unverified capabilities. The
challenge was preserving scope, continuity, and human approval while the
runtime works with agents and lanes.

## Method

PREVC remains the common contract: seven steps grouped into four phases, WIP=1,
operator approval, executable validation, a read-only Judge, non-writing Refine,
and explicit confirmation. OpenCode is treated as the methodological and
continuity adapter; OMP provides the native engine.

## Implementation

The public distribution maps the contract to OMP:

- `scheduler` dispatches approved lanes;
- `tasks[]` represents one wave of independent work;
- `hub` coordinates messages between agents;
- `todo` maintains the session's active unit;
- test sharding occurs only when the plan declares compatible files and
  dependencies.

The package includes curated commands, agents, skills, scripts, configuration,
and extensions under `omp/agent/`. The site is separate from the runtime, and
`concepts/continual-harness.md` documents the continual loop and its limits.

## Evidence

The reviewed Git revision, `omp/agent/omp-port-manifest.json`, and
`scripts/validate-public-subset.mjs` identify and verify the public package.
Dispatch examples show the shape of the primitives, not a speed measurement.
Any throughput, cost, or quality claim requires a command, configuration,
revision, captured output, and reproducible comparison.
