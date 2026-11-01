import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { PrincipalService } from '../modules/principal/service'
import { recheckPrincipalJobs } from '../principal-jobs'

export function registerPrincipalHandlers(db: Database): void {
  const principalService = new PrincipalService(db)

  ipcMain.handle('principal:getStatus', () => {
    return principalService.status()
  })

  // Esta PC arranca sus tareas ya; la que deja de ser principal las frena en
  // su próximo chequeo (electron/principal-jobs.ts, cada minuto).
  ipcMain.handle('principal:setThisAsPrincipal', async () => {
    const status = principalService.setThisAsPrincipal()
    await recheckPrincipalJobs()
    return status
  })
}
