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
 * 3. Falls back to `electron-builder install-app-deps` only when
 *    prebuild-install is not available (e.g. CI packaging builds).
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

// ---------------------------------------------------------------------------
// Resolve Electron version from node_modules
// ---------------------------------------------------------------------------
function getElectronVersion () {
  // 1. Try direct require (works for npm/yarn/pnpm hoisted installs)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(path.resolve(__dirname, '..', 'node_modules', 'electron', 'package.json')).version
  } catch (_) { /* ignore */ }

  // 2. Scan the pnpm virtual store: .pnpm/electron@<ver>_<hash>/node_modules/electron/package.json
  const pnpmStore = path.resolve(__dirname, '..', 'node_modules', '.pnpm')
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
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8'))
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
  const candidates = [
    path.resolve(__dirname, '..', 'node_modules', '.bin', 'prebuild-install'),
    path.resolve(__dirname, '..', 'node_modules', '.bin', 'prebuild-install.cmd'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return 'prebuild-install'  // hope it's on PATH
}

// ---------------------------------------------------------------------------
// Locate the better-sqlite3 module directory
// ---------------------------------------------------------------------------
function findBs3Dir () {
  const candidates = [
    path.resolve(__dirname, '..', 'node_modules', 'better-sqlite3'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const electronVersion = getElectronVersion()
if (!electronVersion) {
  console.warn('[postinstall] Could not determine Electron version; falling back to electron-builder install-app-deps.')
  const r = spawnSync('electron-builder', ['install-app-deps'], { stdio: 'inherit', shell: true })
  process.exit(r.status ?? 1)
}

console.log(`[postinstall] Electron ${electronVersion} detected -- downloading better-sqlite3 prebuilt binary...`)

const bs3Dir = findBs3Dir()
if (!bs3Dir) {
  console.warn('[postinstall] better-sqlite3 not found in node_modules; nothing to do.')
  process.exit(0)
}

const prebuildInstall = findPrebuildInstall()
const args = [
  '--runtime=electron',
  `--target=${electronVersion}`,
  '--arch=' + (process.env.npm_config_arch || process.arch),
  '--platform=' + process.platform,
  '--tag-prefix=v',
]

const result = spawnSync(prebuildInstall, args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  cwd: bs3Dir,
})

if (result.status !== 0) {
  console.warn('[postinstall] prebuild-install failed; falling back to electron-builder install-app-deps.')
  const r2 = spawnSync('electron-builder', ['install-app-deps'], { stdio: 'inherit', shell: true })
  process.exit(r2.status ?? 1)
}

process.exit(0)
