---
sidebar_position: 2
---

# Installation

Harness Oh My Pi is distributed under `omp/agent/` in this repository. This
tree contains the files Oh My Pi loads from `~/.omp/agent`: agents, commands,
scripts, the extension, configuration, and general skills. It complements a
base Oh My Pi installation; it does not install or replace the Oh My Pi
runtime.

Installation is clean; it never merges automatically into an existing
configuration. The public package has no semantic release identifier; identify
installed content by the reviewed Git revision and manifest hashes.


## Step 1: Back up the current directory (if any)

If `~/.omp/agent` already contains your files, rename it before installing:

```powershell
Rename-Item -LiteralPath "$env:USERPROFILE\.omp\agent" -NewName "omp-agent-backup"
```

The public distribution does not migrate or merge configurations automatically.
Use the backup as a reference and copy back what you need afterward.

## Step 2: Obtain and review the distribution

Clone the repository and review the Git revision, package manifest, and files
before installing:

```powershell
git clone https://github.com/MaiconGambini/omp-harness-guide.git
Set-Location omp-harness-guide
Get-ChildItem .\omp\agent
Get-Content .\omp\agent\omp-port-manifest.json
```

`omp/agent/` is the runtime package loaded by OMP. `website/` is the
documentation site only; installing its dependencies develops the site and
does not install anything under `~/.omp/agent`.


## Step 3: Validate the public package

The validator checks the manifest, prohibited paths, secret-shaped content,
offensive families, and documentation parity:

```powershell
node scripts/validate-public-subset.mjs --check-manifest
node scripts/validate-public-subset.mjs
```

Do not continue if either command returns `FAIL`.

## Step 4: Install into a clean directory

After the backup, copy the real package tree into `~/.omp/agent`:

```powershell
$target = Join-Path $env:USERPROFILE ".omp\agent"
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -Path ".\omp\agent\*" -Destination $target -Recurse -Force
```

![Harness installation and bootstrap workflow](/omp-harness-guide/img/diagrams/onboarding-instalacao.png)
*Harness installation, public package validation, and bootstrap workflow.*
The package does not include session state, local databases, caches, findings,
traces, receipts, or other runtime evidence.

## Step 5: Reopen and inspect

Close and reopen Oh My Pi. Agents, commands, skills, and extensions load only
at startup. Inspect the managed files:

```powershell
Get-ChildItem "$env:USERPROFILE\.omp\agent" -Recurse -File |
  Measure-Object
```

`~/.omp/agent/omp-port-manifest.json` records package hashes for inspection
and audit.

## Installed structure

After installation, `~/.omp/agent` contains the audited public distribution listed in the manifest (299 files in total):

- `agents/` — 25 agent profiles approved for public distribution.
- `skills/` — 110 defensive and methodological skills loaded on demand.
- `commands/` — 21 harness commands, including `/prevc`, `/maestri-team`, and operational support.
- `scripts/` — 55 portable Node utilities for lifecycle transitions, manifest validation, and flow metrics.
- `extensions/` — 2 native extensions loaded by Oh My Pi at startup.
- `config.yml` — public agent and model-role configuration.
- `omp-port-manifest.json` — cryptographic inventory with SHA-256 hashes for every distributed file.

Use the manifest to verify hashes against your checkout. These counts reflect the current distributable tree and do not represent arbitrary capability promises.
The package does not include `recon-*`, `redteam-*`, `hiagosh-*`, `wstg-*`,
exploitation, pentest, attack chains, or private local state.

## Troubleshooting

| Problem | Action |
|---|---|
| `validate-public-subset` fails | Read the reason; do not install a tree that failed validation. |
| `~/.omp/agent` already exists | Rename it to `omp-agent-backup`; do not merge manually before the backup. |
| Oh My Pi does not load commands | Close and reopen Oh My Pi; configuration loads only at startup. |
| A harness script fails | Check Node.js 20+, the reviewed checkout revision, and the paths shown by the script. |

## What this proves and what it does not

- **What it proves:** that the installed files in `~/.omp/agent` match the audited public manifest exactly, without private evidence or leaked credentials.
- **What it does not prove:** it does not guarantee that model providers in your `config.yml` have active API keys or sufficient quota, nor does it replace your application's test suite and build.

## Next step

Go to [First Session](./first-session) and use the public harness core for the first time.
