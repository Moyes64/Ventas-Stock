#!/usr/bin/env node
'use strict'

/**
 * Package script for Ventas-Stock.
 *
 * Wraps the standard `electron-vite build && electron-rebuild && electron-builder`
 * pipeline with environment overrides for Windows compatibility:
 *
 *   CSC_IDENTITY_AUTO_DISCOVERY=false
 *     Prevents electron-builder from probing the Windows certificate store for
 *     code-signing certificates.
 *
 *   USE_HARD_LINKS=false
 *     Avoids rare pnpm hard-link issues on Windows during the packaging step.
 *
 * winCodeSign cache pre-seeding (Windows only)
 * --------------------------------------------
 * electron-builder 24.x always downloads the `winCodeSign` binary archive when
 * building for Windows, even when code signing is disabled.  It needs the archive
 * to run rcedit.exe (embeds version info / icon into the .exe).
 *
 * The archive contains macOS .dylib SYMLINKS (darwin/10.12/lib/libcrypto.dylib,
 * libssl.dylib).  On a Windows session without Developer Mode or admin rights
 * (SeCreateSymbolicLinkPrivilege), 7-Zip exits with code 2 ("Cannot create
 * symbolic link: insufficient privilege") and the packaging aborts.
 *
 * The fix: before calling electron-builder, this script downloads the archive
 * itself and extracts it with the 7-Zip `-snl` flag (skip symbolic links).
 * electron-builder then finds the cache directory already populated and skips
 * its own download/extraction entirely — no symlinks, no privilege error.
 */

const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
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
// 3. Pre-seed winCodeSign cache on Windows (avoids symlink privilege errors)
// ---------------------------------------------------------------------------
if (process.platform === 'win32') {
  seedWinCodeSignCache()
}

// ---------------------------------------------------------------------------
// 4. Package with electron-builder (code signing is intentionally disabled)
//    Extra arguments (e.g. --win, --linux, --mac) are forwarded as-is.
//    When running on Windows without an explicit platform flag, --win is
//    added automatically so that the target platform is always explicit.
// ---------------------------------------------------------------------------
const platformFlags = ['--win', '--mac', '--linux', '-w', '-m', '-l']
const extraArgs = process.argv.slice(2)
if (process.platform === 'win32' && !extraArgs.some(a => platformFlags.includes(a))) {
  extraArgs.push('--win')
}
run(bin('electron-builder'), extraArgs)

// ---------------------------------------------------------------------------
// winCodeSign cache pre-seeder
// ---------------------------------------------------------------------------

/**
 * Downloads the winCodeSign-2.6.0 archive and extracts it with 7-Zip's -snl
 * flag (skip symbolic links) into the electron-builder cache directory.
 *
 * electron-builder checks whether the cache directory already exists before
 * downloading; by pre-populating it we bypass its own extraction entirely.
 * The macOS symlinks in the archive are irrelevant on Windows — skipping them
 * has no effect on the Windows build tools (rcedit.exe, signtool.exe).
 */
function seedWinCodeSignCache () {
  const WIN_CODE_SIGN_VERSION = '2.6.0'
  const WIN_CODE_SIGN_URL =
    `https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-${WIN_CODE_SIGN_VERSION}/winCodeSign-${WIN_CODE_SIGN_VERSION}.7z`

  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) return

  const cacheDir = path.join(
    localAppData,
    'electron-builder', 'Cache', 'winCodeSign',
    `winCodeSign-${WIN_CODE_SIGN_VERSION}`
  )

  if (fs.existsSync(cacheDir)) {
    return // cache already valid — nothing to do
  }

  // Locate the 7za binary bundled by electron-builder's 7zip-bin dependency
  let sevenZaBin
  try {
    ;({ path7za: sevenZaBin } = require('7zip-bin'))
  } catch {
    console.warn('[package] 7zip-bin not found — skipping winCodeSign pre-seed')
    return
  }

  const tmpArchive = path.join(os.tmpdir(), `winCodeSign-${WIN_CODE_SIGN_VERSION}.7z`)

  console.log('[package] Pre-seeding winCodeSign cache (skipping macOS symlinks)...')

  // curl.exe ships with Windows 10 1803+; use it for a synchronous download
  const dl = spawnSync(
    'curl.exe',
    ['-L', '--silent', '--show-error', '-o', tmpArchive, WIN_CODE_SIGN_URL],
    { stdio: 'inherit', shell: false }
  )

  if (dl.status !== 0 || !fs.existsSync(tmpArchive)) {
    console.warn('[package] winCodeSign download failed — electron-builder will retry on its own')
    return
  }

  fs.mkdirSync(path.dirname(cacheDir), { recursive: true })

  // -snl  skip symbolic links (avoids "insufficient privilege" on Windows)
  // -bd   suppress progress indicator
  // -y    assume Yes on all queries
  spawnSync(
    sevenZaBin,
    ['x', '-bd', '-snl', '-y', tmpArchive, `-o${path.dirname(cacheDir)}`],
    { stdio: 'inherit', shell: false }
  )

  try { fs.unlinkSync(tmpArchive) } catch { /* best-effort cleanup */ }

  if (fs.existsSync(cacheDir)) {
    console.log('[package] winCodeSign cache ready')
  } else {
    console.warn('[package] winCodeSign pre-seed incomplete — electron-builder will retry on its own')
  }
}
