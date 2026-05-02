import fs from 'fs'
import path from 'path'
import { getDb } from './db'

/**
 * Resolves the migrations directory for the current runtime context:
 *
 * 1. **Packaged Electron (production)**: `<resourcesPath>/database/migrations`
 *    Migrations are shipped via electron-builder `extraResources`.
 *
 * 2. **Development Electron** (electron-vite compiles to `dist/main/index.js`):
 *    `<project-root>/database/migrations`
 *    Detected because `dist/main/migrations` does not exist on disk.
 *
 * 3. **Node.js CLI** (`tsx scripts/migrate.ts`):
 *    `<project-root>/database/migrations`
 *    `__dirname` equals the source `database/` directory, so
 *    `__dirname/migrations` resolves correctly.
 */
function getMigrationsDir(): string {
  if (process.versions.electron) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron') as typeof import('electron')
    if (app.isPackaged) {
      // Production: migrations shipped as extraResources
      return path.join(
        (process as NodeJS.Process & { resourcesPath: string }).resourcesPath,
        'database',
        'migrations',
      )
    }
    // Development Electron or tsx-loaded in Electron: fall through to
    // the filesystem-based heuristic below.
  }

  // Development (CLI or Electron):
  // - When __dirname = <root>/database/ (tsx CLI or tsx runner in Electron):
  //   the `migrations` subdirectory exists → use it directly.
  // - When __dirname = <root>/dist/main/ (electron-vite compiled output):
  //   `dist/main/migrations` does not exist → navigate up 2 levels to project root.
  const localMigrations = path.resolve(__dirname, 'migrations')
  if (fs.existsSync(localMigrations)) {
    return localMigrations
  }

  // Compiled electron-vite output: dist/main/ → ../../database/migrations
  return path.resolve(__dirname, '../../database/migrations')
}

const MIGRATIONS_DIR = getMigrationsDir()

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
