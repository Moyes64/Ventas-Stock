#!/usr/bin/env tsx
/**
 * CLI seed runner.
 * Usage: pnpm db:seed
 *
 * NOTE: Run migrations first (pnpm db:migrate)
 */
import 'dotenv/config'
import { runMigrations } from '../database/migrate'
import { runSeed } from '../database/seed'

async function main() {
  // Ensure schema is up-to-date before seeding
  await runMigrations()
  runSeed()
  console.log('Seed completed successfully.')
  process.exit(0)
}

main().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
