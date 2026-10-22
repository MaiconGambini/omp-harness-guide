#!/usr/bin/env node
// harness-test-scope — the runner behind `npm run test:task` and `npm run test:full`.
//
// Why this exists. `npm test` used to be one hand-written list of 23 file paths passed
// to `tsx --test`. That had three problems, all of them measured:
//
//   1. It was the ONLY test command, so a lane verifying a one-line change ran 419 cases
//      across 27 files. There was no fast loop.
//   2. The list drifted from the directory: harness-trace, harness-omp-trace,
//      harness-opencode-trace and harness-prevc-lifecycle-contract existed on disk and
//      were never run by `npm test`. A hand-maintained list is a gap generator, so this
//      script DISCOVERS the files instead.
//   3. Unbounded concurrency collides: several suites export the real tree into
//      `omp/dist` and write `omp/port-manifest.json`, so parallel files fight over the
//      same paths (EBUSY/ENOTEMPTY on Windows) and dirty `git status`.
//
// It also runs the scope in TWO PASSES — plain node for JavaScript files, the tsx loader
// only for TypeScript ones. That is not just startup savings. `tests/harness-omp-trace`
// dynamically imports a generated `.ts` extension from a temp dir; Node 22 strips its
// types correctly, but with tsx registered process-wide the adapter persists nothing and
// the suite fails ("three session_start events must persist, 0 !== 3"). Registering the
// loader globally, as `tsx --test <every file>` did, breaks a file that is fine on its
// own — so the loader is scoped to the files that actually need it.
//
// Modes:
//   node scripts/harness-test-scope.mjs <path...>        task scope — explicit files only
//   node scripts/harness-test-scope.mjs --all            full scope — every tests/*.test.*
//   ... --concurrency N                                  cap parallel test files
//   ... --list                                           print the resolved scope, run nothing
//
// `test:task` REFUSES to run with no paths. That refusal is the point: "run the tests"
// with no scope is how a lane silently turns into a full-suite run.

import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const testsDir = path.join(root, "tests")

const TS_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"])

export function discoverTestFiles(directory = testsDir) {
  if (!fs.existsSync(directory)) return []
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.test\.(mjs|cjs|js|ts|tsx|mts|cts)$/.test(entry.name))
    .map((entry) => path.join("tests", entry.name))
    .sort()
}

/** True when any file in the scope needs a TypeScript loader. */
export function needsTypeScriptLoader(files) {
  return files.some((file) => TS_EXTENSIONS.has(path.extname(file)))
}

/**
 * Splits a scope into the pass that runs on plain node and the pass that needs the tsx
 * loader. Keeping them apart is a correctness requirement, not an optimization — see the
 * harness-omp-trace note in the header.
 */
export function splitByLoader(files) {
  const typescript = files.filter((file) => TS_EXTENSIONS.has(path.extname(file)))
  const javascript = files.filter((file) => !TS_EXTENSIONS.has(path.extname(file)))
  return { javascript, typescript }
}

export function parseArgs(argv) {
  const options = { all: false, list: false, concurrency: null, paths: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--all") { options.all = true; continue }
    if (arg === "--list") { options.list = true; continue }
    if (arg === "--concurrency") {
      const raw = Number(argv[index + 1])
      options.concurrency = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : null
      index += 1
      continue
    }
    if (arg.startsWith("--concurrency=")) {
      const raw = Number(arg.slice("--concurrency=".length))
      options.concurrency = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : null
      continue
    }
    if (arg.startsWith("--")) continue
    options.paths.push(arg)
  }
  return options
}

/**
 * Resolves the scope. Returns `{ ok, files, reason }` — an unscoped task run is a
 * refusal with a reason, not an empty pass.
 */
export function resolveScope(options, { discover = discoverTestFiles } = {}) {
  if (options.all || (options.concurrency !== null && options.paths.length === 0)) {
    const files = discover()
    if (files.length === 0) return { ok: false, reason: "no test files found under tests/" }
    return { ok: true, files, scope: "full" }
  }
  if (options.paths.length === 0) {
    return {
      ok: false,
      reason:
        "test:task requires explicit test paths, e.g. `npm run test:task -- tests/harness-trace.test.mjs`.\n" +
        "Running the whole suite to verify one lane is what this command exists to prevent — use `npm run test:full` when you actually want all of it.",
    }
  }
  const missing = options.paths.filter((file) => !fs.existsSync(path.resolve(root, file)))
  if (missing.length > 0) return { ok: false, reason: `test path(s) not found: ${missing.join(", ")}` }
  return { ok: true, files: options.paths, scope: "task" }
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const scope = resolveScope(options)
  if (!scope.ok) {
    console.error(`harness-test-scope: ${scope.reason}`)
    process.exitCode = 1
    return
  }

  if (options.list) {
    console.log(JSON.stringify({ scope: scope.scope, count: scope.files.length, files: scope.files }, null, 2))
    return
  }

  const { javascript, typescript } = splitByLoader(scope.files)
  const passes = [
    { label: "node", files: javascript, loader: false },
    { label: "tsx", files: typescript, loader: true },
  ].filter((pass) => pass.files.length > 0)

  const started = Date.now()
  let failed = false
  for (const pass of passes) {
    const nodeArgs = []
    if (pass.loader) nodeArgs.push("--import", "tsx")
    nodeArgs.push("--test")
    const concurrency = options.concurrency ?? 1
    nodeArgs.push(`--test-concurrency=${concurrency}`)
    nodeArgs.push(...pass.files)
    const result = spawnSync(process.execPath, nodeArgs, { cwd: root, stdio: "inherit" })
    if ((result.status ?? 1) !== 0) failed = true
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  const shape = passes.map((pass) => `${pass.label}:${pass.files.length}`).join(" + ")
  console.log(`\nharness-test-scope: ${scope.scope} scope, ${scope.files.length} file(s) (${shape}), ${seconds}s`)
  process.exitCode = failed ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) main()
