import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

let _db: Database.Database | null = null

/**
 * Returns the singleton better-sqlite3 Database instance.
 * The DB file path is resolved from the DB_PATH env var.
 * Creates the directory if it does not exist.
 */
export function getDb(): Database.Database {
  if (_db) return _db

  const dbPath = process.env.DB_PATH ?? './data/ventas.db'
  const resolvedPath = path.resolve(dbPath)
  const dir = path.dirname(resolvedPath)

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  _db = new Database(resolvedPath)

  // Performance & safety settings
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  _db.pragma('synchronous = NORMAL')
  _db.pragma('cache_size = -16000') // 16 MB cache

  return _db
}

/** Closes the database connection (call on app quit). */
export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}
