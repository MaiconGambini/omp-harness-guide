---
sidebar_position: 4
---

# Limitations

What the documented Harness Oh My Pi distribution does not do — and what is an
explicit gap rather than a capability. This repository does not use a public
semantic version as its identifier; consult the Git revision and package
manifest.


## It is not a SaaS product

The harness is a set of configuration files and scripts. There is no server,
API, authentication or dashboard.

## It does not merge into existing configuration

The supported path is a clean copy of `omp/agent/` after a backup. There is no
merge or migration script: if `~/.omp/agent` already exists, rename it to
`omp-agent-backup` before installing.

## It is not a package manager

There is no installation CLI, automatic update or semantic versioning.
Updates use a reviewed Git revision, manifest validation, and a new clean copy
of the core package.

## It does not document all skills

The site documents the harness workflow. Specialized development skills
(frontend, backend, Python, TypeScript) that ship with the harness do not
have their own chapters in the documentation.

## It is not fully cross-platform

The harness was designed and tested on Windows with PowerShell 5.1+. The
install and migration commands are npm scripts; the Node runtime is
portable, but shell scripts for other operating systems are not provided.

## Explicit gaps


The harness verifies its own lifecycle and evidence. It does **not** provide
application authorization proof (RLS/IDOR) — that belongs to the application
and its own tests. A project without a declared security contract gets a
named `unavailable` gap, never a pass.

**Missing capabilities**

Protocols and integration surfaces that are not implemented (for example,
A2A/UCP/BCP-style agent interoperability) are labeled as gaps. Cost and
usage sources the runtime does not supply are recorded as explicit
`unavailable` values — never invented numbers.

## Dependencies

- Oh My Pi installed and working.
- Node.js 20+ for the scripts.
- PowerShell 5.1+ on Windows.
- Git for cloning and version control.
