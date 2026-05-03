#!/usr/bin/env node
'use strict'

/**
 * Package script for Ventas-Stock.
 *
 * Wraps the standard `electron-vite build && electron-rebuild && electron-builder`
 * pipeline with environment overrides for Windows compatibility:
 *
 *   CSC_IDENTITY_AUTO_DISCOVERY=false
 *     Belt-and-suspenders guard: prevents electron-builder from probing the
 *     Windows certificate store for code-signing certificates.
 *
 *     NOTE: In electron-builder 24.x this flag alone does NOT prevent the
 *     `winCodeSign` binary archive from being downloaded.  The archive contains
 *     macOS .dylib symlinks; extracting those on a non-admin Windows session
 *     (without Developer Mode / SeCreateSymbolicLinkPrivilege) fails with
 *     "Cannot create symbolic link: insufficient privilege".
 *     The actual fix is `build.win.sign` in package.json pointing to
 *     scripts/win-sign.cjs, which short-circuits the entire signing code-path
 *     (including the winCodeSign download) in electron-builder.
 *
 *   USE_HARD_LINKS=false
 *     Avoids rare pnpm hard-link issues on Windows during the packaging step.
 */

const { spawnSync } = require('child_process')
const path = require('path')

const root = path.resolve(__dirname, '..')

const env = {
  ...process.env,
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  USE_HARD_LINKS: 'false',
}

// ---------------------------------------------------------------------------
// Helper: run a command and exit on failure
// ---------------------------------------------------------------------------
function run (cmd, args) {
  console.log(`\n> ${cmd} ${args.join(' ')}\n`)
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: root,
    env,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

// ---------------------------------------------------------------------------
// Locate a local .bin binary, preferring .cmd on Windows
// ---------------------------------------------------------------------------
const fs = require('fs')
function bin (name) {
  const candidates = process.platform === 'win32'
    ? [
        path.resolve(root, 'node_modules', '.bin', `${name}.cmd`),
        path.resolve(root, 'node_modules', '.bin', name),
      ]
    : [
        path.resolve(root, 'node_modules', '.bin', name),
        path.resolve(root, 'node_modules', '.bin', `${name}.cmd`),
      ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return name
}

// ---------------------------------------------------------------------------
// 1. Build renderer + main + preload bundles
// ---------------------------------------------------------------------------
run(bin('electron-vite'), ['build'])

// ---------------------------------------------------------------------------
// 2. Rebuild native modules (better-sqlite3) against the correct Electron ABI
// ---------------------------------------------------------------------------
run(bin('electron-rebuild'), ['-f', '-w', 'better-sqlite3'])

// ---------------------------------------------------------------------------
// 3. Package with electron-builder (code signing is intentionally disabled)
// ---------------------------------------------------------------------------
run(bin('electron-builder'), [])
