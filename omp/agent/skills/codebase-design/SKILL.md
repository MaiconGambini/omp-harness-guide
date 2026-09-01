---
name: codebase-design
description: Design or improve a module interface, test seam, or architecture boundary. Use when reducing coupling, improving testability, or evaluating module depth.
---

# Codebase Design

Design deep modules: substantial behavior behind a small, stable interface.

## Vocabulary

- **Module:** a unit with an interface and implementation.
- **Interface:** every fact callers need to use the module correctly, including invariants and failure modes.
- **Seam:** where behavior can change without editing the caller.
- **Adapter:** a concrete implementation at a seam.
- **Depth:** leverage provided by behavior hidden behind a small interface.
- **Locality:** changes, knowledge, and verification concentrated in one place.

## Method

1. Read `CONTEXT.md` and relevant ADRs if they exist.
2. Identify the caller-facing behavior and the highest useful test seam.
3. Apply the deletion test: if deleting the module only moves complexity to callers, it earns its place.
4. Prefer one real seam over hypothetical abstractions. One adapter is usually speculation; two real adapters justify the seam.
5. Propose the smallest interface that hides the complexity and lets callers and tests cross the same seam.
6. Route significant changes through PREVC before editing.

Avoid interfaces that merely forward calls or expose implementation structure.
