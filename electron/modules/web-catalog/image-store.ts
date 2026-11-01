import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDb } from '../../../database/db'
import { usesSharedDb } from '../principal/service'

/**
 * Fotos del catálogo web (productos y banners). Siempre se guardan como
 * archivo en la carpeta web-images de esta PC. Con la base compartida además
 * van a la tabla web_image_files, y si a esta PC le falta un archivo lo trae
 * de ahí la primera vez que lo necesita (mostrarlo, o subirlo a la web en la
 * PC principal). Todo acceso a las fotos pasa por acá.
 */
export function imagesDir(): string {
  const dir = process.env.WEB_IMAGES_DIR ?? path.join(app.getPath('userData'), 'web-images')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Ruta del archivo dentro de web-images. basename: el nombre viene de afuera (renderer, LAN). */
function localPath(filename: string): string {
  return path.join(imagesDir(), path.basename(filename))
}

export function writeImage(filename: string, data: Buffer): void {
  fs.writeFileSync(localPath(filename), data)
  if (usesSharedDb()) {
    getDb()
      .prepare(
        `INSERT INTO web_image_files (filename, data, size) VALUES (?, ?, ?)
         ON CONFLICT(filename) DO UPDATE SET data = excluded.data, size = excluded.size`
      )
      .run(path.basename(filename), data, data.length)
  }
}

/** Ruta local de la foto; si falta y está en la base compartida, la trae primero. */
export function imagePath(filename: string): string {
  const file = localPath(filename)
  if (!fs.existsSync(file) && usesSharedDb()) {
    const row = getDb()
      .prepare('SELECT data FROM web_image_files WHERE filename = ?')
      .get(path.basename(filename)) as { data: Buffer | ArrayBuffer | Uint8Array } | undefined
    if (row) fs.writeFileSync(file, Buffer.from(row.data as ArrayBuffer))
  }
  return file
}

export function removeImage(filename: string): void {
  const file = localPath(filename)
  if (fs.existsSync(file)) fs.unlinkSync(file)
  if (usesSharedDb()) {
    getDb().prepare('DELETE FROM web_image_files WHERE filename = ?').run(path.basename(filename))
  }
}
