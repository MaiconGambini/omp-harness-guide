# Harness Stack Router

Detect project stack signals and recommend standards, skills, and verification.

## Detection Map

| Signal | Stack | Load |
|---|---|---|
| `pyproject.toml`, `uv.lock` | Python | `python-pro`, `python-testing-patterns`, `uv-package-manager` |
| `app/main.py`, `fastapi` | FastAPI | `python-fastapi-development`, `backend-security-coder` |
| `alembic/`, `sqlalchemy` | Database | `database-engineer`, `backend-architect` |
| `package.json` + `nuxt` | Nuxt/Vue | PREVC selects an active bounded implementation capability; load `frontend-developer`, `web-platform-engineer`, or `frontend-security-coder` only when the task needs retained generic, web, or security guidance |
| `package.json` + `next` | Next/React | `react`, `nextjs-best-practices`, `frontend-security-coder` |
| `tsconfig.json` | TypeScript | `typescript`, `typescript-pro` |
| `playwright.config.*` | Browser/E2E | `playwright-cli` |
| `docker-compose.*`, `Dockerfile` | Platform | `platform-release-engineer` |

## Output

```markdown
## Stack Router
Detected: ...
Standards: ...
Skills: ...
Verification candidates: ...
Uncertain: ...
```

## Rules

- Use file evidence before guessing.
- If uncertain, say what evidence is missing.
- Recommend skills; do not invoke implementation skills by yourself.
- Treat secrets as server-only unless docs prove otherwise.
