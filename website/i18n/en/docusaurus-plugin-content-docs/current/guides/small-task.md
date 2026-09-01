---
sidebar_position: 1
---

# Small Task

This guide shows the flow for tasks with obvious scope and up to 3 files.

## When to use fast mode

Use it when the prompt has:

- A clear sentence.
- Obvious scope (1-3 files).
- No design ambiguity.

## Example

**Prompt:** `Add a GET /api/health endpoint`

**Flow:**

1. `/harness-session-start` — reads the current state, declares the active task.

2. `/prevc prepare Add a GET /api/health endpoint`
   - Plan: scope (1 file), AC (`curl returns 200`), non-goals.
   - Operator approval: "yes".

3. Execute — creates the file with the endpoint.

4. Validate:
   - Typecheck: OK.
   - Tests: OK.
   - Curl /api/health: returns the expected payload.
   - Local gate (`/quality`): OK.

5. Judge — receipt `accept`.

6. Confirm — the feature moves to `passing` with evidence.

7. Handoff — `/harness-clean-handoff` records the completion.

**Time:** ~2-5 minutes.

## What NOT to do

- Do not skip verification. Even a 2-minute task needs evidence.
- Do not expand the scope. If you realize you need more, stop, plan
  again, and ask for approval.
