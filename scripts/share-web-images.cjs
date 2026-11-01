/**
 * Día de la migración a la base compartida (Turso): sube a web_image_files las
 * fotos del catálogo web que ya están en la carpeta web-images de esta PC, para
 * que las demás PCs las tengan. Sube solo las que usa algún producto o banner y
 * que todavía no están en la base. Se puede cortar y volver a correr.
 *
 * Uso (con TURSO_DATABASE_URL y TURSO_AUTH_TOKEN en el entorno):
 *   node scripts/share-web-images.cjs <carpeta web-images> <archivo réplica local> [--limit N]
 */
const fs = require('fs')
const path = require('path')
const Database = require('libsql')

const [imagesDir, replicaPath] = process.argv.slice(2)
const limitArg = process.argv.indexOf('--limit')
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity
if (!imagesDir || !replicaPath || !process.env.TURSO_DATABASE_URL) {
  console.error('Uso: node scripts/share-web-images.cjs <carpeta web-images> <réplica local> [--limit N]  (con TURSO_DATABASE_URL y TURSO_AUTH_TOKEN)')
  process.exit(1)
}

const db = new Database(replicaPath, {
  syncUrl: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN ?? '',
})
db.sync()

const referenced = db
  .prepare(
    `SELECT filename FROM web_product_images
     UNION SELECT image_filename FROM web_banners WHERE image_filename IS NOT NULL`
  )
  .all()
  .map(r => r.filename)
const shared = new Set(db.prepare('SELECT filename FROM web_image_files').all().map(r => r.filename))
const pending = referenced.filter(f => !shared.has(f) && fs.existsSync(path.join(imagesDir, f))).slice(0, limit)
const missing = referenced.filter(f => !shared.has(f) && !fs.existsSync(path.join(imagesDir, f)))

console.log(`fotos usadas: ${referenced.length} | ya en la base: ${shared.size} | a subir: ${pending.length} | sin archivo en esta PC: ${missing.length}`)

const started = Date.now()
let bytes = 0
const BATCH = Number(process.env.SHARE_BATCH ?? 20)
for (let i = 0; i < pending.length; i += BATCH) {
  const chunk = pending.slice(i, i + BATCH)
  db.exec('BEGIN')
  // Se prepara DESPUÉS del BEGIN: en la réplica de libsql una sentencia
  // preparada antes se ejecuta fuera de la transacción (ver database/db.ts).
  const insert = db.prepare('INSERT OR IGNORE INTO web_image_files (filename, data, size) VALUES (?, ?, ?)')
  for (const filename of chunk) {
    const data = fs.readFileSync(path.join(imagesDir, filename))
    insert.run([filename, data, data.length])
    bytes += data.length
  }
  db.exec('COMMIT')
  const done = Math.min(i + BATCH, pending.length)
  const secs = (Date.now() - started) / 1000
  console.log(`  ${done}/${pending.length} · ${(bytes / 1048576).toFixed(1)} MB · ${secs.toFixed(0)} s`)
}
db.sync()
console.log(`listo: ${pending.length} fotos, ${(bytes / 1048576).toFixed(1)} MB en ${((Date.now() - started) / 1000).toFixed(0)} s`)
if (missing.length) console.log('sin archivo en esta PC (revisar):', missing.slice(0, 20).join(', '), missing.length > 20 ? '…' : '')
