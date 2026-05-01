#!/usr/bin/env tsx
/**
 * CLI migration runner.
 * Usage: pnpm db:migrate
 */
import 'dotenv/config'
import { runMigrations } from '../database/migrate'

runMigrations()
  .then(() => {
    console.log('Migrations completed successfully.')
    process.exit(0)
  })
  .catch(err => {
    console.error('Migration failed:', err)
    process.exit(1)
  })
