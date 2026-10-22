---
sidebar_position: 5
---

# Maestri Team

The `/maestri-team` command provisions or reuses the standard ten-role team within the Maestri canvas, establishing persistent multi-agent collaboration with explicit permission boundaries.

![Session start and orchestration](/omp-harness-guide/img/diagrams/inicio-de-sessao.png)
*Session start: automatic profile detection, context activation, and canvas coordination.*

## Why a persistent team

While native `tasks[]` invocations spawn ephemeral subagents that vanish upon task completion, the Maestri team operates in dedicated, persistent terminals. This offers three operational advantages:

1. **Permission isolation:** read-only roles (such as reviewers and advisors) launch with strict tool flags (`--tools=read,grep,glob`), preventing unintended code modifications.
2. **Model diversity:** the code reviewer can run on a distinct model family from the implementer, reducing shared lineage blind spots.
3. **Context focus:** each specialist maintains focused reasoning transcripts without polluting implementation threads with architecture or security debates.

## The ten team roles

The provisioned roster comprises ten standardized profiles:

| # | Role in Maestri | Specialty | Write Permission |
|---|---|---|---|
| 1 | Maestro / OMP Orchestrator | Central orchestration and PREVC driver | Primary session |
| 2 | OMP Explorer | Read-only codebase reconnaissance and mapping | Read-only |
| 3 | OMP Architecture Advisor | Modular boundaries and contract design | Read-only |
| 4 | OMP Implementer | Code implementation and TDD refactoring | Write (declared lane) |
| 5 | OMP Backend Infra Engineer (or Vue) | Infrastructure, containers, CI, or frontend | Write (declared lane) |
| 6 | OMP Test Automation Engineer | Test suite creation and execution | Write (tests) |
| 7 | OMP Code Reviewer | Quality gate review, style, and security | Read-only |
| 8 | OMP Security Analyst | Security risk analysis and auth inspection | Read-only |
| 9 | OMP Refiner | Post-Judge rule refinement and lessons learned | Read-only |
| 10 | OMP Judge | Formal gate verdict receipts and rubric scoring | Read-only |

## Consent and operational lifecycle

Recruiting additional terminals consumes active model provider sessions. Terminal creation requires explicit operator consent:

- **Preview mode (`--dry-run`):** executes preflight discovery and outputs the status of connected and missing roles without recruiting new terminals.
- **Apply mode (`--apply`):** executed only after direct invocation by the operator in Maestro chat.
- **Idempotency:** repeated invocations identify connected roles in the active workspace and reuse existing terminals, recruiting only missing roles.

```bash
# Non-mutating preview
node ~/.omp/agent/scripts/harness-maestri-team.mjs --dry-run --root <projeto> --json

# Explicit recruitment apply
node ~/.omp/agent/scripts/harness-maestri-team.mjs --apply --root <projeto> --json
```

## The onboarding feedback block

When running `harness-maestri-team.mjs`, the returned JSON payload includes complete team state alongside an `onboarding` section derived from repository inspection:

```json
{
  "status": "ok",
  "mode": "dry-run",
  "root": "<projeto>",
  "specialist": "backend-infra",
  "team_size": 10,
  "maestro": "omp #2",
  "reused": [
    {
      "name": "Casco",
      "role": "OMP Implementer"
    },
    "..."
  ],
  "missing": [
    "OMP Explorer",
    "OMP Architecture Advisor",
    "..."
  ],
  "onboarding": {
    "harness": {
      "agentOs": true,
      "qualityThresholds": true,
      "prevcAutonomy": true,
      "autoConfirm": false,
      "projectProfile": true,
      "fixLoopMaxAttempts": 3
    },
    "docs": {
      "review": true,
      "pullRequestTemplate": true,
      "agentsMd": true
    },
    "registered": true,
    "missing": [],
    "advice": [
      "rode cerebro-carga-inicial se o cérebro estiver desatualizado"
    ]
  },
  "summary": "Dry run: 1 Maestro, 1 reused role(s), 8 role(s) to recruit."
}
```

The `onboarding` block inspects codebase governance across structured keys:

- **`harness`:** verifies presence of `agent-os/`, quality thresholds (`qualityThresholds`), autonomy configuration (`prevcAutonomy`), that auto-confirmation is disabled (`autoConfirm: false`), presence of profile (`projectProfile`), and retry limits (`fixLoopMaxAttempts`).
- **`docs`:** checks area code review guidelines (`review`), pull request template (`pullRequestTemplate`), and root instructions (`agentsMd`).
- **`registered`:** indicates whether the repository is registered in the local projects pipeline registry.
- **`missing` and `advice`:** enumerates absent components and outputs actionable guidance (e.g. running `harness-initializer` and `harness-bootstrap` when harness configs are missing, or `novo-projeto` and `cerebro-carga-inicial` when unregistered).
## Context reset (`--reset`)

When starting a new sprint and terminals have accumulated lengthy transcripts, use the `--reset` flag:

```bash
node ~/.omp/agent/scripts/harness-maestri-team.mjs --apply --root <projeto> --reset --json
```

- Sends `/new` directly to each connected terminal via the Maestri CLI.
- Clears working memory without terminating background OS processes.
- Retains original launch tool permission constraints (`--tools=read,grep,glob`).
- The Maestro terminal is never reset, preserving the primary conversation context.

## What this proves and what it does not prove

- **What it proves:** provisioning confirms that ten distinct roles are running in the workspace and that read-only terminals received restricted tool allowlists at launch.
- **What it DOES NOT prove:** terminals created outside the automated recruiter script cannot be verified retroactively. Safe multi-agent operations require provisioning terminals through the recruiter script.

## Related documentation

- [Parallel Dispatch](./parallel-dispatch.md) — Running concurrent lanes coordinated by the scheduler.
- [New Project](./new-project.md) — End-to-end repository onboarding workflow.
- [Commands](../reference/commands.md) — Command syntax reference for `/maestri-team`.
