#!/usr/bin/env node
'use strict'

/**
 * Postinstall script for Ventas-Stock.
 *
 * Runs `electron-builder install-app-deps` to rebuild native modules
 * (e.g. better-sqlite3) against the bundled Electron version.
 *
 * On Windows development setups this step may fail because prebuilt
 * binaries are unavailable and building from source requires extra
 * tooling (Build Tools + Python).  Set the environment variable
 * PNPM_SKIP_POSTINSTALL=1 before running `pnpm install` to skip this
 * step safely during development:
 *
 *   PNPM_SKIP_POSTINSTALL=1 pnpm install     # Linux / macOS
 *   $env:PNPM_SKIP_POSTINSTALL=1; pnpm install  # PowerShell
 *   set PNPM_SKIP_POSTINSTALL=1 && pnpm install  # cmd.exe
 */

if (process.env.PNPM_SKIP_POSTINSTALL || process.env.SKIP_ELECTRON_BUILDER_INSTALL_APP_DEPS) {
  console.log('[postinstall] Skipped (PNPM_SKIP_POSTINSTALL / SKIP_ELECTRON_BUILDER_INSTALL_APP_DEPS is set).')
  process.exit(0)
}

const { spawnSync } = require('child_process')

const result = spawnSync('electron-builder', ['install-app-deps'], {
  stdio: 'inherit',
  shell: true,
})

process.exit(result.status ?? 1)
