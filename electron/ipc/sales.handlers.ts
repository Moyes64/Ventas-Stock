import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { SaleService } from '../modules/sales/service'
import { InvoicingService } from '../modules/invoicing-afip/service'
import type { CreateSaleInput, PaymentMethod } from '../modules/sales/types'

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

  ipcMain.handle(
    'sales:updatePaymentMethod',
    (_event, id: number, paymentMethod: PaymentMethod) => {
      return saleService.updatePaymentMethod(id, paymentMethod)
    }
  )

  ipcMain.handle('sales:cancelSale', (_event, id: number) => {
    return saleService.cancelSale(id)
  })
}
