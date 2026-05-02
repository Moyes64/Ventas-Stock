import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { StockService } from '../modules/stock/service'
import type { CreateMovementInput, UpdateMovementInput } from '../modules/stock/types'

export function registerStockHandlers(db: Database): void {
  const stockService = new StockService(db)

  ipcMain.handle('stock:getItems', () => {
    return stockService.getStockItems()
  })

  ipcMain.handle('stock:getCurrent', (_event, productId: number) => {
    return stockService.getCurrentStock(productId)
  })

  ipcMain.handle(
    'stock:getMovements',
    (
      _event,
      filters: { productId?: number; dateFrom?: string; dateTo?: string; limit?: number }
    ) => {
      return stockService.getMovements(filters)
    }
  )

  ipcMain.handle('stock:addMovement', (_event, data: CreateMovementInput) => {
    return stockService.addManualMovement(data)
  })

  ipcMain.handle(
    'stock:updateMovement',
    (_event, id: number, data: UpdateMovementInput) => {
      return stockService.updateMovement(id, data)
    }
  )

  ipcMain.handle('stock:deleteMovement', (_event, id: number) => {
    return stockService.deleteMovement(id)
  })

  ipcMain.handle(
    'stock:adjustStock',
    (_event, productId: number, newQuantity: number, userId?: number) => {
      return stockService.adjustStockAbsolute(productId, newQuantity, userId)
    }
  )
}
