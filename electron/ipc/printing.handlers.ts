import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { PrintingService } from '../modules/printing/service'

export function registerPrintingHandlers(db: Database): void {
  const printingService = new PrintingService(db)

  ipcMain.handle('printing:printSale', async (_event, saleId: number) => {
    const { SaleRepository } = await import('../modules/sales/repository')
    const saleRepo = new SaleRepository(db)
    const sale = saleRepo.findById(saleId)
    if (!sale) return { success: false, error: `Venta no encontrada: ${saleId}` }

    if (sale.status === 'AUTHORIZED') {
      await printingService.printAuthorizedTicket(saleId)
    } else {
      await printingService.printInternalReceipt(saleId)
    }

    return { success: true }
  })

  ipcMain.handle('printing:buildTicketData', async (_event, saleId: number) => {
    const { SaleRepository } = await import('../modules/sales/repository')
    const saleRepo = new SaleRepository(db)
    const sale = saleRepo.findById(saleId)
    if (!sale) return null

    return printingService.buildTicketData(sale)
  })
}
