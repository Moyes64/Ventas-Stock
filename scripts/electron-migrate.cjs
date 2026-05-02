#!/usr/bin/env node
'use strict'
/**
 * Electron CLI runner — database migrations.
 *
 * Usage:  pnpm db:migrate:electron
 * Equiv:  electron scripts/electron-migrate.cjs
 *
 * Runs migrations inside the Electron runtime so that the
 * Electron-compiled better-sqlite3 binary (ABI v140) is used.
 * This avoids the Node.js ↔ Electron ABI mismatch on Windows when
 * better-sqlite3 was rebuilt for Electron during `pnpm install`.
 */

require('dotenv/config')

const { app } = require('electron')

app.whenReady().then(async () => {
  try {
    // Register a TypeScript loader so we can require .ts source files directly
    // without a separate build step.
    require('tsx/cjs')

    const { runMigrations } = require('../database/migrate.ts')
    await runMigrations()
    console.log('[electron-migrate] Migrations completed successfully.')
  } catch (/** @type {any} */ err) {
    console.error('[electron-migrate] Migration failed:', err)
    process.exit(1)
  }

  app.quit()
})
