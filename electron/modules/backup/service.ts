import fs from 'fs'
import path from 'path'
import { closeDb, getDb } from '../../../database/db'
import type { BackupInfo, BackupResult, RestoreResult } from './types'

export class BackupService {
  private get dbPath(): string {
    return path.resolve(process.env.DB_PATH ?? './data/ventas.db')
  }

  private get backupDir(): string {
    return path.resolve(process.env.BACKUP_DIR ?? './backups')
  }

  /** Creates a timestamped copy of the SQLite database file. */
  createBackup(): BackupResult {
    try {
      const dbPath = this.dbPath

      if (!fs.existsSync(dbPath)) {
        return { success: false, error: 'Base de datos no encontrada' }
      }

      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true })
      }

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19)
      const filename = `ventas-${timestamp}.db`
      const destPath = path.join(this.backupDir, filename)

      // Use SQLite backup API for safe hot backup
      const db = getDb()
      db.backup(destPath)

      const stats = fs.statSync(destPath)

      const backup: BackupInfo = {
        filename,
        path: destPath,
        sizeBytes: stats.size,
        createdAt: timestamp,
      }

      console.log(`[Backup] Created: ${destPath} (${stats.size} bytes)`)
      return { success: true, backup }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      console.error(`[Backup] Error creating backup: ${error}`)
      return { success: false, error }
    }
  }

  /** Lists all backup files in the backup directory, newest first. */
  listBackups(): BackupInfo[] {
    if (!fs.existsSync(this.backupDir)) return []

    const files = fs
      .readdirSync(this.backupDir)
      .filter(f => f.endsWith('.db'))
      .sort()
      .reverse()

    return files.map(filename => {
      const filePath = path.join(this.backupDir, filename)
      const stats = fs.statSync(filePath)
      return {
        filename,
        path: filePath,
        sizeBytes: stats.size,
        createdAt: stats.birthtime.toISOString(),
      }
    })
  }

  /**
   * Restores the database from a backup file.
   * WARNING: This will close the current DB connection and overwrite the live DB.
   * The app must be restarted after a restore.
   */
  restoreBackup(backupFilename: string): RestoreResult {
    try {
      const backupPath = path.join(this.backupDir, backupFilename)

      if (!fs.existsSync(backupPath)) {
        return { success: false, error: `Backup no encontrado: ${backupFilename}` }
      }

      const dbPath = this.dbPath

      // Close current connection before overwriting
      closeDb()

      // Create a safety copy of current DB
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, `${dbPath}.pre-restore`)
      }

      // Restore
      fs.copyFileSync(backupPath, dbPath)
      console.log(`[Backup] Restored from: ${backupPath}`)

      return { success: true }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      console.error(`[Backup] Error restoring: ${error}`)
      return { success: false, error }
    }
  }

  /** Deletes backup files older than retentionDays. */
  purgeOldBackups(retentionDays: number): number {
    if (!fs.existsSync(this.backupDir)) return 0

    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    let deleted = 0

    const files = fs.readdirSync(this.backupDir).filter(f => f.endsWith('.db'))

    for (const file of files) {
      const filePath = path.join(this.backupDir, file)
      const stats = fs.statSync(filePath)
      if (stats.mtimeMs < cutoff) {
        fs.unlinkSync(filePath)
        deleted++
      }
    }

    if (deleted > 0) {
      console.log(`[Backup] Purged ${deleted} old backup(s)`)
    }

    return deleted
  }
}
