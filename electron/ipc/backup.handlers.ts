import { ipcMain } from 'electron'
import { BackupService } from '../modules/backup/service'

export function registerBackupHandlers(): void {
  const backupService = new BackupService()

  ipcMain.handle('backup:create', () => {
    return backupService.createBackup()
  })

  ipcMain.handle('backup:list', () => {
    return backupService.listBackups()
  })

  ipcMain.handle('backup:restore', (_event, filename: string) => {
    return backupService.restoreBackup(filename)
  })

  ipcMain.handle('backup:purge', (_event, retentionDays: number) => {
    return backupService.purgeOldBackups(retentionDays)
  })
}
