---
name: harness-init
description: "Non-mutating audit of Entry, Context, State, Feedback, Evaluation, and Skills layers."
---

Execute `skill://harness-initializer`. Produce a non-mutating gap report covering: root instructions, progress/feature state, startup path, the evaluation/Judge layer, harness skills, security posture, context budget, and agent permissions — each with a recommended fix.

Do not create or edit any files until the user approves a specific fix. Do not assume `init.ps1`, `feature_list.json`, `.specs/project/STATE.md`, or current repo paths exist.
