import fs from 'fs'
import path from 'path'
import { getDb } from './db'

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations')

/**
 * Reads all *.sql files from the migrations directory, sorts them by name,
 * and applies any that have not yet been recorded in schema_migrations.
 */
export async function runMigrations(): Promise<void> {
  const db = getDb()

  // Ensure the tracking table exists before we start
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      filename   TEXT    NOT NULL UNIQUE,
      applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const appliedRows = db.prepare('SELECT filename FROM schema_migrations').all() as {
    filename: string
  }[]
  const applied = new Set(appliedRows.map(r => r.filename))

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()

  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (filename) VALUES (?)'
  )

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[migrate] Already applied: ${file}`)
      continue
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8')
    console.log(`[migrate] Applying: ${file}`)

    // Run migration in a transaction so partial failures roll back cleanly
    const applyMigration = db.transaction(() => {
      db.exec(sql)
      insertMigration.run(file)
    })

    applyMigration()
    console.log(`[migrate] ✓ Applied: ${file}`)
  }

  console.log('[migrate] All migrations complete.')
}
