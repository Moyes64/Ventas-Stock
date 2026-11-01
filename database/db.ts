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

interface CompatContext {
  db: { inTransaction: boolean; sync(): unknown }
  replica: boolean
  originalPrepare: (sql: string) => unknown
  txStatements: Map<string, CompatStatement> | null
}

interface CompatStatement {
  __sql?: string
  __ctx?: CompatContext
  __paramNames?: string[]
  pluckMode?: boolean
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
        // Sin readYourWrites cada escritura no espera traerse el cambio: se
        // sincroniza una sola vez al terminar la escritura suelta o el COMMIT.
        readYourWrites: process.env.TURSO_READ_YOUR_WRITES === '1',
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

  // Contra Turso los parámetros con nombre (@x, :x, $x) llegan vacíos al
  // servidor: se reescriben a numerados (?1, ?2…) y el objeto se pasa como array.
  const originalPrepare = db.prepare.bind(db)
  // Estado de esta conexión. Cada sentencia lo lleva consigo porque el parche
  // del prototipo se instala una sola vez y la conexión puede reabrirse
  // (closeDb + getDb, ej. al restaurar un backup).
  const ctx: CompatContext = {
    db,
    replica: !!syncUrl,
    originalPrepare,
    // Sentencias preparadas dentro de la transacción en curso (solo réplica).
    txStatements: null,
  }
  db.prepare = (sql: string) => {
    const { sql: rewritten, names } = namedToNumbered(sql)
    const stmt = originalPrepare(rewritten)
    if (names.length > 0) stmt.__paramNames = names
    // Réplica embebida: una sentencia preparada antes del BEGIN se ejecuta fuera
    // de la transacción (se graba aunque haya ROLLBACK y rompe la transacción).
    // Se vuelve a preparar al ejecutarla, en el estado actual de la conexión.
    if (ctx.replica) {
      stmt.__sql = rewritten
      stmt.__ctx = ctx
      if (ctx.txStatements && db.inTransaction && !ctx.txStatements.has(rewritten)) ctx.txStatements.set(rewritten, stmt)
    }
    return stmt
  }

  const probe = db.prepare('SELECT 1')
  const statementProto = Object.getPrototypeOf(probe)
  if (!statementProto.__compatPatched) {
    const fixArgs = (stmt: { __paramNames?: string[] }, args: unknown[]) => {
      const names = stmt.__paramNames
      const single = args.length === 1 ? args[0] : undefined
      if (names && single && typeof single === 'object' && !Array.isArray(single) && !Buffer.isBuffer(single)) {
        const params = single as Record<string, unknown>
        return [names.map(name => {
          // Mismo error que better-sqlite3 ante un parámetro con nombre faltante.
          if (params[name] === undefined) throw new RangeError(`Missing named parameter "${name}"`)
          return params[name]
        })]
      }
      // Un único parámetro null lo toma como objeto de parámetros nombrados y
      // falla ("failed to downcast any to object"); envuelto en array va posicional.
      return args.length === 1 && args[0] === null ? [[null]] : args
    }
    // Fuera de una transacción preparar es local (~0 ms); dentro es un viaje a
    // Turso, así que cada SQL se prepara una vez por transacción y se reutiliza.
    const target = (stmt: CompatStatement) => {
      const ctx = stmt.__ctx
      if (!ctx || !stmt.__sql) return stmt
      let fresh = ctx.txStatements?.get(stmt.__sql)
      if (!fresh) {
        fresh = ctx.originalPrepare(stmt.__sql) as CompatStatement
        if (ctx.txStatements && ctx.db.inTransaction) ctx.txStatements.set(stmt.__sql, fresh)
      }
      fresh.pluckMode = stmt.pluckMode
      return fresh
    }
    for (const method of ['run', 'all', 'iterate']) {
      const original = statementProto[method]
      statementProto[method] = function (this: CompatStatement, ...args: unknown[]) {
        const result = original.apply(target(this), fixArgs(this, args))
        const ctx = this.__ctx
        if (ctx && method === 'run' && !ctx.db.inTransaction) ctx.db.sync()
        return result
      }
    }
    const originalGet = statementProto.get
    statementProto.get = function (this: CompatStatement, ...args: unknown[]) {
      const row = originalGet.apply(target(this), fixArgs(this, args))
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
      if (ctx.replica) ctx.txStatements = new Map()
      try {
        const result = fn(...args)
        db.exec('COMMIT')
        if (syncUrl) db.sync()
        return result
      } catch (err) {
        // En una réplica embebida la transacción vive en Turso: si el error la
        // cerró allá, el ROLLBACK falla y no debe tapar el error original.
        try {
          if (db.inTransaction) db.exec('ROLLBACK')
        } catch (rollbackErr) {
          console.error('[db] ROLLBACK falló:', rollbackErr)
        }
        throw err
      } finally {
        ctx.txStatements = null
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

/**
 * Reemplaza los parámetros con nombre (@x, :x, $x) por numerados (?1, ?2…),
 * ignorando literales, identificadores entre comillas y comentarios. Devuelve
 * los nombres en el orden de su número. Si la sentencia mezcla `?` sueltos con
 * nombres no se toca (la numeración no sería confiable).
 */
function namedToNumbered(sql: string): { sql: string; names: string[] } {
  const names: string[] = []
  let out = ''
  let hasBarePositional = false
  let i = 0
  while (i < sql.length) {
    const ch = sql[i]
    if (ch === "'" || ch === '"' || ch === '`' || ch === '[') {
      const close = ch === '[' ? ']' : ch
      let j = i + 1
      while (j < sql.length) {
        if (sql[j] === close) {
          if (close !== ']' && sql[j + 1] === close) { j += 2; continue }
          break
        }
        j++
      }
      out += sql.slice(i, j + 1)
      i = j + 1
    } else if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i)
      const j = end === -1 ? sql.length : end
      out += sql.slice(i, j)
      i = j
    } else if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2)
      const j = end === -1 ? sql.length : end + 2
      out += sql.slice(i, j)
      i = j
    } else if ((ch === '@' || ch === ':' || ch === '$') && /[A-Za-z_]/.test(sql[i + 1] ?? '')) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(sql.slice(i + 1))!
      const name = match[0]
      let idx = names.indexOf(name)
      if (idx === -1) idx = names.push(name) - 1
      out += `?${idx + 1}`
      i += 1 + name.length
    } else {
      if (ch === '?' && !/[0-9]/.test(sql[i + 1] ?? '')) hasBarePositional = true
      out += ch
      i++
    }
  }
  if (names.length === 0 || hasBarePositional) return { sql, names: [] }
  return { sql: out, names }
}

/** Closes the database connection (call on app quit). */
export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}
