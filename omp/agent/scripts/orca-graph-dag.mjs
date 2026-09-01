#!/usr/bin/env node
// orca-graph-dag.mjs — read-only DAG/wave computation over a feature_list.json.
//
// Usage:  node orca-graph-dag.mjs [path-to-feature_list.json]   (default: ./feature_list.json)
// Output: JSON on stdout { waves, maxChainDepth, cycles, missingDeps, features }
// Exit:   0 = clean; 1 = cycles and/or missing dependency references (caller should gate);
//         2 = cannot read/parse input.
//
// Deterministic: ids are sorted; no Date/Math.random. Never mutates anything.
// This is the graph half of orca-harness-spec-reader. The tasks.md prose enrichment
// (acceptance_criteria, scope, files, risk, feature_flag, rollout) is done by the skill.

import { readFileSync } from 'node:fs';

const path = process.argv[2] || 'feature_list.json';

let raw;
try {
  raw = JSON.parse(readFileSync(path, 'utf8'));
} catch (e) {
  console.error(`ERROR: cannot read/parse ${path}: ${e.message}`);
  process.exit(2);
}

const features = Array.isArray(raw) ? raw : (raw.features || []);
const byId = new Map();
for (const f of features) {
  if (!f || typeof f.id !== 'string') {
    console.error('ERROR: every feature needs a string "id"');
    process.exit(2);
  }
  byId.set(f.id, f);
}
const ids = [...byId.keys()].sort();

// Dependency references that do not exist in this feature_list (external/typo).
const missingDeps = [];
for (const id of ids) {
  for (const d of byId.get(id).dependencies || []) {
    if (!byId.has(d)) missingDeps.push({ feature: id, missing: d });
  }
}

// Wave = longest dependency chain to a root (1-based). Cycles → unresolved (null).
const wave = new Map();
const visiting = new Set();
const rawCycles = [];

function assign(id, stack) {
  if (wave.has(id)) return wave.get(id);
  if (visiting.has(id)) {
    const i = stack.indexOf(id);
    rawCycles.push(stack.slice(i).concat(id));
    return null;
  }
  visiting.add(id);
  let w = 1;
  let unresolved = false;
  for (const d of (byId.get(id).dependencies || []).slice().sort()) {
    if (!byId.has(d)) continue; // missing dep reported separately; treated as satisfied
    const dw = assign(d, stack.concat(id));
    if (dw === null) { unresolved = true; continue; }
    w = Math.max(w, dw + 1);
  }
  visiting.delete(id);
  if (unresolved) return null; // sits in/after a cycle — no finite wave
  wave.set(id, w);
  return w;
}
for (const id of ids) assign(id, []);

// De-duplicate cycles (same node set reported once).
const seen = new Set();
const cycles = [];
for (const c of rawCycles) {
  const key = [...new Set(c)].sort().join(',');
  if (!seen.has(key)) { seen.add(key); cycles.push(c); }
}

// Group into waves.
const byWave = new Map();
for (const id of ids) {
  if (!wave.has(id)) continue; // cyclic/unresolved omitted
  const w = wave.get(id);
  if (!byWave.has(w)) byWave.set(w, []);
  byWave.get(w).push(id);
}
const waves = [...byWave.keys()].sort((a, b) => a - b)
  .map(w => ({ wave: w, featureIds: byWave.get(w).sort() }));
const maxChainDepth = waves.length ? Math.max(...waves.map(x => x.wave)) : 0;

// Feature passthrough (feature_list-level fields only; skill adds tasks.md fields).
const outFeatures = ids.map(id => {
  const f = byId.get(id);
  return {
    id: f.id,
    title: f.title ?? '',
    dependencies: f.dependencies ?? [],
    status: f.status ?? 'not_started',
    verification: f.verification ?? '',
    expected_behavior: f.user_visible_behavior ?? '',
    wave: wave.has(id) ? wave.get(id) : null // null = trapped in a cycle
  };
});

console.log(JSON.stringify(
  { waves, maxChainDepth, cycles, missingDeps, features: outFeatures },
  null, 2
));
process.exit(cycles.length || missingDeps.length ? 1 : 0);
