#!/usr/bin/env node
/**
 * validate-public-subset.mjs
 *
 * Deterministic public-subset validator for the omp-harness-guide repository.
 * Zero dependencies; runs on Node 20.
 *
 * Checks, in order, for every file of the complete repository (skipping
 * untracked `.git`, `website/node_modules`, and generated `website/build`).
 *   1. No excluded path may exist (private PREVC evidence, unreviewed
 *      subtrees, credential files).
 *   2. No offensive skill family may appear under `skills/`.
 *   3. Every remaining file must be allowlisted by scripts/harness-manifest.json.
 *   4. Allowlisted files must not contain secret-shaped content (private-key
 *      blocks, bearer material, sk- credentials, credential assignments),
 *      private evidence path strings, private user paths, or offensive
 *      skill routes.
 *   5. The pt-BR docs tree and the English mirror must have identical paths.
 *   6. The manifest itself must keep private evidence out of its include list.
 *
 * Diagnostics print only file paths and reason labels. Matched secret values
 * are never printed, logged, or written anywhere.
 *
 * Usage:
 *   node scripts/validate-public-subset.mjs                full repo scan
 *   node scripts/validate-public-subset.mjs --check-manifest
 *   node scripts/validate-public-subset.mjs --scan-build   content scan of website/build
 *   node scripts/validate-public-subset.mjs --self-test    planted-fixture negative tests
 *   node scripts/validate-public-subset.mjs --root <dir>   scan a different root
 *
 * Exit codes: 0 = pass, 1 = violations, 2 = fatal error.
 */

import { readFile, readdir, mkdir, mkdtemp, rm, writeFile, copyFile, lstat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..');
const MANIFEST_REL = 'scripts/harness-manifest.json';
const PT_DOCS_REL = 'website/docs';
const EN_DOCS_REL = 'website/i18n/en/docusaurus-plugin-content-docs/current';
const MAX_CONTENT_BYTES = 8 * 1024 * 1024;

// Files that legitimately contain the excluded path patterns (the manifest
// policy and this validator). They are exempt from path-string content checks
// only; secret checks still apply.
const PATH_STRING_EXEMPT = new Set([
  MANIFEST_REL,
  'scripts/validate-public-subset.mjs',
]);

// Private evidence families and credential shapes that must never ship.
const REQUIRED_EXCLUDES = [
  'docs/harness/state/**',
  'docs/harness/judge/**',
  'docs/harness/review/**',
  'docs/harness/findings/**',
  'docs/harness/traces/**',
  'docs/harness/quality/**',
  'codex/**',
  'omp/port-manifest.json',
  '*.env',
  '.env.*',
  '*.env.*',
  '*.pem',
  '*.key',
  '*.secret',
  '*.local.json',
  '*.local.jsonc',
  '.npmrc',
];

// Probe paths: an include pattern that matches any of these pulls private
// evidence into the public manifest.
const PRIVATE_PROBES = [
  'docs/harness/state/probe',
  'docs/harness/judge/probe',
  'docs/harness/review/probe',
  'docs/harness/findings/probe',
  'docs/harness/traces/probe',
  'docs/harness/quality/probe',
  'codex/probe',
  'omp/port-manifest.json',
];

const OFFENSIVE_FAMILIES = [
  'hiagosh',
  'recon',
  'redteam',
  'wstg',
  'auth-saml-sso-attack',
  'web-pentesting',
  'attack',
  'exploit',
  'hunt',
  'pentest',
];

// Reason label kept free of any secret-shaped literal so this file can scan
// itself: 'secret:' + 'credential-assignment' must never appear contiguous.
const R_CRED = 'secret:' + 'credential-assignment';

// --- glob matching ---------------------------------------------------------

function globToRegExp(pattern) {
  const parts = pattern.split('/');
  let re = '^';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part === '**') {
      if (i === parts.length - 1) {
        // Trailing `**` also matches the bare prefix (zero segments).
        re += '(?:[^/]+(?:/[^/]+)*)?';
      } else {
        re += '(?:[^/]+/)*';
      }
    } else {
      re += part
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\*/g, '[^/]*')
        .replace(/\\\?/g, '[^/]');
    }
    if (i < parts.length - 1) re += '/';
  }
  return new RegExp(re + '$');
}

// Patterns without a slash (e.g. `*.env`) match the basename at any depth.
function matchPattern(pattern, rel, base) {
  if (!pattern.includes('/')) return globToRegExp(pattern).test(base);
  return globToRegExp(pattern).test(rel);
}

function firstExcludeMatch(manifest, rel, base) {
  for (const pattern of manifest.exclude) {
    if (matchPattern(pattern, rel, base)) return pattern;
  }
  return null;
}

function isAllowlisted(manifest, rel, base) {
  return manifest.include.some((pattern) => matchPattern(pattern, rel, base));
}

// --- tree walking ----------------------------------------------------------

function compareNames(a, b) {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

async function walk(root, skipGenerated = true) {
  const files = [];
  const visit = async (rel) => {
    const abs = rel ? path.join(root, rel) : root;
    const entries = await readdir(abs, { withFileTypes: true });
    for (const entry of entries.sort(compareNames)) {
      if (entry.name === '.git') continue;
      const child = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (
          skipGenerated &&
          (child === 'website/node_modules' ||
            child === 'website/build' ||
            child === 'website/.docusaurus')
        ) continue;
        await visit(child);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        files.push(child);
      }
    }
  };
  await visit('');
  return files.sort();
}


const GENERATED_DIRS = [
  'website/node_modules',
  'website/build',
  'website/.docusaurus',
];
function trackedGeneratedFiles(root) {
  if (!existsSync(path.join(root, '.git'))) return [];
  const result = spawnSync(
    'git',
    ['-C', root, 'ls-files', '--', ...GENERATED_DIRS],
    { encoding: 'utf8' },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('git ls-files failed');
  return String(result.stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
async function readContent(root, rel) {
  const abs = path.join(root, rel);
  const st = await lstat(abs);
  if (st.isSymbolicLink()) return { kind: 'symlink' };
  if (st.size > MAX_CONTENT_BYTES) return { kind: 'oversized' };
  return { kind: 'content', value: await readFile(abs, 'utf8') };
}

// --- content checks --------------------------------------------------------

const RE_PRIVATE_KEY = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/i;
const RE_BEARER = /bearer[ \t]+[A-Za-z0-9._~+\/-]{16,}/i;
const RE_SK = /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}\b|sk_live_[A-Za-z0-9]{16,}\b/;
const RE_AWS_ACCESS_KEY = /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/;
const RE_GITHUB_TOKEN = /\b(?:ghp|gho|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/;
const RE_JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/;
const RE_PRIVATE_RUNTIME_RECORD =
  /(?:["']?\b(?:session[_-]?id|raw[_-]?prompt|system[_-]?prompt)["']?)\s*:/i;
const RE_CRED_ASSIGN =
  /["']?(?:password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?key|client[_-]?secret|auth[_-]?token|refresh[_-]?token|access[_-]?token|private[_-]?key|token)["']?\s*[:=]\s*(?:"[A-Za-z0-9._~+\/=-]{12,}"|'[A-Za-z0-9._~+\/=-]{12,}'|[A-Za-z0-9._~+\/=-]{16,})/i;
const RE_PRIVATE_EVIDENCE = /docs[/\\]harness[/\\](?:state|judge|review|findings|traces|quality)(?:[/\\]|$)/i;
const RE_CODEX_PATH = /(?:^|[/\\])codex[/\\]/i;
const RE_PORT_MANIFEST = /(?:^|[/\\])omp[/\\]port-manifest\.json/i;
const RE_USER_PATH =
  /(?:[A-Za-z]:[/\\](?:Users|home)[/\\]|(?:^|[/\\])(?:Users|home)[/\\])[^/\\\r\n]+/iu;
const OFFENSIVE_ALT = OFFENSIVE_FAMILIES.map((family) =>
  family.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
).join('|');
const RE_OFFENSIVE_ROUTE = new RegExp(`(?:^|[/\\\\])skills[/\\\\](?:${OFFENSIVE_ALT})[/\\\\-]`, 'i');

const PRIVATE_EVIDENCE_SEGMENTS = new Set(['state', 'judge', 'review', 'findings', 'traces', 'quality']);

function forbiddenPathOf(rel) {
  const segments = rel.replace(/\\/g, '/').split('/');
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i].toLowerCase();
    if (
      segment === 'docs' &&
      segments[i + 1]?.toLowerCase() === 'harness' &&
      PRIVATE_EVIDENCE_SEGMENTS.has(segments[i + 2]?.toLowerCase())
    ) {
      return 'private-evidence-path';
    }
    if (segment === 'codex') return 'private-evidence-path:codex';
    if (
      segment === 'omp' &&
      segments[i + 1]?.toLowerCase() === 'port-manifest.json'
    ) {
      return 'private-evidence-path:port-manifest';
    }
  }
  return null;
}
function contentViolations(rel, content, exemptPathStrings) {
  const out = [];
  if (RE_PRIVATE_KEY.test(content)) out.push(`${rel}: secret:private-key`);
  if (RE_BEARER.test(content)) out.push(`${rel}: secret:bearer-token`);
  if (RE_SK.test(content)) out.push(`${rel}: secret:sk-credential`);
  if (RE_AWS_ACCESS_KEY.test(content)) out.push(`${rel}: secret:aws-access-key`);
  if (RE_GITHUB_TOKEN.test(content)) out.push(`${rel}: secret:github-token`);
  if (RE_JWT.test(content)) out.push(`${rel}: secret:jwt`);
  if (RE_PRIVATE_RUNTIME_RECORD.test(content)) out.push(`${rel}: private-runtime-record`);
  if (RE_CRED_ASSIGN.test(content)) out.push(`${rel}: ${R_CRED}`);
  if (!exemptPathStrings) {
    if (RE_PRIVATE_EVIDENCE.test(content)) out.push(`${rel}: private-evidence-path`);
    if (RE_CODEX_PATH.test(content)) out.push(`${rel}: private-evidence-path:codex`);
    if (RE_PORT_MANIFEST.test(content)) out.push(`${rel}: private-evidence-path:port-manifest`);
    if (RE_USER_PATH.test(content)) out.push(`${rel}: private-path`);
    if (RE_OFFENSIVE_ROUTE.test(content)) out.push(`${rel}: offensive-route`);
  }
  return out;
}

function offensiveFamilyOf(rel) {
  const segments = rel.replace(/\\/g, '/').toLowerCase().split('/');
  for (let i = 0; i < segments.length - 1; i += 1) {
    if (segments[i] !== 'skills') continue;
    const candidate = segments[i + 1];
    for (const family of OFFENSIVE_FAMILIES) {
      if (candidate === family || candidate.startsWith(`${family}-`)) return family;
    }
  }
  return null;
}

// --- locale parity ---------------------------------------------------------

async function collectDocs(root, rel) {
  let entries;
  try {
    entries = await readdir(path.join(root, rel), { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
  const out = [];
  const prefixLen = rel.length + 1;
  for (const entry of entries.sort(compareNames)) {
    if (entry.isDirectory()) {
      const children = await collectDocs(root, `${rel}/${entry.name}`);
      if (children) out.push(...children);
    } else if (entry.isFile()) {
      out.push(`${rel}/${entry.name}`.slice(prefixLen));
    }
  }
  return out.sort();
}

async function localeParity(root) {
  const pt = await collectDocs(root, PT_DOCS_REL);
  const en = await collectDocs(root, EN_DOCS_REL);
  if (pt === null && en === null) return [];
  const ptSet = new Set(pt ?? []);
  const enSet = new Set(en ?? []);
  const violations = [];
  for (const rel of [...ptSet].sort()) {
    if (!enSet.has(rel)) violations.push(`${PT_DOCS_REL}/${rel}: locale-mismatch:missing-en`);
  }
  for (const rel of [...enSet].sort()) {
    if (!ptSet.has(rel)) violations.push(`${EN_DOCS_REL}/${rel}: locale-mismatch:extra-en`);
  }
  return violations;
}

// --- manifest policy -------------------------------------------------------

const REQUIRED_INCLUDES = [
  'README.md',
  '.gitignore',
  '.github/CODEOWNERS',
  'website/**',
  'scripts/harness-manifest.json',
  'scripts/validate-public-subset.mjs',
  '.github/workflows/**',
];

function validateManifest(manifest) {
  const out = [];
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    return [`${MANIFEST_REL}: manifest:malformed:not-object`];
  }
  if (typeof manifest.version !== 'number') {
    out.push(`${MANIFEST_REL}: manifest:malformed:version-not-number`);
  }
  if (!Array.isArray(manifest.include) || manifest.include.length === 0) {
    out.push(`${MANIFEST_REL}: manifest:malformed:include-missing`);
  }
  if (!Array.isArray(manifest.exclude)) {
    out.push(`${MANIFEST_REL}: manifest:malformed:exclude-missing`);
  }
  if (out.length > 0) return out;
  const includeSet = new Set(manifest.include);
  for (const required of REQUIRED_INCLUDES) {
    if (!includeSet.has(required)) {
      out.push(`${MANIFEST_REL}: manifest:include-missing`);
    }
  }
  if (includeSet.size !== REQUIRED_INCLUDES.length || manifest.include.length !== includeSet.size) {
    out.push(`${MANIFEST_REL}: manifest:include-set-drift`);
  }
  for (const pattern of manifest.include) {
    if (typeof pattern !== 'string' || pattern.length === 0) {
      out.push(`${MANIFEST_REL}: manifest:malformed:empty-include-pattern`);
    } else if (!REQUIRED_INCLUDES.includes(pattern)) {
      out.push(`${MANIFEST_REL}: manifest:unexpected-include`);
    }
  }
  for (const pattern of manifest.exclude) {
    if (typeof pattern !== 'string' || pattern.length === 0) {
      out.push(`${MANIFEST_REL}: manifest:malformed:empty-exclude-pattern`);
    } else if (pattern === '**') {
      out.push(`${MANIFEST_REL}: manifest:malformed:blanket-exclude`);
    }
  }
  for (const required of REQUIRED_EXCLUDES) {
    if (!manifest.exclude.includes(required)) {
      out.push(`${MANIFEST_REL}: manifest:exclude-missing:${required}`);
    }
  }
  for (const includePattern of manifest.include) {
    for (const probe of PRIVATE_PROBES) {
      if (matchPattern(includePattern, probe, path.posix.basename(probe))) {
        out.push(`${MANIFEST_REL}: manifest:include-matches-private-path`);
        break;
      }
    }
  }
  return out;
}

async function loadManifest(root) {
  const raw = await readFile(path.join(root, MANIFEST_REL), 'utf8');
  return JSON.parse(raw);
}

// --- scan modes ------------------------------------------------------------

async function scanTree(root, manifest) {
  const violations = trackedGeneratedFiles(root).map(
    (rel) => `${rel}: generated-directory-tracked`,
  );
  const files = await walk(root);
  for (const rel of files) {
    const base = path.posix.basename(rel);
    const excludedPattern = firstExcludeMatch(manifest, rel, base);
    if (excludedPattern) {
      violations.push(`${rel}: excluded-path`);
      continue;
    }
    const forbiddenPath = forbiddenPathOf(rel);
    if (forbiddenPath) {
      violations.push(`${rel}: ${forbiddenPath}`);
      continue;
    }
    const family = offensiveFamilyOf(rel);
    if (family) {
      violations.push(`${rel}: offensive-skill-family:${family}`);
      continue;
    }
    if (!isAllowlisted(manifest, rel, base)) {
      violations.push(`${rel}: not-in-allowlist`);
      continue;
    }
    const result = await readContent(root, rel);
    if (result.kind === 'symlink') {
      violations.push(`${rel}: symlink-not-allowed`);
    } else if (result.kind === 'oversized') {
      violations.push(`${rel}: oversized-unscanned`);
    } else {
      violations.push(...contentViolations(rel, result.value, PATH_STRING_EXEMPT.has(rel)));
    }
  }
  violations.push(...(await localeParity(root)));
  return { violations: violations.sort(), files: files.length };
}

async function scanMode(root) {
  let manifest;
  try {
    manifest = await loadManifest(root);
  } catch {
    return { violations: [`${MANIFEST_REL}: manifest:unreadable`], files: 0 };
  }
  const policy = validateManifest(manifest);
  if (policy.length > 0) return { violations: policy.sort(), files: 0 };
  return scanTree(root, manifest);
}

// Content-only scan of the generated site output: allowlist and locale rules
// do not apply to build artifacts, but secrets and private path strings must
// never reach the published pages.
async function scanBuildViolations(root) {
  const buildRoot = path.join(root, 'website', 'build');
  let buildStat;
  try {
    buildStat = await lstat(buildRoot);
  } catch (err) {
    if (err && err.code === 'ENOENT') return null; // no build output present
    throw err;
  }
  if (buildStat.isSymbolicLink() || !buildStat.isDirectory()) {
    return ['website/build: build-root-not-directory'];
  }
  const files = await walk(buildRoot, false);
  const violations = [];
  for (const rel of files) {
    const forbiddenPath = forbiddenPathOf(rel);
    if (forbiddenPath) {
      violations.push(`${rel}: ${forbiddenPath}`);
      continue;
    }
    const result = await readContent(buildRoot, rel);
    if (result.kind === 'symlink') {
      violations.push(`${rel}: symlink-not-allowed`);
    } else if (result.kind === 'oversized') {
      violations.push(`${rel}: oversized-unscanned`);
    } else {
      violations.push(...contentViolations(rel, result.value, false));
    }
  }
  return violations.sort();
}

// --- self-test -------------------------------------------------------------

async function buildCleanTree(root) {
  const docs = [
    ['website/docs/intro.md', '# Introducao\n\nGuia do harness Oh My Pi.\n'],
    ['website/docs/concepts/why-a-harness.md', '# Por que um harness\n\nCiclos previsiveis de trabalho.\n'],
    ['website/docs/reference/commands.md', '# Comandos\n\nComandos publicos do harness.\n'],
    [
      'website/i18n/en/docusaurus-plugin-content-docs/current/intro.md',
      '# Introduction\n\nOh My Pi Harness guide.\n',
    ],
    [
      'website/i18n/en/docusaurus-plugin-content-docs/current/concepts/why-a-harness.md',
      '# Why a harness\n\nPredictable work cycles.\n',
    ],
    [
      'website/i18n/en/docusaurus-plugin-content-docs/current/reference/commands.md',
      '# Commands\n\nPublic harness commands.\n',
    ],
  ];
  for (const [rel, content] of docs) {
    const target = path.join(root, ...rel.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await mkdir(path.join(root, '.github/workflows'), { recursive: true });
  await writeFile(path.join(root, 'README.md'), '# Harness Oh My Pi\n\nPublic bilingual guide.\n', 'utf8');
  const copied = [
    'scripts/harness-manifest.json',
    'scripts/validate-public-subset.mjs',
    '.github/CODEOWNERS',
    '.github/workflows/validate-docs.yml',
    '.github/workflows/validate-harness.yml',
    '.github/workflows/deploy-docs.yml',
  ];
  for (const rel of copied) {
    try {
      await copyFile(path.join(DEFAULT_ROOT, rel), path.join(root, rel));
    } catch {
      // Optional inputs: the planted-fixture checks below remain meaningful
      // without them.
    }
  }
}

async function copyTree(src, dst) {
  await mkdir(dst, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      await copyTree(from, to);
    } else if (entry.isFile()) {
      await copyFile(from, to);
    }
  }
}

async function selfTest() {
  const base = await mkdtemp(path.join(tmpdir(), 'omp-public-subset-'));
  const clean = path.join(base, 'clean');
  const results = [];
  try {
    await buildCleanTree(clean);
    const cleanRun = await scanMode(clean);
    results.push({
      name: 'clean tree passes',
      ok: cleanRun.violations.length === 0,
      detail: cleanRun.violations,
    });

    // Fixture string literals are split so this file never trips its own
    // secret scanner; fixture content is written only to temp directories.
    const fixtures = [
      {
        name: 'bearer token',
        file: 'website/docs/concepts/tracing.md',
        content: ['Guia de rastreamento.', 'Authorization: Bearer ' + 'ab12cd34ef56ab12cd34ef56'],
        expect: 'secret:bearer-token',
      },
      {
        name: 'aws access key',
        file: 'website/docs/reference/commands.md',
        content: ['Provider key: ' + 'AKIA' + '1234567890ABCDEF'],
        expect: 'secret:aws-access-key',
      },
      {
        name: 'temporary aws access key',
        file: 'website/docs/reference/commands.md',
        content: ['Temporary provider key: ' + 'ASIA' + '1234567890ABCDEF'],
        expect: 'secret:aws-access-key',
      },
      {
        name: 'github token',
        file: 'website/docs/reference/commands.md',
        content: ['CI token: ' + 'ghp_' + 'ab12cd34ef56gh78ij90kl12mn34'],
        expect: 'secret:github-token',
      },
      {
        name: 'jwt credential',
        file: 'website/docs/reference/commands.md',
        content: ['Session: ' + 'eyJ' + 'abcdefgh.' + 'ijklmnop.' + 'qrstuvwx'],
        expect: 'secret:jwt',
      },
      {
        name: 'sk credential',
        file: 'website/docs/reference/commands.md',
        content: ['Referencia de comandos.', 'chave: ' + 'sk-' + 'ab12cd34ef56ab12cd34ef56'],
        expect: 'secret:sk-credential',
      },
      {
        name: 'prefixed sk credential',
        file: 'website/docs/reference/commands.md',
        content: ['Provider key: ' + 'sk-' + 'proj-' + 'ab12cd34ef56ab12cd34ef56'],
        expect: 'secret:sk-credential',
      },
      {
        name: 'private runtime record',
        file: 'website/docs/reference/repository-structure.md',
        content: ['{"session_' + 'id": "redacted"}'],
        expect: 'private-runtime-record',
      },
      {
        name: 'private user path',
        file: 'website/docs/reference/repository-structure.md',
        content: ['Local path: C:\\Users\\Jane Doe\\workspace'],
        expect: 'private-path',
      },
      {
        name: 'private unix path',
        file: 'website/docs/reference/repository-structure.md',
        content: ['Local path: ' + '/ho' + 'me/' + 'equipe'],
        expect: 'private-path',
      },
      {
        name: 'private key header',
        file: 'website/docs/adoption/security.md',
        content: ['Seguranca.', '-----BEGIN ' + 'RSA PRIVATE KEY-----'],
        expect: 'secret:private-key',
      },
      {
        name: 'credential assignment',
        file: 'website/docs/reference/repository-structure.md',
        content: ['Estrutura do repositorio.', 'client_secret = ' + '"ab12cd34ef56ab12cd34ef56"'],
        expect: R_CRED,
      },
      {
        name: 'quoted credential assignment',
        file: 'website/docs/reference/repository-structure.md',
        content: ['{"api_' + 'key":"' + 'ab12cd34ef56ab12cd34ef56' + '"}'],
        expect: R_CRED,
      },
      {
        name: 'multiline credential assignment',
        file: 'website/docs/reference/repository-structure.md',
        content: ['api_' + 'key:\n  "ab12cd34ef56ab12cd34ef56"'],
        expect: R_CRED,
      },
      {
        name: 'credential filename',
        file: 'website/.env.production',
        content: ['PUBLIC metadata only.'],
        expect: 'excluded-path',
      },
      {
        name: 'excluded private path',
        file: 'docs/harness/state/current.json',
        content: ['{}'],
        expect: 'excluded-path',
      },
      {
        name: 'offensive skill path',
        file: 'skills/redteam-hunt-xss/SKILL.md',
        content: ['Habilidade.', 'ok'],
        expect: 'offensive-skill-family',
      },
      {
        name: 'nested private path',
        file: 'website/docs/harness/state/session.json',
        content: ['{}'],
        expect: 'private-evidence-path',
      },
      {
        name: 'nested offensive skill path',
        file: 'website/skills/redteam-hunt-xss/SKILL.md',
        content: ['Public text.'],
        expect: 'offensive-skill-family',
      },
      {
        name: 'locale parity mismatch',
        file: 'website/docs/concepts/extra.md',
        content: ['Documento sem espelho em ingles.'],
        expect: 'locale-mismatch:missing-en',
      },
      {
        name: 'secret in generated build output',
        file: 'website/build/index.html',
        content: ['<html>', 'Authorization: Bearer ' + 'ab12cd34ef56ab12cd34ef56', '</html>'],
        expect: 'secret:bearer-token',
        scanBuild: true,
      },
    ];

    for (const fx of fixtures) {
      const tree = path.join(
        base,
        'fx-' + fx.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, ''),
      );
      await copyTree(clean, tree);
      const target = path.join(tree, ...fx.file.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, fx.content.join('\n') + '\n', 'utf8');
      const violations = fx.scanBuild
        ? (await scanBuildViolations(tree)) ?? []
        : (await scanMode(tree)).violations;
      const hit = violations.some((violation) => violation.includes(fx.expect));
      results.push({ name: fx.name, ok: hit, detail: violations });
    }
    const broadManifestTree = path.join(base, 'fx-broad-manifest');
    await copyTree(clean, broadManifestTree);
    const broadManifestFile = path.join(broadManifestTree, ...MANIFEST_REL.split('/'));
    const broadManifest = JSON.parse(await readFile(broadManifestFile, 'utf8'));
    broadManifest.include = ['**'];
    await writeFile(broadManifestFile, JSON.stringify(broadManifest), 'utf8');
    const privateRuntimeFile = path.join(broadManifestTree, 'private', 'runtime.txt');
    await mkdir(path.dirname(privateRuntimeFile), { recursive: true });
    await writeFile(privateRuntimeFile, 'private runtime note\n', 'utf8');
    const broadManifestViolations = (await scanMode(broadManifestTree)).violations;
    results.push({
      name: 'broad manifest include',
      ok: broadManifestViolations.some((violation) => violation.includes('manifest:unexpected-include')),
      detail: broadManifestViolations,
    });
    const oversizedTree = path.join(base, 'fx-oversized-allowlisted-file');
    await copyTree(clean, oversizedTree);
    const oversizedFile = path.join(oversizedTree, 'website', 'docs', 'oversized.md');
    await mkdir(path.dirname(oversizedFile), { recursive: true });
    await writeFile(oversizedFile, Buffer.alloc(MAX_CONTENT_BYTES + 1, 120));
    const oversizedViolations = (await scanMode(oversizedTree)).violations;
    results.push({
      name: 'oversized allowlisted file',
      ok: oversizedViolations.some((violation) => violation.includes('oversized-unscanned')),
      detail: oversizedViolations,
    });
  } finally {
    await rm(base, { recursive: true, force: true });
  }

  let failed = 0;
  for (const result of results) {
    if (result.ok) {
      console.log(`self-test: PASS ${result.name}`);
    } else {
      failed += 1;
      console.log(`self-test: FAIL ${result.name}`);
      for (const detail of result.detail) console.log(`    ${detail}`);
    }
  }
  console.log(
    failed === 0
      ? `self-test: all ${results.length} checks passed`
      : `self-test: ${failed} of ${results.length} checks failed`,
  );
  return failed === 0 ? 0 : 1;
}

// --- CLI -------------------------------------------------------------------

function printUsage() {
  console.log(
    [
      'Usage:',
      '  node scripts/validate-public-subset.mjs                full repo scan',
      '  node scripts/validate-public-subset.mjs --check-manifest',
      '  node scripts/validate-public-subset.mjs --scan-build   content scan of website/build',
      '  node scripts/validate-public-subset.mjs --self-test    planted-fixture negative tests',
      '  node scripts/validate-public-subset.mjs --root <dir>   scan a different root',
    ].join('\n'),
  );
}

function printReport(label, violations, extra) {
  if (violations.length === 0) {
    console.log(`${label}: PASS${extra ? ` (${extra})` : ''}`);
    return 0;
  }
  console.log(`${label}: FAIL (${violations.length} violation(s))`);
  for (const violation of violations) console.log(`  - ${violation}`);
  return 1;
}

async function main() {
  const args = process.argv.slice(2);
  let root = DEFAULT_ROOT;
  let mode = 'scan';
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--root') {
      const value = args[++i];
      if (!value) {
        console.error('validate-public-subset: --root requires a directory');
        return 2;
      }
      root = path.resolve(value);
    } else if (arg === '--self-test') {
      mode = 'self-test';
    } else if (arg === '--check-manifest') {
      mode = 'check-manifest';
    } else if (arg === '--scan-build') {
      mode = 'scan-build';
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      return 0;
    } else {
      console.error(`validate-public-subset: unknown option: ${arg}`);
      printUsage();
      return 2;
    }
  }

  if (mode === 'self-test') return selfTest();

  if (mode === 'check-manifest') {
    let manifest;
    try {
      manifest = await loadManifest(root);
    } catch {
      console.error(`${MANIFEST_REL}: manifest:unreadable`);
      return 2;
    }
    return printReport('manifest-policy', validateManifest(manifest));
  }

  if (mode === 'scan-build') {
    const violations = await scanBuildViolations(root);
    if (violations === null) {
      console.log('scan-build: FAIL (website/build is missing)');
      return 1;
    }
    return printReport('scan-build', violations);
  }

  const result = await scanMode(root);
  return printReport('public-subset', result.violations, `${result.files} file(s) scanned`);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(`validate-public-subset: fatal: ${err && err.code ? err.code : 'unexpected-error'}`);
    process.exitCode = 2;
  });
