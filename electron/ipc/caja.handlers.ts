import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { CajaService } from '../modules/caja/service'
import type { CreateSessionInput } from '../modules/caja/types'

export function registerCajaHandlers(db: Database): void {
  const cajaService = new CajaService(db)

  // Apertura
  ipcMain.handle('caja:openSession', (_event, input: CreateSessionInput) => {
    return cajaService.openSession(input)
  })

  ipcMain.handle('caja:getOpenSession', () => {
    return cajaService.getOpenSession()
  })

  ipcMain.handle('caja:getSessionByDate', (_event, date: string) => {
    return cajaService.getSessionByDate(date)
  })

  ipcMain.handle('caja:getSuggestedApertura', (_event, sessionDate: string) => {
    return cajaService.getSuggestedApertura(sessionDate)
  })

  ipcMain.handle('caja:listSessions', (_event, limit?: number) => {
    return cajaService.listSessions(limit)
  })

  // Cierre
  ipcMain.handle('caja:getCierreSummary', (_event, date: string) => {
    return cajaService.getCierreSummary(date)
  })

  ipcMain.handle('caja:closeSession', (_event, date: string, cierreAmount: number) => {
    return cajaService.closeSession(date, cierreAmount)
  })

  ipcMain.handle('caja:reopenSession', (_event, date: string) => {
    return cajaService.reopenSession(date)
  })
}
