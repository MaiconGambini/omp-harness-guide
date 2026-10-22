---
name: no-comments
description: "Strip redundant and narrating code comments. Use when removing AI comments while preserving the closed keep list. Do NOT use for general prose documentation editing (use unslop)."
---

# No Comments

Prefer executable names and structure over explanatory comments. Remove phase
narration and comments that merely restate code. Do not delete comments blindly:
the keep list is closed.

## Keep list

Keep only:

- legal/license headers;
- non-obvious external-dependency behavior;
- formatter pragmas;
- public API documentation comments; or
- issue/RFC links.

Every uncertain keep-list decision requires proof: nearby code behavior,
authoritative dependency/API evidence supplied by the caller, or a named
structural waiver. A comment's prose asserting that it is important is not
proof. Suppression directives (`eslint-disable`, `@ts-ignore`,
`@ts-expect-error`) must carry proof or an explicit structural waiver.

## Review procedure

1. Run `node scripts/harness-comment-lint.mjs --json <changed paths>`.
2. Treat non-zero output as findings, not permission to edit.
3. Have read-only `comment-sicko` report findings against the declared diff.
4. Adjudicate scope and evidence independently. Reject application-code edits,
   scope escapes, and unresolvable locations.
5. Stop adjudication after two rejected reports.

The reviewer never writes application code and never adjudicates its own finding.
