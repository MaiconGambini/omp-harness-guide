#!/usr/bin/env node
/**
 * harness-maestri-check.mjs
 *
 * Clean terminal check for Maestri canvas agents (AC-9).
 * Runs `maestri check <agent>` and strips visual terminal noise:
 * ANSI codes, box-drawing borders, hints, empty lines, and status footer.
 *
 * Usage:
 *   node harness-maestri-check.mjs <agent> [--lines N]
 */

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Comprehensive ANSI escape sequence regex (CSI, OSC, ST, single-char escapes)
const ANSI_REGEX =
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]|\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\].*?(?:\x07|\x1B\\))/g

// Box-drawing border characters specified in contract: │ ╭ ╮ ╰ ╯ ─ ├ ┤
const BOX_BORDER_REGEX = /[│╭╮╰╯─├┤]/g

// Hint patterns: ⟦...⟧
const HINT_REGEX = /⟦[^⟧]*⟧/g

/**
 * Check if a line is a Maestri status footer.
 * Contract: starting with ' π  ·'.
 *
 * @param {string} line
 * @returns {boolean}
 */
export function isStatusFooter(line) {
  const trimmed = line.trim()
  return (
    line.startsWith(' π  ·') ||
    trimmed.startsWith('π  ·') ||
    trimmed.startsWith('π ·') ||
    trimmed.startsWith('π ') ||
    line.startsWith('π  ·')
  )
}

/**
 * Clean raw Maestri terminal text into an array of meaningful lines.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function cleanLines(text) {
  if (typeof text !== 'string') return []

  const rawLines = text.split(/\r?\n/)
  const cleaned = []

  for (const rawLine of rawLines) {
    // 1. Check for status footer before or after stripping
    if (isStatusFooter(rawLine)) {
      continue
    }

    // 2. Strip ANSI escapes, hints, and box-drawing borders
    const withoutAnsi = rawLine.replace(ANSI_REGEX, '')
    if (isStatusFooter(withoutAnsi)) {
      continue
    }

    const withoutHints = withoutAnsi.replace(HINT_REGEX, '')
    const withoutBorders = withoutHints.replace(BOX_BORDER_REGEX, '')

    // 3. Trim line whitespace
    const line = withoutBorders.trim()

    // 4. Drop empty lines
    if (line.length === 0) {
      continue
    }

    // 5. Drop status footer if exposed after border removal
    if (isStatusFooter(line)) {
      continue
    }

    cleaned.push(line)
  }

  return cleaned
}

/**
 * Clean raw Maestri terminal text.
 * Strips ANSI escapes, box-drawing borders (│╭╮╰╯─├┤), '⟦...⟧' hints,
 * empty lines, and the status footer line (starting with ' π  ·').
 *
 * @param {string} text
 * @param {{ asArray?: boolean }} [options]
 * @returns {string | string[]}
 */
export function clean(text, { asArray = false } = {}) {
  const lines = cleanLines(text)
  if (asArray) {
    return lines
  }
  return lines.join('\n')
}

/**
 * Execute maestri check for an agent and return cleaned lines.
 *
 * @param {string} agent
 * @param {{ lines?: number, bin?: string }} [options]
 * @returns {string[]}
 */
export function runMaestriCheck(agent, { lines = 40, bin } = {}) {
  const executable = bin || process.env.HARNESS_MAESTRI_BIN || 'maestri'
  const subcommand = 'check'
  const res = spawnSync(executable, [subcommand, agent], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  if (res.error) {
    throw new Error(`Failed to execute "${executable} check ${agent}": ${res.error.message}`)
  }

  if (res.status !== 0) {
    const errText = (res.stderr || res.stdout || '').trim()
    throw new Error(
      `Command "${executable} check ${agent}" exited with code ${res.status}: ${errText}`
    )
  }

  const allCleanLines = cleanLines(res.stdout || '')
  if (lines > 0 && allCleanLines.length > lines) {
    return allCleanLines.slice(-lines)
  }
  return allCleanLines
}

/**
 * CLI entry point.
 *
 * @param {string[]} argv
 * @returns {number}
 */
export function runCli(argv) {
  let agent = null
  let lines = 40

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--lines' && i + 1 < argv.length) {
      lines = Number.parseInt(argv[++i], 10)
      if (Number.isNaN(lines) || lines < 0) {
        console.error('Error: --lines must be a non-negative integer')
        return 1
      }
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: harness-maestri-check.mjs <agent> [--lines N=40]`)
      return 0
    } else if (!arg.startsWith('-') && agent === null) {
      agent = arg
    } else if (arg.startsWith('--lines=')) {
      lines = Number.parseInt(arg.slice(8), 10)
      if (Number.isNaN(lines) || lines < 0) {
        console.error('Error: --lines must be a non-negative integer')
        return 1
      }
    }
  }

  if (!agent) {
    console.error('Error: missing agent name\nUsage: harness-maestri-check.mjs <agent> [--lines N=40]')
    return 1
  }

  try {
    const outputLines = runMaestriCheck(agent, { lines })
    if (outputLines.length > 0) {
      console.log(outputLines.join('\n'))
    }
    return 0
  } catch (err) {
    console.error(`Error: ${err.message}`)
    return 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = runCli(process.argv.slice(2))
  process.exit(code)
}
