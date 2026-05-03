#!/usr/bin/env node
'use strict'

/**
 * Postinstall script for Ventas-Stock.
 *
 * Rebuilds native modules (better-sqlite3) against the bundled Electron
 * version so that `pnpm dev` works correctly.
 *
 * Strategy
 * --------
 * 1. Resolve the Electron version from the local installation.
 * 2. Run `prebuild-install` for better-sqlite3 directly, targeting that
 *    Electron version.  better-sqlite3 >=12.9.0 ships prebuilt binaries for
 *    every supported Electron ABI (including v140 for Electron 39) on all
 *    platforms, so NO C++ toolchain is required.
 * 3. Falls back to `@electron/rebuild` when prebuild-install is not available.
 *    This avoids the `electron-builder install-app-deps` path which breaks on
 *    Windows with pnpm because electron-builder tries to invoke pnpm.cjs as a
 *    Win32 executable.
 *
 * Set PNPM_SKIP_POSTINSTALL=1 to skip this step entirely (not normally
 * needed anymore, but preserved for compatibility).
 */

if (process.env.PNPM_SKIP_POSTINSTALL || process.env.SKIP_ELECTRON_BUILDER_INSTALL_APP_DEPS) {
  console.log('[postinstall] Skipped (PNPM_SKIP_POSTINSTALL / SKIP_ELECTRON_BUILDER_INSTALL_APP_DEPS is set).')
  process.exit(0)
}

const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const root = path.resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// Resolve Electron version from node_modules
// ---------------------------------------------------------------------------
function getElectronVersion () {
  // 1. Try direct require (works for npm/yarn/pnpm hoisted installs)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(path.resolve(root, 'node_modules', 'electron', 'package.json')).version
  } catch (_) { /* ignore */ }

  // 2. Scan the pnpm virtual store: .pnpm/electron@<ver>_<hash>/node_modules/electron/package.json
  const pnpmStore = path.resolve(root, 'node_modules', '.pnpm')
  if (fs.existsSync(pnpmStore)) {
    try {
      const entries = fs.readdirSync(pnpmStore)
      for (const entry of entries) {
        if (/^electron@/.test(entry)) {
          const p = path.join(pnpmStore, entry, 'node_modules', 'electron', 'package.json')
          if (fs.existsSync(p)) {
            try {
              return JSON.parse(fs.readFileSync(p, 'utf-8')).version
            } catch (_) { /* ignore */ }
          }
        }
      }
    } catch (_) { /* ignore */ }
  }

  // 3. Fallback: read from our own package.json devDependencies (version spec)
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(root, 'package.json'), 'utf-8'))
    const spec = (pkg.devDependencies || {}).electron || ''
    const match = spec.match(/(\d+\.\d+\.\d+)/)
    if (match) return match[1]
  } catch (_) { /* ignore */ }
  return null
}

// ---------------------------------------------------------------------------
// Locate the prebuild-install binary (installed as a dep of better-sqlite3)
// ---------------------------------------------------------------------------
function findPrebuildInstall () {
  // On Windows cmd.exe cannot execute the bare POSIX shim (no extension), so
  // prefer the .cmd wrapper first on Windows.
  const candidates = process.platform === 'win32'
    ? [
        path.resolve(root, 'node_modules', '.bin', 'prebuild-install.cmd'),
        path.resolve(root, 'node_modules', '.bin', 'prebuild-install'),
      ]
    : [
        path.resolve(root, 'node_modules', '.bin', 'prebuild-install'),
        path.resolve(root, 'node_modules', '.bin', 'prebuild-install.cmd'),
      ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

// ---------------------------------------------------------------------------
// Locate the @electron/rebuild binary
// ---------------------------------------------------------------------------
function findElectronRebuild () {
  // Same Windows preference as findPrebuildInstall: .cmd first.
  const candidates = process.platform === 'win32'
    ? [
        path.resolve(root, 'node_modules', '.bin', 'electron-rebuild.cmd'),
        path.resolve(root, 'node_modules', '.bin', 'electron-rebuild'),
      ]
    : [
        path.resolve(root, 'node_modules', '.bin', 'electron-rebuild'),
        path.resolve(root, 'node_modules', '.bin', 'electron-rebuild.cmd'),
      ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return 'electron-rebuild'
}

// ---------------------------------------------------------------------------
// Locate the better-sqlite3 module directory
// ---------------------------------------------------------------------------
function findBs3Dir () {
  const candidate = path.resolve(root, 'node_modules', 'better-sqlite3')
  return fs.existsSync(candidate) ? candidate : null
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const electronVersion = getElectronVersion()

// --- Strategy 1: prebuild-install (fast, downloads prebuilt binary) ---
const prebuildInstall = findPrebuildInstall()
if (prebuildInstall && electronVersion) {
  const bs3Dir = findBs3Dir()
  if (!bs3Dir) {
    console.warn('[postinstall] better-sqlite3 not found in node_modules; nothing to do.')
    process.exit(0)
  }

  console.log(`[postinstall] Electron ${electronVersion} detected -- downloading better-sqlite3 prebuilt binary...`)

  const result = spawnSync(prebuildInstall, [
    '--runtime=electron',
    `--target=${electronVersion}`,
    '--arch=' + (process.env.npm_config_arch || process.arch),
    '--platform=' + process.platform,
    '--tag-prefix=v',
  ], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: bs3Dir,
  })

  if (result.status === 0) process.exit(0)
  console.warn('[postinstall] prebuild-install failed; falling back to @electron/rebuild...')
}

// --- Strategy 2: @electron/rebuild (works on all platforms including Windows + pnpm) ---
console.log('[postinstall] Rebuilding better-sqlite3 with @electron/rebuild...')
const electronRebuild = findElectronRebuild()
const r2 = spawnSync(electronRebuild, ['-f', '-w', 'better-sqlite3'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  cwd: root,
})
process.exit(r2.status ?? 1)
