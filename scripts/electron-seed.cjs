#!/usr/bin/env node
'use strict'
/**
 * Electron CLI runner — database seed.
 *
 * Usage:  pnpm db:seed:electron
 * Equiv:  electron scripts/electron-seed.cjs
 *
 * Runs migrations + seed inside the Electron runtime so that the
 * Electron-compiled better-sqlite3 binary (ABI v140) is used.
 * This avoids the Node.js ↔ Electron ABI mismatch on Windows when
 * better-sqlite3 was rebuilt for Electron during `pnpm install`.
 *
 * NOTE: migrations are always run first to ensure the schema is up to date.
 */

require('dotenv/config')

const { app } = require('electron')

app.whenReady().then(async () => {
  try {
    // Register a TypeScript loader so we can require .ts source files directly
    // without a separate build step.
    require('tsx/cjs')

    const { runMigrations } = require('../database/migrate.ts')
    const { runSeed } = require('../database/seed.ts')

    await runMigrations()
    runSeed()
    console.log('[electron-seed] Seed completed successfully.')
  } catch (/** @type {any} */ err) {
    console.error('[electron-seed] Seed failed:', err)
    process.exit(1)
  }

  app.quit()
})
