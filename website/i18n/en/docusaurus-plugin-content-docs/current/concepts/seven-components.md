---
sidebar_position: 2
---

# The seven components

```text
prepare → plan → execute → validate → judge → refine → confirm
```

This page describes the seven lenses used to check whether the workflow is
complete.

The harness uses seven components. They are not seven separate products; they
are lenses for checking whether the workflow is complete.

1. **System Prompt** — Active rules, boundaries, and the instruction to operate with PREVC.
2. **Tools** — Tools that read, edit, validate, track the active unit, and request approval.
3. **Context Management** — Loads only the relevant instructions, specs, and state.
4. **Verification** — Commands and evidence that verify the result.
5. **Memory** — Goals, handoffs, and durable artifacts, with retention.
6. **Sandboxes** — There is no OS sandbox. Policy does not replace isolation.
7. **Hooks** — Allowed integrations (native extensions); they do not create autonomous execution.

## What each component protects

| Component | Question it answers | Current limit |
|---|---|---|
| System prompt | Which rules apply in this session? | Rules do not replace human permission |
| Tools | Which action can be executed? | Mutating tools still require policy and approval |
| Context | What do I need to read before deciding? | Context must be relevant, not a global dump |
| Verification | What fact proves the result? | Evidence declared by the model is not a trustworthy receipt |
| Memory | How does the next session continue? | Retention and auditing do not prove completion |
| Sandboxes | Is the process isolated from the OS? | No. There is no OS sandbox installed |
| Hooks | What integrates into the lifecycle? | Extensions cannot start autonomous loops |
