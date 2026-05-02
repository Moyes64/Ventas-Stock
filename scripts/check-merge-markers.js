#!/usr/bin/env node
'use strict'

/**
 * Checks critical project files for unresolved merge conflict markers.
 *
 * Usage: pnpm check:conflicts
 *
 * Scans package.json, pnpm-lock.yaml, and src/lib/ipc.ts for any of the
 * three git conflict markers (<<<<<<<, =======, >>>>>>>) and exits with
 * a non-zero status code if any are found, so CI pipelines and pre-merge
 * hooks can catch unresolved conflicts early.
 */

const fs = require('fs')
const path = require('path')
const readline = require('readline')

const ROOT = path.resolve(__dirname, '..')

const FILES_TO_CHECK = [
  'package.json',
  'pnpm-lock.yaml',
  'src/lib/ipc.ts',
]

// Regex patterns for each marker type:
//   <<<<<<< must be followed by a space or EOL (branch name or HEAD)
//   ======= must be the only content on the line (separator)
//   >>>>>>> must be followed by a space or EOL (branch name)
// trimStart() handles markers that happen to be indented.
const CONFLICT_PATTERNS = [
  { re: /^<{7}(\s|$)/, label: '<<<<<<<' },
  { re: /^={7}$/, label: '=======' },
  { re: /^>{7}(\s|$)/, label: '>>>>>>>' },
]

/**
 * Scans a single file for conflict markers using a readline stream.
 * Resolves to true if any markers were found, false otherwise.
 *
 * @param {string} absPath
 * @param {string} relPath
 * @returns {Promise<boolean>}
 */
function checkFile (absPath, relPath) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(absPath, { encoding: 'utf-8' })
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

    let lineNumber = 0
    let found = false

    rl.on('line', line => {
      lineNumber++
      const trimmed = line.trimStart()
      for (const { re, label } of CONFLICT_PATTERNS) {
        if (re.test(trimmed)) {
          console.error(`[check:conflicts] Conflict marker "${label}" found in ${relPath}:${lineNumber}`)
          found = true
        }
      }
    })

    rl.on('close', () => resolve(found))
    rl.on('error', reject)
    stream.on('error', reject)
  })
}

async function main () {
  let hasConflicts = false

  for (const relPath of FILES_TO_CHECK) {
    const absPath = path.join(ROOT, relPath)

    if (!fs.existsSync(absPath)) {
      console.warn(`[check:conflicts] File not found, skipping: ${relPath}`)
      continue
    }

    const found = await checkFile(absPath, relPath)
    if (found) hasConflicts = true
  }

  if (hasConflicts) {
    console.error('[check:conflicts] ❌ Unresolved merge conflicts detected. Resolve them before merging.')
    process.exit(1)
  }

  console.log('[check:conflicts] ✅ No merge conflict markers found.')
  process.exit(0)
}

main().catch(err => {
  console.error('[check:conflicts] Unexpected error:', err)
  process.exit(1)
})
