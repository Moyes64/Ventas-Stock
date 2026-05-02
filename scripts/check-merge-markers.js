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

let hasConflicts = false

for (const relPath of FILES_TO_CHECK) {
  const absPath = path.join(ROOT, relPath)

  if (!fs.existsSync(absPath)) {
    console.warn(`[check:conflicts] File not found, skipping: ${relPath}`)
    continue
  }

  const lines = fs.readFileSync(absPath, 'utf-8').split('\n')

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart()
    for (const { re, label } of CONFLICT_PATTERNS) {
      if (re.test(trimmed)) {
        console.error(`[check:conflicts] Conflict marker "${label}" found in ${relPath}:${i + 1}: ${lines[i].trim()}`)
        hasConflicts = true
      }
    }
  }
}

if (hasConflicts) {
  console.error('[check:conflicts] ❌ Unresolved merge conflicts detected. Resolve them before merging.')
  process.exit(1)
}

console.log('[check:conflicts] ✅ No merge conflict markers found.')
process.exit(0)
