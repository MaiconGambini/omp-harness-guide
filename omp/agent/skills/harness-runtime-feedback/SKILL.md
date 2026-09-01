---
name: harness-runtime-feedback
description: Build a task-specific runtime evidence plan. Use when validation needs logs, health checks, error signals, browser/network evidence, or observability.
---

# Harness Runtime Feedback

Runtime evidence proves behavior beyond static checks.

## Audit Areas

Inspect the project for:

- Logs and structured logging.
- Health checks and readiness endpoints.
- Error handlers and exception boundaries.
- Retry, fallback, and timeout policies.
- Browser console and network evidence for UI work.
- Runtime traces, metrics, queues, and job status.

## Output

```markdown
## Runtime Evidence Plan
Task: ...
Runtime surface: backend | frontend | CLI | worker | unknown

## Logs to Inspect
- File/tool: ... or unknown

## Health Checks
- Command/endpoint: ... or unknown

## Error Signals
- Expected failure signal: ...

## Agent-Oriented Failure Messages
- If X fails, record Y with exact value Z.
```

## Rules

- Point to concrete files, commands, endpoints, or say `unknown`.
- Do not invent observability that is not present.
- For browser work, include console and network checks.
- For async jobs, include queue/job status checks.
- Runtime evidence complements tests; it does not replace them.
