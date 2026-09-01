# Harness Portability

Export and install the global OpenCode harness on another PC.

## Export

Run from PowerShell:

```powershell
& "$env:USERPROFILE\.config\opencode\scripts\export-opencode-harness.ps1"
```

The export includes:

- `opencode.jsonc`
- `skills/`
- `plugins/`
- `templates/`
- `scripts/`
- `package.json`
- `package-lock.json`

It excludes `node_modules`, caches, logs, and secrets.

## Install

On the new PC, extract the zip and run:

```powershell
& ".\install-opencode-harness.ps1" -SourceRoot "." -TargetRoot "$env:USERPROFILE\.config\opencode"
```

Then run:

```powershell
cd "$env:USERPROFILE\.config\opencode"
npm install
```

## Rules

- Review `opencode.jsonc` for old absolute paths after install.
- Do not copy `node_modules` between PCs.
- Keep machine-specific secrets out of templates.
