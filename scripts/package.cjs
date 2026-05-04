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
  if (!localAppData) {
    console.warn('[package] LOCALAPPDATA not set — skipping winCodeSign pre-seed')
    return
  }

  // electron-builder caches binaries at:
  //   %LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-<version>
  // If that directory exists, electron-builder skips its own download.
  const cacheDir = path.join(
    localAppData,
    'electron-builder', 'Cache', 'winCodeSign',
    `winCodeSign-${WIN_CODE_SIGN_VERSION}`
  )

  if (fs.existsSync(path.join(cacheDir, 'win'))) {
    console.log('[package] winCodeSign cache already present — skipping pre-seed')
    return
  }

  // -------------------------------------------------------------------------
  // Locate 7za.exe bundled with the 7zip-bin package.
  //
  // In pnpm, transitive dependencies are NOT hoisted so require('7zip-bin')
  // from our script fails.  We search the .pnpm virtual store manually.
  // -------------------------------------------------------------------------
  const sevenZaBin = find7za()
  if (!sevenZaBin) {
    console.warn('[package] 7za.exe not found — skipping winCodeSign pre-seed')
    return
  }
  console.log(`[package] Found 7za: ${sevenZaBin}`)

  const tmpArchive = path.join(os.tmpdir(), `winCodeSign-${WIN_CODE_SIGN_VERSION}-preseed.7z`)

  console.log('[package] Pre-seeding winCodeSign cache (skipping macOS symlinks)...')
  console.log(`[package] Cache target: ${cacheDir}`)

  // Download using Node.js built-in https module to avoid curl SSL issues on Windows
  // (curl.exe can fail with CRYPT_E_NO_REVOCATION_CHECK on certain corporate/home networks)
  try {
    downloadFileSync(WIN_CODE_SIGN_URL, tmpArchive)
  } catch (err) {
    console.warn(`[package] winCodeSign download failed: ${err.message} — electron-builder will retry`)
    return
  }

  if (!fs.existsSync(tmpArchive)) {
    console.warn('[package] winCodeSign archive not found after download — electron-builder will retry')
    return
  }
  console.log(`[package] Downloaded to: ${tmpArchive}`)

  // Create the target directory before extraction.
  // IMPORTANT: 7za extracts archive *contents* (win/, darwin/, …) directly
  // into the output directory.  The target must be cacheDir itself so the
  // result is cacheDir/win/x64/rcedit.exe  (not cacheDir/../win/x64/…).
  fs.mkdirSync(cacheDir, { recursive: true })

  // -snl  skip symbolic links (avoids "insufficient privilege" on Windows)
  // -bd   suppress progress indicator
  // -y    assume Yes on all queries
  const extract = spawnSync(
    sevenZaBin,
    ['x', '-bd', '-snl', '-y', tmpArchive, `-o${cacheDir}`],
    { stdio: 'inherit', shell: false }
  )
  console.log(`[package] 7za extraction exit code: ${extract.status}`)

  try { fs.unlinkSync(tmpArchive) } catch { /* best-effort cleanup */ }

  if (fs.existsSync(path.join(cacheDir, 'win'))) {
    console.log('[package] winCodeSign cache ready ✓')
  } else {
    console.warn('[package] winCodeSign pre-seed incomplete — electron-builder will attempt its own extraction')
  }
}

/**
 * Locate the 7za.exe binary from the 7zip-bin package.
 *
 * pnpm does not hoist transitive dependencies, so require('7zip-bin') from
 * our top-level script fails.  Instead we search the pnpm virtual store
 * (.pnpm/<name>@<version>/node_modules/<name>) and fall back to common npm/
 * yarn paths.
 *
 * @returns {string|null} Absolute path to 7za.exe, or null if not found.
 */
function find7za () {
  // Method 1: direct require (works under npm / yarn / hoisted pnpm)
  try {
    const { path7za } = require('7zip-bin')
    if (path7za && fs.existsSync(path7za)) return path7za
  } catch { /* not hoisted */ }

  // Method 2: resolve relative to electron-builder (which depends on 7zip-bin)
  try {
    const ebMainPath = require.resolve('electron-builder')
    const p7 = require.resolve('7zip-bin', { paths: [path.dirname(ebMainPath)] })
    const { path7za } = require(p7)
    if (path7za && fs.existsSync(path7za)) return path7za
  } catch { /* not resolvable */ }

  // Method 3: scan the pnpm virtual store (most reliable for strict pnpm)
  const pnpmStore = path.resolve(root, 'node_modules', '.pnpm')
  if (fs.existsSync(pnpmStore)) {
    for (const entry of fs.readdirSync(pnpmStore)) {
      if (!entry.startsWith('7zip-bin@')) continue
      const candidate = path.join(
        pnpmStore, entry, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe'
      )
      if (fs.existsSync(candidate)) return candidate
    }
  }

  // Method 4: well-known path under node_modules (classic npm/yarn)
  const classic = path.resolve(root, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe')
  if (fs.existsSync(classic)) return classic

  return null
}

/**
 * Synchronously download a URL to a local file, following redirects.
 * Uses Node.js built-in https module to avoid curl SSL issues on Windows
 * (e.g. CRYPT_E_NO_REVOCATION_CHECK on corporate/home networks).
 *
 * @param {string} url  HTTPS URL to download
 * @param {string} dest Local file path to write to
 */
function downloadFileSync (url, dest) {
  // We need synchronous behaviour; use a shared-memory approach via spawnSync
  // calling a small inline Node script in a subprocess so we stay synchronous
  // without requiring external packages.
  const script = `
    const https = require('https');
    const http  = require('http');
    const fs    = require('fs');
    const url   = require('url');

    function download(src, dst, redirects) {
      if (redirects > 10) { process.stderr.write('Too many redirects\\n'); process.exit(1); }
      const mod = src.startsWith('https') ? https : http;
      const req = mod.get(src, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return download(res.headers.location, dst, redirects + 1);
        }
        if (res.statusCode !== 200) {
          process.stderr.write('HTTP ' + res.statusCode + '\\n');
          process.exit(1);
        }
        const out = fs.createWriteStream(dst);
        res.pipe(out);
        out.on('finish', () => { out.close(); process.exit(0); });
        out.on('error', (e) => { process.stderr.write(e.message + '\\n'); process.exit(1); });
      });
      req.on('error', (e) => { process.stderr.write(e.message + '\\n'); process.exit(1); });
    }

    download(process.argv[2], process.argv[3], 0);
  `
  const result = spawnSync(process.execPath, ['-e', script, url, dest], {
    stdio: ['ignore', 'inherit', 'pipe'],
    timeout: 120_000,
  })
  if (result.status !== 0) {
    const errMsg = result.stderr ? result.stderr.toString().trim() : `exit ${result.status}`
    throw new Error(errMsg || `download exited with code ${result.status}`)
  }
}
