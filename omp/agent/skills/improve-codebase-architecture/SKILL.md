---
name: improve-codebase-architecture
description: Identify evidence-backed architectural deepening opportunities in code that changes frequently or is hard to test, then route a selected improvement through PREVC.
disable-model-invocation: true
---

# Improve Codebase Architecture

Find targeted opportunities to increase module depth, locality, and testability.

1. Scope the review to a user-named area or recent hotspots from `git log`. Read `CONTEXT.md` and relevant ADRs first.
2. Use `codebase-design` vocabulary while exploring: module, interface, seam, adapter, depth, leverage, and locality.
3. Identify friction supported by code evidence: shallow pass-throughs, scattered knowledge, duplicated policy, hidden coupling, or behavior that cannot be tested at a useful seam.
4. Apply the deletion test before proposing a refactor.
5. Present each candidate with affected areas, observed problem, smallest deepening direction, expected testing benefit, risk, and recommendation strength.
6. Do not design or implement an interface until the user chooses a candidate. Then use `spec-lead` for focused requirements clarification and route the selected change through PREVC.

Do not produce broad, speculative refactor lists or overturn ADRs without concrete evidence.
