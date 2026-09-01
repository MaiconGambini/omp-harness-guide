---
name: harness-startup-path
description: Discover startup and verification commands for any project. Use when session start, PREVC, or handoff needs a baseline command without assuming init.ps1.
---

# Harness Startup Path

Find the safest repeatable verification path for the current project.

## Discovery Order

1. Existing explicit scripts: `init.ps1`, `init.sh`, `scripts/check-*`, `Makefile` targets.
2. Package managers: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`.
3. Python: `uv.lock`, `pyproject.toml`, `requirements.txt`.
4. Other stacks: `Cargo.toml`, `go.mod`, `docker-compose.yml`, `compose.yml`.
5. CI files: `.github/workflows/*`, pipeline configs, release scripts.

## Candidate Commands

| Signal | Candidate |
|---|---|
| `init.ps1` | `.\init.ps1` |
| `init.sh` | `./init.sh` |
| `Makefile` | `make check`, `make test`, `make build` |
| npm | `npm install`, `npm test`, `npm run build` |
| pnpm | `pnpm install`, `pnpm test`, `pnpm build` |
| uv | `uv sync`, `uv run pytest`, `uv run ruff check .` |
| pip | `pip install -r requirements.txt`, `pytest` |
| Rust | `cargo test`, `cargo clippy` |
| Go | `go test ./...` |
| Docker | `docker compose config`, then project-specific run command |

## Output

Produce:

```markdown
## Startup Path Audit
Detected stack: ...
Baseline command: ...
Required setup: ...
Skipped checks: ... because ...
Risks: ...
Recommended artifact: init.ps1 | init.sh | docs/harness/startup.md | Makefile target
```

## Rules

- Never assume `init.ps1` exists.
- Prefer one baseline command for future session start.
- If no safe command exists, recommend creating `docs/harness/startup.md` first.
- Do not create or edit files without approval.
