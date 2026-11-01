import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

let _db: Database.Database | null = null

/**
 * Driver de la base:
 * - `better-sqlite3` (default): archivo SQLite local en DB_PATH.
 * - `libsql`: se activa con DB_DRIVER=libsql o con TURSO_DATABASE_URL. Con
 *   TURSO_DATABASE_URL abre una réplica embebida — DB_PATH es la copia local
 *   (lecturas) y las escrituras van a la base de Turso.
 */
export function usingLibsql(): boolean {
  return process.env.DB_DRIVER === 'libsql' || !!process.env.TURSO_DATABASE_URL
}

/**
 * Returns the singleton Database instance.
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

  if (usingLibsql()) {
    _db = openLibsql(resolvedPath)
    return _db
  }

  _db = new Database(resolvedPath)

  // Performance & safety settings
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  _db.pragma('synchronous = NORMAL')
  _db.pragma('cache_size = -16000') // 16 MB cache

  return _db
}

/**
 * Abre la base con libsql y tapa las diferencias con better-sqlite3 que usa el
 * código, así los módulos siguen tipados y escritos contra better-sqlite3:
 * - `get()` agrega un campo `_metadata` a la fila → se quita.
 * - `transaction()` no admite anidamiento → los niveles internos usan SAVEPOINT,
 *   igual que better-sqlite3.
 * - `backup()` no está implementado → se resuelve con VACUUM INTO.
 */
function openLibsql(resolvedPath: string): Database.Database {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Libsql = require('libsql')
  const syncUrl = process.env.TURSO_DATABASE_URL
  const db = syncUrl
    ? new Libsql(resolvedPath, {
        syncUrl,
        authToken: process.env.TURSO_AUTH_TOKEN ?? '',
        syncPeriod: Number(process.env.TURSO_SYNC_PERIOD ?? 2),
      })
    : new Libsql(resolvedPath)

  if (syncUrl) {
    db.sync()
  } else {
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('cache_size = -16000')
  }
  db.pragma('foreign_keys = ON')

  const probe = db.prepare('SELECT 1')
  const statementProto = Object.getPrototypeOf(probe)
  if (!statementProto.__compatPatched) {
    // Un único parámetro null lo toma como objeto de parámetros nombrados y
    // falla ("failed to downcast any to object"); envuelto en array va posicional.
    const fixArgs = (args: unknown[]) => (args.length === 1 && args[0] === null ? [[null]] : args)
    for (const method of ['run', 'all', 'iterate']) {
      const original = statementProto[method]
      statementProto[method] = function (...args: unknown[]) {
        return original.apply(this, fixArgs(args))
      }
    }
    const originalGet = statementProto.get
    statementProto.get = function (...args: unknown[]) {
      const row = originalGet.apply(this, fixArgs(args))
      if (row && typeof row === 'object') delete (row as Record<string, unknown>)._metadata
      return row
    }
    statementProto.__compatPatched = true
  }

  let savepointSeq = 0
  db.transaction = (fn: (...args: unknown[]) => unknown) => {
    if (typeof fn !== 'function') throw new TypeError('Expected first argument to be a function')
    const wrap = (mode: string) => (...args: unknown[]) => {
      if (db.inTransaction) {
        const name = `sp_${++savepointSeq}`
        db.exec(`SAVEPOINT ${name}`)
        try {
          const result = fn(...args)
          db.exec(`RELEASE ${name}`)
          return result
        } catch (err) {
          db.exec(`ROLLBACK TO ${name}`)
          db.exec(`RELEASE ${name}`)
          throw err
        }
      }
      db.exec(`BEGIN ${mode}`)
      try {
        const result = fn(...args)
        db.exec('COMMIT')
        return result
      } catch (err) {
        if (db.inTransaction) db.exec('ROLLBACK')
        throw err
      }
    }
    const txn = wrap('') as ((...args: unknown[]) => unknown) & Record<string, unknown>
    txn.deferred = wrap('DEFERRED')
    txn.immediate = wrap('IMMEDIATE')
    txn.exclusive = wrap('EXCLUSIVE')
    txn.database = db
    return txn
  }

  db.backup = async (destPath: string) => {
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
    db.exec(`VACUUM INTO '${destPath.replace(/'/g, "''")}'`)
  }

  return db as Database.Database
}

/** Closes the database connection (call on app quit). */
export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}
