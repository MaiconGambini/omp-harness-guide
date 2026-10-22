#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { rotateTrace as canonicalRotateTrace, readTrace } from './harness-trace.mjs';

const MAX_HANDOFF_LINES = 500;
const TARGET_ACTIVE_LINES = 250;
const MAX_TRACE_LINES = 1000;

export function rotateHandoff(projectRoot, dryRun = false) {
  if (!projectRoot || typeof projectRoot !== 'string') {
    throw new Error('projectRoot is required and must be a string path');
  }

  const handoffPath = path.join(projectRoot, 'docs', 'harness', 'session-handoff.md');
  const handoffsDir = path.join(projectRoot, 'docs', 'harness', 'handoffs');
  
  if (!fs.existsSync(handoffPath)) {
    return { ok: true, status: 'no_handoff' };
  }

  const lines = fs.readFileSync(handoffPath, 'utf8').split('\n');
  const lineCount = lines.length;

  if (lineCount < MAX_HANDOFF_LINES) {
    return { ok: true, status: 'under_limit', lines: lineCount };
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  let archivePath = path.join(handoffsDir, `${dateStr}.md`);
  let counter = 1;
  while (fs.existsSync(archivePath)) {
    archivePath = path.join(handoffsDir, `${dateStr}-${counter}.md`);
    counter++;
  }

  if (dryRun) {
    return { ok: true, status: 'needs_rotation', lines: lineCount, targetArchive: archivePath };
  }

  if (!fs.existsSync(handoffsDir)) {
    fs.mkdirSync(handoffsDir, { recursive: true });
  }

  // Archive full content atomically
  const tempArchive = `${archivePath}.tmp.${Date.now()}`;
  fs.writeFileSync(tempArchive, lines.join('\n'), 'utf8');
  fs.renameSync(tempArchive, archivePath);

  // Keep header and recent lines so that total lines <= TARGET_ACTIVE_LINES (250)
  const headerCount = 20;
  const tailCount = 200;
  const headerLines = lines.slice(0, headerCount);
  const tailLines = lines.slice(-tailCount);
  const newActiveContent = [
    ...headerLines,
    '',
    `> [HISTÓRICO ARQUIVADO] Conteúdo anterior rotacionado para ${path.relative(projectRoot, archivePath)}.`,
    '',
    ...tailLines
  ].join('\n');

  const finalLines = newActiveContent.split('\n').length;
  if (finalLines > TARGET_ACTIVE_LINES) {
    throw new Error(`Rotation invariant violated: active lines ${finalLines} > ${TARGET_ACTIVE_LINES}`);
  }

  const tempHandoff = `${handoffPath}.tmp.${Date.now()}`;
  fs.writeFileSync(tempHandoff, newActiveContent, 'utf8');
  fs.renameSync(tempHandoff, handoffPath);

  return {
    ok: true,
    status: 'rotated',
    originalLines: lineCount,
    archivedTo: archivePath,
    newActiveLines: finalLines
  };
}

export function rotateTraceIfNeeded(projectRoot, dryRun = false) {
  if (!projectRoot || typeof projectRoot !== 'string') {
    throw new Error('projectRoot is required and must be a string path');
  }

  const tracePath = path.join(projectRoot, 'docs', 'harness', 'traces', 'trace.jsonl');
  if (!fs.existsSync(tracePath)) {
    return { ok: true, status: 'no_trace' };
  }

  const traceData = readTrace(projectRoot);
  const count = traceData.records ? traceData.records.length : 0;

  if (count < MAX_TRACE_LINES) {
    return { ok: true, status: 'under_limit', events: count };
  }

  if (dryRun) {
    return { ok: true, status: 'needs_rotation', events: count };
  }

  // Delegate strictly to canonical harness-trace rotation for cryptographic hash integrity & lock
  const rotateResult = canonicalRotateTrace(projectRoot);
  return {
    ok: rotateResult.ok,
    status: rotateResult.ok ? 'rotated' : 'error',
    details: rotateResult
  };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('harness-handoff-rotate.mjs')) {
  try {
    const args = process.argv.slice(2);
    const rootIndex = args.indexOf('--root');
    let projectRoot = process.cwd();
    if (rootIndex !== -1) {
      const nextArg = args[rootIndex + 1];
      if (!nextArg || nextArg.startsWith('--')) {
        console.error('Error: --root requires a directory path');
        process.exit(1);
      }
      projectRoot = path.resolve(nextArg);
    }
    const dryRun = args.includes('--check');

    const handoffRes = rotateHandoff(projectRoot, dryRun);
    const traceRes = rotateTraceIfNeeded(projectRoot, dryRun);

    console.log(JSON.stringify({ handoff: handoffRes, trace: traceRes }, null, 2));
  } catch (err) {
    console.error(`harness-handoff-rotate error: ${err.message}`);
    process.exit(1);
  }
}
