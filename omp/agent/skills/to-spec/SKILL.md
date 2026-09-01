---
name: to-spec
description: Convert established conversation decisions into a concise Agent OS specification without reopening requirements discovery.
---

# To Spec

Synthesize decisions already made. Do not restart the interview.

1. Read the relevant code, `CONTEXT.md`, ADRs, and existing feature state.
2. Identify the highest public seams that will verify the requested behavior and confirm any newly proposed seam with the user.
3. Create or update `agent-os/specs/YYYY-MM-DD-HHMM-<slug>/spec.md` using the project template when available.
4. Include the user problem, desired behavior, user stories or acceptance criteria, implementation decisions, testing decisions, explicit out-of-scope items, and unresolved risks.
5. Update `feature_list.json` only after user approval and preserve WIP=1.
6. Hand off to `/prevc` or `writing-plans` for task decomposition.

Do not include brittle file-by-file implementation instructions in the specification.
