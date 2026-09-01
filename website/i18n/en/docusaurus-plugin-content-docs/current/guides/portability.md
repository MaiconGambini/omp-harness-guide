---
sidebar_position: 5
---

# Portability

The harness can be moved between machines or shared with other developers.

## Install on another PC

The supported path is the same as a fresh installation: clone the harness
source repository, review its revision, `package.json`, and lockfile, then
install, preview, install, and check.

```powershell
git clone <harness-source-repository> omp-harness
Set-Location omp-harness
npm ci
npm run omp:dry-run   # preview what would be installed
npm run omp:install   # clean install into ~/.omp/agent
npm run omp:check     # verify: {"ok": true, "drift": []}
```

`npm ci` installs exactly the versions in the lockfile. Do not run scripts
from an unreviewed checkout.

Notes:

- The dry run is deterministic: two consecutive runs print byte-identical
  output.
- Platform binaries require a local `npm ci`; copying `node_modules`
  between different systems does not work.

## Migrate a legacy installation

If the target machine already has a legacy harness layout:

```powershell
npm run omp:migrate
```

- Replaces only managed files (collisions with the manifest).
- Backs up each replaced file byte-exactly under
  `~/.omp/agent/backups/`, with a recorded manifest (original path + hash).
- Preserves unmanaged files (extensions, tests, caches, databases,
  sessions, user settings) — the result reports
  `unmanaged: { count, unchanged, changed }`.
- Is idempotent: rerunning after a full migration reports `migrated: 0`.

## Via Git (recommended)

The simplest and most reliable way is to clone the source repository rather
than copying folders:

```powershell
git clone <harness-source-repository> omp-harness
cd omp-harness
npm ci --ignore-scripts
```

This installs the exact versions recorded in the reviewed lockfile without
running dependency lifecycle scripts. Updates are then a reviewed `git pull`
followed by checkout, manifest, and lockfile review, `npm ci --ignore-scripts`,
and `npm run omp:check`.

## Cautions

- Do not copy `node_modules` between machines.
- Review `~/.omp/agent/config.yml` after installation. Paths use
  `~`/`os.homedir()`, so no manual path editing is necessary on a standard
  Windows profile.
- If you have an existing configuration, do not overwrite it by hand — the
  migrate path backs up and replaces only managed files, and `omp:check`
  reports any drift afterward.
- Backup trees under `~/.omp/agent/backups/` are durable by design: neither
  migration nor cleanup deletes them. Remove them only when you are certain
  you no longer need the originals.
- This public guide repository (`omp-harness-guide`) contains **documentation
  only** — the harness itself comes from the distribution source checkout.
  After any migration, confirm parity with `npm run omp:check`; the drift
  inspection names each divergent file.
