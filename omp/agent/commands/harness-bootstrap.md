---
name: harness-bootstrap
description: "Interactively install the full reusable harness package into a project."
---

Execute `skill://harness-bootstrap`. First audit the current repo, detect the stack via `skill://harness-stack-router`, and discover the startup path via `skill://harness-startup-path`.

Always propose the full harness package:
- `AGENTS.md`
- `feature_list.json`
- `docs/harness/{progress,session-handoff,sprint-contract}.md`
- `docs/{ARCHITECTURE,PRODUCT,RELIABILITY}.md`
- `agent-os/judges/project-judge.md`
- `agent-os/standards/`
- `agent-os/quality-thresholds.json`
- `agent-os/specs/_template/`

Show exact files to create / merge / skip, then ask for explicit confirmation before writing anything. Never assume `init.ps1`, `feature_list.json`, `.specs/project/STATE.md`, or current repo paths.
