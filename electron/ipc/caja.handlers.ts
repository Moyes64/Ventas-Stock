import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { CajaService } from '../modules/caja/service'
import type { CreateSessionInput, CreateMovementInput } from '../modules/caja/types'

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

  // Movimientos
  ipcMain.handle('caja:listMovements', (_event, date: string) => {
    return cajaService.listMovements(date)
  })

  ipcMain.handle('caja:createMovement', (_event, input: CreateMovementInput) => {
    return cajaService.createMovement(input)
  })

  ipcMain.handle('caja:deleteMovement', (_event, id: number) => {
    return cajaService.deleteMovement(id)
  })
}
