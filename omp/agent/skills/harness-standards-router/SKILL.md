# Harness Standards Router

Load project standards before PREVC planning or implementation.

## Standard Sources

Priority order:

1. Project `agent-os/standards/index.yml`
2. Project `docs/` architecture/product/reliability files
3. Global templates in `~/.config/opencode/templates/agent-os/standards/`
4. Relevant skills from `harness-stack-router`

## Always Include

- `functional-programming.md`
- `testing.md`
- `security.md`

## Stack-Specific Includes

- Python: `python.md`
- TypeScript: `typescript.md`
- Vue/Nuxt: `vue.md`
- React/Next: `react.md`
- SQLAlchemy/Alembic/Postgres: `database.md`

## Output

```markdown
## Standards Loaded
Base: functional-programming, testing, security
Stack: ...
Skills to invoke: ...
Rules that affect this task: ...
```

## Rules

- Standards are constraints, not suggestions.
- If project standards conflict with global templates, project standards win.
- Do not implement until relevant standards are named in the plan.
