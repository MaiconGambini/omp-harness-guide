# Harness Oh My Pi Guide — Approved Design

**Date:** 2026-09-01  
**Status:** Approved for implementation  
**Repository:** `MaiconGambini/omp-harness-guide`

## Goal

Create a bilingual public documentation site for the Oh My Pi harness, following the
information architecture and operational clarity of the existing OpenCode Harness guide,
while replacing OpenCode-specific commands, paths, adapters, and runtime assumptions with
accurate Oh My Pi behavior.

## Product scope

The guide covers the full harness, not only PREVC:

- installation and first session;
- PREVC lifecycle and WIP=1;
- OMP-native tracing and generated parity;
- planning, small tasks, complex features, parallel dispatch, existing projects, and
  portability;
- commands, agents/skills, artifacts, repository structure;
- adoption, security, limitations, troubleshooting, and references.

The guide must explicitly distinguish implemented OMP behavior, adapter behavior, and
known gaps. It must not claim real application RLS/IDOR evidence, A2A/UCP/BCP support,
AI Gateway support, or public deployment features that do not exist.

## Information architecture

The Docusaurus docs sidebar mirrors the OpenCode guide:

```text
Introduction
Getting Started: prerequisites, installation, first session
Concepts: harness, components, PREVC, continual harness, WIP=1, evidence/handoff
Guides: planning, small task, complex feature, parallel dispatch, existing project, portability
Reference: commands, agents/skills, artifacts, repository structure
Adoption: use cases, pros/cons, security, limitations
Troubleshooting: FAQ
References
```

Content is authored in Portuguese and English as separate Docusaurus locale trees. The
default locale is `pt-BR`; English routes live under `/en/`.

## Runtime translation

Use Docusaurus 3 classic preset, React 19, TypeScript, and Node 20. Site configuration:

- title: `Harness Oh My Pi`;
- URL: `https://maicongambini.github.io`;
- base URL: `/omp-harness-guide/`;
- `organizationName: MaiconGambini`;
- `projectName: omp-harness-guide`;
- `defaultLocale: pt-BR`, locales `pt-BR` and `en`;
- broken Markdown links and broken document links throw;
- dark theme by default, with locale switcher and GitHub link;
- no blog.

The guide must use OMP paths and commands such as `~/.omp/agent`,
`harness-prevc-state.mjs`, `omp:dry-run`, `omp:migrate`, and `omp:check`. It must explain
that the canonical PREVC state and trace contract are shared runtime-neutral surfaces,
while `omp/dist/agent/extensions/harness-omp-trace.ts` is the OMP-native event adapter.

## Visual direction

**Aesthetic:** operational editorial — technical documentation with a calm dark canvas,
bright terminal-green signal color, amber warnings, and dense but readable navigation.

**Differentiation anchor:** every conceptual page opens with a small lifecycle/status strip
showing the relevant PREVC state (`prepare → execute → validate → judge → refine → confirm`)
and the evidence expected at that boundary. This makes the site recognizable as a workflow
manual rather than a generic API document.

**Typography:** preserve Docusaurus readability; use a distinctive technical display face
only for headings and a highly legible sans-serif body face. Avoid decorative gradients and
motion that competes with code reading.

**Motion:** no essential motion. Use only short, transform/opacity transitions for locale
controls, focus states, and navigation. Respect `prefers-reduced-motion`.

## Public safety boundary

The public repository contains documentation and explicitly curated public fixtures only.
It must never receive:

- secrets, API keys, bearer tokens, private keys, credentials, or personal session data;
- private PREVC state, Judge receipts, review receipts, findings, trace streams, quality
  reports, or generated runtime evidence;
- private model/provider metadata or raw prompts;
- offensive skill families or unreviewed `codex/**` content;
- `omp/port-manifest.json` or private hash inventories unless explicitly approved.

A public-subset manifest and CI checks must reject excluded families, private evidence,
secret-shaped fixtures, and forbidden agent-to-skill routes. The checks must cover both the
normal public tree and any copied Codex/OMP asset subtree; they cannot inspect only
`website/docs`.

## CI and publication

Add path-scoped workflows:

- `validate-docs.yml`: Node 20, `npm ci` in `website`, typecheck, Docusaurus build,
  broken-link failure, and public-subset checks;
- `validate-harness.yml`: validate curated manifest and routing/public safety checks;
- `deploy-docs.yml`: build only after validation, upload `website/build` as a Pages
  artifact, and deploy to GitHub Pages on `main`.

The workflow must not print repository secrets. It uses least-privilege Pages permissions
and cancels superseded deployments.

## Data and content provenance

Start from the existing OpenCode guide's structure and adapt content from the current
private OMP source. Copy only public-safe explanations. Every claim about OMP behavior must
be traceable to one of:

- a source file in the private harness;
- a focused test or command contract;
- an explicitly labeled limitation or unavailable capability.

No private evidence bundle is copied into the public repository.

## Verification contract

Before delivery:

1. `npm ci --prefix website` succeeds on Node 20.
2. `npm run typecheck --prefix website` succeeds.
3. `npm run build --prefix website` succeeds with broken links configured to throw.
4. Both locale trees contain the same required navigation/document IDs.
5. Public-subset checks reject planted secrets, private evidence, offensive families, and
   forbidden routes.
6. The built site contains no private runtime paths, tokens, or local evidence files.
7. Browser smoke verification visits the default locale, `/en/`, PREVC, installation,
   tracing, security, and limitations pages.
8. No remote push or Pages deployment is claimed until the operator confirms the remote
   branch and Pages ownership state.
