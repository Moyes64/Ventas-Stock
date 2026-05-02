import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { PrintingService } from '../modules/printing/service'
import { printSystemTicket } from '../modules/printing/system-printer'

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

  // System printing: opens the OS print dialog (no thermal printer required)
  ipcMain.handle('printing:printInvoiceSystem', async (_event, saleId: number) => {
    try {
      const { SaleRepository } = await import('../modules/sales/repository')
      const saleRepo = new SaleRepository(db)
      const sale = saleRepo.findById(saleId)
      if (!sale) return { success: false, error: `Venta no encontrada: ${saleId}` }

      const ticketData = await printingService.buildTicketData(sale)
      await printSystemTicket(ticketData, 'invoice')
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('printing:printDeliveryNoteSystem', async (_event, saleId: number) => {
    try {
      const { SaleRepository } = await import('../modules/sales/repository')
      const saleRepo = new SaleRepository(db)
      const sale = saleRepo.findById(saleId)
      if (!sale) return { success: false, error: `Venta no encontrada: ${saleId}` }

      const ticketData = await printingService.buildTicketData(sale)
      await printSystemTicket(ticketData, 'delivery')
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
