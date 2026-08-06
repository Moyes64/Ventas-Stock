import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { StockCountService } from '../modules/stock-count/service'
import type { StockCountSessionStatus, ApplyReconciliationDecision } from '../modules/stock-count/types'

export function registerStockCountHandlers(db: Database): void {
  const stockCountService = new StockCountService(db)

  // Servidor local
  ipcMain.handle('stockCount:getServerStatus', () => {
    return stockCountService.getServerStatus()
  })

  ipcMain.handle('stockCount:setServerEnabled', (_event, enabled: boolean) => {
    return stockCountService.setEnabled(enabled)
  })

  ipcMain.handle('stockCount:regenerateToken', () => {
    return stockCountService.regenerateToken()
  })

  ipcMain.handle('stockCount:getSessionPairingQr', (_event, sessionId: number) => {
    return stockCountService.getSessionPairingQr(sessionId)
  })

  // Sesiones
  ipcMain.handle('stockCount:createSession', (_event, label: string, webCategoryId: number | null) => {
    return stockCountService.createSession(label, webCategoryId)
  })

  ipcMain.handle('stockCount:listSessions', (_event, statusFilter?: StockCountSessionStatus) => {
    return stockCountService.listSessions(statusFilter)
  })

  ipcMain.handle('stockCount:getSession', (_event, id: number) => {
    return stockCountService.getSession(id)
  })

  ipcMain.handle('stockCount:getReconciliation', (_event, sessionId: number) => {
    return stockCountService.getReconciliation(sessionId)
  })

  ipcMain.handle(
    'stockCount:applyReconciliation',
    (_event, sessionId: number, decisions: ApplyReconciliationDecision[]) => {
      stockCountService.applyReconciliation(sessionId, decisions)
    }
  )

  ipcMain.handle('stockCount:cancelSession', (_event, id: number) => {
    stockCountService.cancelSession(id)
  })

  ipcMain.handle('stockCount:deleteSession', (_event, id: number) => {
    stockCountService.deleteSession(id)
  })
}
