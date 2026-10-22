#!/usr/bin/env node
/**
 * harness-lane-receipt.mjs
 *
 * Durable lane receipt manager (AC-6).
 * Persists docs/harness/lanes/<run>/<lane>.json atomically before the `ask`.
 *
 * Usage:
 *   node harness-lane-receipt.mjs --write --run <id> --lane <id> --json '<envelope>' [--root <dir>]
 *   node harness-lane-receipt.mjs --validate <path>
 *   node harness-lane-receipt.mjs --list --run <id> [--root <dir>]
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const VALID_STATUSES = new Set(['ok', 'blocked', 'failed'])

/**
 * Validate an identifier (run ID or lane ID).
 * Rejects path separators ('/', '\') or '..'.
 *
 * @param {unknown} id
 * @returns {boolean}
 */
export function isValidId(id) {
  if (typeof id !== 'string') return false
  const trimmed = id.trim()
  if (!trimmed) return false
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    return false
  }
  if (/[\0<>:"|?*]/.test(trimmed)) {
    return false
  }
  return true
}

/**
 * Validate an envelope object.
 *
 * @param {unknown} envelope
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateEnvelope(envelope) {
  const errors = []
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return { valid: false, errors: ['Envelope must be a non-null object'] }
  }

  const { status, files, summary } = envelope

  if (typeof status !== 'string' || !VALID_STATUSES.has(status)) {
    errors.push(`Invalid status "${status}": must be one of ok, blocked, failed`)
  }

  if (!Array.isArray(files)) {
    errors.push('Field "files" must be an array of strings')
  } else {
    for (let i = 0; i < files.length; i++) {
      if (typeof files[i] !== 'string') {
        errors.push(`Field "files[${i}]" must be a string`)
      }
    }
  }

  if (typeof summary !== 'string' || summary.trim().length === 0) {
    errors.push('Field "summary" must be a non-empty string')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Write a lane receipt atomically.
 *
 * @param {{
 *   root?: string,
 *   run: string,
 *   lane: string,
 *   envelope: Record<string, unknown> | string
 * }} options
 * @returns {{ path: string, receipt: Record<string, unknown> }}
 */
export function writeReceipt({ root = process.cwd(), run, lane, envelope }) {
  if (!isValidId(run)) {
    throw new Error(`Invalid run ID "${run}": cannot contain path separators or ".."`)
  }
  if (!isValidId(lane)) {
    throw new Error(`Invalid lane ID "${lane}": cannot contain path separators or ".."`)
  }

  let parsed = envelope
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch (err) {
      throw new Error(`Failed to parse envelope JSON: ${err.message}`)
    }
  }

  const validation = validateEnvelope(parsed)
  if (!validation.valid) {
    throw new Error(`Invalid receipt envelope: ${validation.errors.join('; ')}`)
  }

  const targetDir = path.resolve(root, 'docs', 'harness', 'lanes', run)
  fs.mkdirSync(targetDir, { recursive: true })

  const finalPath = path.join(targetDir, `${lane}.json`)
  const tmpPath = path.join(
    targetDir,
    `.${lane}.json.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`
  )

  const receipt = {
    run,
    lane,
    ...parsed,
    writtenAt: new Date().toISOString(),
  }

  const content = JSON.stringify(receipt, null, 2) + '\n'

  try {
    fs.writeFileSync(tmpPath, content, 'utf8')
    try {
      fs.renameSync(tmpPath, finalPath)
    } catch (renameErr) {
      if (process.platform === 'win32') {
        try {
          fs.unlinkSync(finalPath)
        } catch {}
        fs.renameSync(tmpPath, finalPath)
      } else {
        throw renameErr
      }
    }
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
    } catch {}
    throw err
  }

  return {
    path: finalPath,
    receipt,
  }
}

/**
 * Validate a receipt file or object.
 *
 * @param {string | Record<string, unknown>} receiptOrPath
 * @returns {{ valid: boolean, receipt?: Record<string, unknown>, errors: string[] }}
 */
export function validateReceipt(receiptOrPath) {
  let receiptObj = receiptOrPath
  if (typeof receiptOrPath === 'string') {
    const resolved = path.resolve(receiptOrPath)
    if (!fs.existsSync(resolved)) {
      return { valid: false, errors: [`File not found: ${resolved}`] }
    }
    try {
      const content = fs.readFileSync(resolved, 'utf8')
      receiptObj = JSON.parse(content)
    } catch (err) {
      return { valid: false, errors: [`JSON parse error: ${err.message}`] }
    }
  }

  const validation = validateEnvelope(receiptObj)
  if (!validation.valid) {
    return { valid: false, errors: validation.errors }
  }

  // Also check writtenAt if present
  if (receiptObj.writtenAt !== undefined) {
    if (typeof receiptObj.writtenAt !== 'string' || Number.isNaN(Date.parse(receiptObj.writtenAt))) {
      return {
        valid: false,
        errors: [`Invalid writtenAt timestamp "${receiptObj.writtenAt}"`],
      }
    }
  }

  return {
    valid: true,
    receipt: receiptObj,
    errors: [],
  }
}

/**
 * List all receipts for a given run ID.
 *
 * @param {{ root?: string, run: string }} options
 * @returns {Array<Record<string, unknown>>}
 */
export function listReceipts({ root = process.cwd(), run }) {
  if (!isValidId(run)) {
    throw new Error(`Invalid run ID "${run}": cannot contain path separators or ".."`)
  }

  const runDir = path.resolve(root, 'docs', 'harness', 'lanes', run)
  if (!fs.existsSync(runDir)) {
    return []
  }

  const files = fs
    .readdirSync(runDir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
    .sort()

  const receipts = []
  for (const file of files) {
    const filePath = path.join(runDir, file)
    try {
      const content = fs.readFileSync(filePath, 'utf8')
      const parsed = JSON.parse(content)
      receipts.push(parsed)
    } catch {
      // Ignore unparseable or transient files
    }
  }

  return receipts
}

/**
 * CLI runner.
 *
 * @param {string[]} argv
 * @returns {number} exit code
 */
export function runCli(argv) {
  let root = process.cwd()
  let action = null
  let run = null
  let lane = null
  let jsonEnvelope = null
  let validatePath = null

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--root' && i + 1 < argv.length) {
      root = argv[++i]
    } else if (arg === '--write') {
      action = 'write'
    } else if (arg === '--validate' && i + 1 < argv.length) {
      action = 'validate'
      validatePath = argv[++i]
    } else if (arg === '--list') {
      action = 'list'
    } else if (arg === '--run' && i + 1 < argv.length) {
      run = argv[++i]
    } else if (arg === '--lane' && i + 1 < argv.length) {
      lane = argv[++i]
    } else if (arg === '--json' && i + 1 < argv.length) {
      jsonEnvelope = argv[++i]
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  harness-lane-receipt.mjs --write --run <id> --lane <id> --json '<envelope>' [--root <dir>]
  harness-lane-receipt.mjs --validate <path>
  harness-lane-receipt.mjs --list --run <id> [--root <dir>]`)
      return 0
    }
  }

  if (action === 'write') {
    if (!run || !lane || !jsonEnvelope) {
      console.error('Error: --write requires --run <id>, --lane <id>, and --json <envelope>')
      return 1
    }
    try {
      const res = writeReceipt({ root, run, lane, envelope: jsonEnvelope })
      console.log(JSON.stringify(res.receipt))
      return 0
    } catch (err) {
      console.error(`Error writing lane receipt: ${err.message}`)
      return 1
    }
  }

  if (action === 'validate') {
    if (!validatePath) {
      console.error('Error: --validate requires a file path')
      return 1
    }
    const res = validateReceipt(validatePath)
    if (!res.valid) {
      console.error(`Invalid lane receipt: ${res.errors.join('; ')}`)
      return 1
    }
    console.log(JSON.stringify({ ok: true, receipt: res.receipt }))
    return 0
  }

  if (action === 'list') {
    if (!run) {
      console.error('Error: --list requires --run <id>')
      return 1
    }
    try {
      const receipts = listReceipts({ root, run })
      console.log(JSON.stringify(receipts, null, 2))
      return 0
    } catch (err) {
      console.error(`Error listing lane receipts: ${err.message}`)
      return 1
    }
  }

  console.error('Error: specify one of --write, --validate, or --list')
  return 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = runCli(process.argv.slice(2))
  process.exit(code)
}
