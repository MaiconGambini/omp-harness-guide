---
sidebar_position: 2
---

# OMP Portfolio

This document describes the problem, methodology, implementation, and evidentiary basis of the public Oh My Pi core. It documents verifiable engineering mechanisms without claiming performance metrics lacking reproducible measurement.

## Problem

The PREVC contract needed to operate on OMP native primitives without publishing private state, credentials, customer data, or unverified capabilities. The core challenge was maintaining rigorous scope boundaries, cognitive focus (WIP=1), code traceability, and human approval governance while the runtime dispatches multiple agents and parallel execution lanes.

## Method

PREVC remains the shared engineering contract:
- Seven steps grouped into four operational phases.
- Bounded focus on a single active unit (WIP=1).
- Semantic risk classification and prior plan approval.
- Quality Gate measured with deterministic code and explicit coverage reporting (`Measured: N/M`).
- Layered code review with an independent reviewer from a competing model family.
- Read-only Judge evaluation and Refine proposing improvements without write permissions.
- Sovereign human confirmation, supporting criteria-based auto-confirmation (`auto-confirm`) bounded by cumulative *fail-closed* checks.

OpenCode functions as the continuity and methodology adapter; OMP provides the native execution engine.

## Implementation

The public distribution maps this contract to concrete OMP primitives:

- `scheduler` dispatches approved lanes in governed `tasks[]` waves.
- `hub` coordinates inter-agent message delivery and synchronization.
- `todo` materializes the session's active unit, enforcing cognitive discipline.
- `test-runner` shards test suite execution when authorized by plan and test boundaries.
- `harness-quality-gate` consolidates static metrics, Git-mined eval regressions (`eval_regressions`), security contracts (`authz_controls`), and delivery preflight checks (`delivery_config`).
- `harness-flow-metrics` analyzes Git history, extracting objective revert and follow-up fix indicators.
- Integration with agent teams in Maestri (`/maestri-team`) with bounded roles and audited tools.

The deployable package resides in `omp/agent/`. The documentation in `website/` remains separate from the production runtime.

## Evidence

Public package integrity is enforced through:
1. `omp/agent/omp-port-manifest.json` carrying cryptographic integrity hashes for every distributed file.
2. `scripts/validate-public-subset.mjs` verifying the absence of confidential paths, offensive tools, or leaked secrets in the distribution.
3. Behavioral unit tests exercising the risk router, Quality Gate, evidence envelopes, and PREVC state transitions.

Any claims regarding software stability, security, or throughput require an executable command, explicit parameters, a working tree identified by `sourceHash`, and captured terminal output.
