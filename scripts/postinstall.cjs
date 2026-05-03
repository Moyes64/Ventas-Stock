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
 * 2. Locate the `prebuild-install` binary or script. With pnpm the binary is
 *    NOT hoisted to the root `node_modules/.bin/`; instead it lives in the
 *    virtual-store scope directory alongside `better-sqlite3`.  We resolve
 *    the `better-sqlite3` symlink to find that scoped `.bin/` directory, or
 *    fall back to running `prebuild-install/bin.js` directly with the current
 *    Node.js executable (most portable — no shell, no .cmd wrapper needed).
 * 3. better-sqlite3 >=12.9.0 ships prebuilt binaries for every supported
 *    Electron ABI (including v140 for Electron 39) on all platforms, so no
 *    C++ toolchain is required.
 *
 * Set PNPM_SKIP_POSTINSTALL=1 to skip this step entirely.
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
// Locate the prebuild-install binary (installed as a dep of better-sqlite3).
//
// With pnpm, transitive-dep binaries are NOT hoisted to the root
// node_modules/.bin/.  Instead they live in the pnpm virtual-store scope
// directory that sits next to the better-sqlite3 package itself, e.g.:
//   node_modules/.pnpm/better-sqlite3@X.Y.Z_.../node_modules/.bin/prebuild-install[.cmd]
//
// We resolve the better-sqlite3 symlink to find that scope, then look there
// before falling back to a plain node execution of the bin.js script.
// ---------------------------------------------------------------------------
function findPrebuildInstall (bs3Dir) {
  const candidates = [
    // Standard: npm/yarn/pnpm hoisted layout
    path.resolve(__dirname, '..', 'node_modules', '.bin', 'prebuild-install'),
    path.resolve(__dirname, '..', 'node_modules', '.bin', 'prebuild-install.cmd'),
  ]

  // pnpm virtual-store: follow the better-sqlite3 symlink to find the scoped .bin/
  if (bs3Dir) {
    try {
      const realBs3 = fs.realpathSync(bs3Dir)
      const scopeDir = path.dirname(realBs3) // …/.pnpm/better-sqlite3@X/node_modules/
      candidates.push(path.join(scopeDir, '.bin', 'prebuild-install'))
      candidates.push(path.join(scopeDir, '.bin', 'prebuild-install.cmd'))
    } catch (_) { /* ignore */ }
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return { cmd: c, useNode: false }
  }
  return null
}

// ---------------------------------------------------------------------------
// Locate prebuild-install/bin.js for direct node execution (last resort).
// This is the most portable approach: no shell quoting, no .cmd wrapper.
// ---------------------------------------------------------------------------
function findPrebuildInstallScript (bs3Dir) {
  if (bs3Dir) {
    try {
      const realBs3 = fs.realpathSync(bs3Dir)
      const scopeDir = path.dirname(realBs3)
      const binJs = path.join(scopeDir, 'prebuild-install', 'bin.js')
      if (fs.existsSync(binJs)) return binJs
    } catch (_) { /* ignore */ }
  }
  return null
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const electronVersion = getElectronVersion()
if (!electronVersion) {
  console.warn('[postinstall] Could not determine Electron version; skipping native rebuild.')
  process.exit(0)
}

console.log(`[postinstall] Electron ${electronVersion} detected -- downloading better-sqlite3 prebuilt binary...`)

const bs3Dir = findBs3Dir()
if (!bs3Dir) {
  console.warn('[postinstall] better-sqlite3 not found in node_modules; nothing to do.')
  process.exit(0)
}

const prebuildArgs = [
  '--runtime=electron',
  `--target=${electronVersion}`,
  '--arch=' + (process.env.npm_config_arch || process.arch),
  '--platform=' + process.platform,
  '--tag-prefix=v',
]

// Resolve how to invoke prebuild-install
let spawnCmd
let spawnArgs
let spawnShell = false

const found = findPrebuildInstall(bs3Dir)
if (found) {
  spawnCmd = found.cmd
  spawnArgs = prebuildArgs
  // .cmd files on Windows need shell: true; POSIX binaries do not
  spawnShell = found.cmd.endsWith('.cmd')
} else {
  const binJs = findPrebuildInstallScript(bs3Dir)
  if (binJs) {
    // Run the script directly with the current Node.js binary — no shell needed
    spawnCmd = process.execPath
    spawnArgs = [binJs, ...prebuildArgs]
    spawnShell = false
  } else {
    console.warn('[postinstall] prebuild-install not found in node_modules; skipping native rebuild.')
    process.exit(0)
  }
}

const result = spawnSync(spawnCmd, spawnArgs, {
  stdio: 'inherit',
  shell: spawnShell,
  cwd: bs3Dir,
})

if (result.status !== 0) {
  console.warn('[postinstall] prebuild-install failed (exit ' + result.status + '); native module may not work until rebuilt.')
}

process.exit(result.status ?? 0)
