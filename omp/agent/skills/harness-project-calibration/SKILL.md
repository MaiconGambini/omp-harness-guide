---
name: harness-project-calibration
description: "Derives repo-specific quality thresholds from local metrics. Use when calibrating gate thresholds after bootstrap. Do NOT use for initial harness installation (use harness-bootstrap)."
---

# Harness Project Calibration

The global harness ships a schema, defaults, and this procedure. It never ships one project's numbers.
It is a reusable source only and owns no project tree. Bootstrap installs empty project ledgers in the
target repository. Calibration is the project rollout boundary: it derives that repository's own
thresholds, high-risk paths, and tool-availability list from its layout and history.

This skill makes `AGENTS.md` and `agent-os/quality-thresholds.json` specific to the repository they
live in instead of identical boilerplate.

## What to derive, and from where

### 1. Thresholds — from this project's own baselines
The template's `redteam_findings` and `dependency_cooldown` rows are included here. Derive their
thresholds and baselines from this repository rather than copying defaults.

Sources, in order: the `baseline` fields in `agent-os/quality-thresholds.json`, then the `Metrics:`
trailers in `git log --grep=Quality-Gate`, then any Phase-A reports under `docs/harness/quality/`.

Report the **distribution**, not just the last value — minimum, median, latest, and how many runs.
A threshold set at the best run ever recorded will fail constantly and then get loosened, which is
the ritual the whole design exists to avoid. Propose the threshold near the **median of recent
passing runs**, and say how many runs it rests on. Fewer than three is not a baseline; say so and
stay in Phase A.

**Promotion Discipline**:
- Calibration promotes metrics from `observe` to `blocking` **only when genuine empirical evidence exists** (passing historical runs and verified local tools).
- **Red-team enforcement**: The PREVC transition from `judge` to `refine` under `receipt.tier: "full"` OR `state.risk: "high"` strictly requires an approved red-team review record, a matching `sourceHash`, and ≥3 attempts in PREVC, while the deterministic `redteam_quickcheck` scan runs over the diff prior to Judge.
- **Learned rules governance**: Refinement (`harness-refine`) only proposes candidate rules from trajectory windows; it **never approves rules autonomously**. All rule activations into `agent-os/learned-rules.json` or `agent-os/standards/` require explicit operator approval.
- **No fake green suites**: If a tool or test suite is absent, declare an honest `unavailable` or `not_applicable` gap with its installation cost; never generate placeholder tests or mock configurations to simulate passing metrics.
- **Meaning of 'blocking' (GS-02, GS-07)**: Setting a metric to `blocking` means a failure blocks the delivery claim (`confirm` / `complete`) and feeds the autofix repair loop (`validate -> execute`). It NEVER prevents agents from reading, exploring, running the system locally, or writing code.
### 2. `high_risk_paths` — from this repo's actual layout

Match the always-review categories against the directories that actually exist here: auth,
payments/billing, passwords/credentials/secrets, DB migrations, infra YAML and CI workflows,
permissions/roles.

The global default is a guess about layout. A repo with no payments should not carry a payments
glob — it is noise that trains people to ignore the list. A repo whose auth lives in
`lib/identity/` needs that glob, and the default would have missed it entirely. Walk the tree, list
what matched, and list which categories have **no** representation here (that absence is itself
worth knowing).

### 3. Tool availability — the honest inventory

Run the gate and list every `unavailable` metric with what installing it would cost:

| Metric | Status here | To measure it |
|---|---|---|
| mutation_kill_ratio | unavailable | add Stryker; ~3 min per run scoped to changed files |
| boundary_violations | unavailable | add a dependency-cruiser config; no runtime cost |

Name the gaps rather than pretending a row is green. A gate measuring three of nine rows is the
risk, not the reassurance — and the operator can only decide what to install if the bill is visible.

### 4. Blind spots — from this project's escaped defects

Read `docs/review.md`'s escaped-defect log and the project's own bug history (issue tracker,
`git log --grep=fix`). Propose blind-spot lines that describe how **this** system actually breaks,
and drop generic lines that have never once been the problem here.

## Output

```markdown
## Calibration Proposal — <project>

### Thresholds (from N runs)
| Metric | Current | Proposed | Runs | Min / Median / Latest | Rationale |

### High-risk paths
Matched here: ...
Categories with no representation: ...
Global defaults to drop (no such paths here): ...

### Unavailable metrics
| Metric | To measure it | Cost |

### Blind spots to add / drop
...

### Phase recommendation
Stay at A | move to B | move to C — and the evidence for it.

Approval needed before writing: yes
```

On approval, calibration writes only to the target project's `agent-os/quality-thresholds.json`,
appends the reason to `agent-os/quality-decisions.md`, and appends this project's specifics beneath
the **Quality** section of its `AGENTS.md`. It never writes the global template or any other project
tree.

## The ownership seam — one writer per artifact

Per-project derivation is split with `harness-quality-gate`; the table there is the single
source of truth for who writes what, mirrored here:

| Artifact | Owner |
|---|---|
| `agent-os/quality-thresholds.json` | `harness-project-calibration` |
| `AGENTS.md` | `harness-project-calibration` |
| `agent-os/learned-rules.json` | the Refine loop |
| `agent-os/standards/*.md` | the Refine loop |
| `docs/review.md` | the gate's escaped-defect write-back |

Calibration's write path ends at `agent-os/quality-thresholds.json` and the `AGENTS.md`
entry. The rulebook and `docs/review.md` have different owners and are not calibration's.

## Rules

- Never copy another project's thresholds. Defaults are a starting point, baselines are the answer.
- A phase advance is the operator's decision; propose it with evidence, never perform it.
- Numbers go in the JSON. `AGENTS.md` gets pointers and this project's real path list — not a
  restated threshold.
- All configured commands in `agent-os/quality-thresholds.json` must be absolute and quoted (`"<harnessHome>/scripts/..."`), dynamically resolving the harness installation without machine-specific usernames.
- **Running twice with no new measurements proposes nothing.** Say "no new evidence since <date>"
  and stop. A calibration that always has an opinion is noise.
- Refine proposes, never approves rules alone: rule adoption is an operator gate.
- Keep the `AGENTS.md` addition short. An entry point that grows every session stops being read.
