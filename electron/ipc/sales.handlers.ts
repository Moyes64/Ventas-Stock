import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { SaleService } from '../modules/sales/service'
import { InvoicingService } from '../modules/invoicing-afip/service'
import type { CreateSaleInput } from '../modules/sales/types'

export function registerSalesHandlers(db: Database): void {
  const invoicingService = new InvoicingService(db)
  const saleService = new SaleService(db, invoicingService)

  ipcMain.handle('sales:create', async (_event, input: CreateSaleInput) => {
    return saleService.createSale(input)
  })

  ipcMain.handle('sales:get', (_event, id: number) => {
    return saleService.getById(id)
  })

  ipcMain.handle(
    'sales:list',
    (
      _event,
      filters: { dateFrom?: string; dateTo?: string; status?: string; limit?: number }
    ) => {
      return saleService.list(filters)
    }
  )

  ipcMain.handle('sales:listPendingCAE', () => {
    return saleService.findPendingCAE()
  })
}
