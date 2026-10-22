---
sidebar_position: 4
---

# Limitations

A rigorous, transparent accounting of what the Oh My Pi Harness distribution does not do — treating architectural boundaries as explicit design limits rather than implicit capabilities.

## Not a SaaS product

The harness is not a managed cloud service. It consists of local Node.js scripts, configuration manifests, CLI commands, and extensions executing inside the developer's local terminal. There is no central web service, hosted database, user authentication system, or cloud management dashboard.

## No automatic merges over existing configurations

There is no automated merge mechanism for pre-existing `~/.omp/agent` folders. The supported upgrade path involves backing up customized configuration files and copying the clean `omp/agent/` distribution.

## Honest architectural limitations

### Gates with low metric coverage (`Measured: N/M`)
A Quality Gate with a `pass` verdict **is not a certificate of zero bugs**. In greenfield codebases or repositories with sparse tooling, the majority of metrics will evaluate as `not_configured` or `unavailable` (e.g., `Measured: 7/28`). The gate measures strictly what was executed; it cannot attest to the quality of uninstrumented subsystems.

### Azure DevOps branch policies out of scope
The harness delivers Pull Request templates and governance workflows for Git and GitHub, but deep integration with Azure DevOps branch policies and automated merge gating remains out of scope. Teams on Azure DevOps run verification gates locally or through custom build scripts.

### Multi-provider dependencies and model costs
Model diversity in code review (assigning authoring and review to competing model families) is a critical quality safeguard, but it introduces dependency on multiple AI provider credentials and doubles token consumption on each delivery.

### Terminal concurrency overhead in Maestri
Recruiting the full agent team in Maestri (`/maestri-team`), consisting of up to 10 specialized agent roles, consumes concurrent connection slots, provider request-per-minute quotas, and local system memory. In bandwidth-constrained environments, running multiple agents in parallel may require sequential throttling.

### No autonomous merge queues or multi-agent PR voting
Unlike frontier corporate labs with unbounded compute budgets, the harness does not run continuous speculative merge queues or multi-agent voting panels on every PR. Review relies on a single competing model reviewer guided by domain contracts in `docs/review.md`.

### Learned rules and auto-activation limits
The Refine stage generates structural recommendations and conventions. Natural language prose proposals that are not refuted by the `rule-verifier` can be auto-approved in strictly observational mode (`observe`) without operator intervention, but **no learned rule ever acquires blocking authority (`mode: blocking` with test or lint enforcement)** without prior review, deterministic validation, and explicit operator commitment in the `agent-os/learned-rules.json` ledger.

### Tool policies are not an operating system sandbox
Tool allowlists restrict which functions the model may invoke, but do not sandbox the process from the host operating system. Approved plan commands run on the host with full user privileges.

## Infrastructure prerequisites

- **Oh My Pi** base installed and operational.
- **Node.js 20+** for running scripts, adapters, and integrity validators.
- **PowerShell 5.1+** for Windows automation workflows.
- **Git** for version control, commit integrity tracking, and flow metrics.
