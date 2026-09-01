---
sidebar_position: 5
---

# Portability

The public OMP core lives under `omp/agent/` and can move to another machine
through Git or a distribution archive. The installed directory is
`~/.omp/agent`.

## The installed tree is reproducible

On the new machine, clone a known revision, review the package manifest, and
validate the tree before copying it:

```powershell
git clone https://github.com/MaiconGambini/omp-harness-guide.git
Set-Location omp-harness-guide
Get-Content .\omp\agent\omp-port-manifest.json
node scripts/validate-public-subset.mjs --check-manifest
```

Installation is a clean copy:

```powershell
$target = Join-Path $env:USERPROFILE ".omp\agent"
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item -Path ".\omp\agent\*" -Destination $target -Recurse -Force
```

The public package has no exporter or migration command. If the destination
already exists, rename it to `omp-agent-backup` before copying. This prevents
silent merges and keeps the previous configuration recoverable.

## Move to another PC

- Use the same reviewed Git revision on every machine.
- Do not copy `node_modules`: `website/` dependencies are local and are not
  part of the OMP runtime.
- Review `config.yml` and `omp-port-manifest.json` before starting Oh My Pi.
- Close and reopen Oh My Pi after replacing files; loading happens at startup.

## What is not transported

The package excludes session state, local databases, caches, findings, traces,
receipts, local backups, and other runtime evidence. It also excludes
`recon-*`, `redteam-*`, `hiagosh-*`, `wstg-*`, exploitation, pentest, and
attack-chain skills.
