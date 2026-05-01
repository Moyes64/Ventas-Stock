import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { InvoicingService } from '../modules/invoicing-afip/service'

export function registerInvoicingHandlers(db: Database): void {
  const invoicingService = new InvoicingService(db)

  ipcMain.handle(
    'invoicing:list',
    (_event, filters: { dateFrom?: string; dateTo?: string; status?: string }) => {
      return invoicingService.listInvoices(filters)
    }
  )

  ipcMain.handle('invoicing:retryCAE', async (_event, saleId: number) => {
    // Re-request CAE for a previously rejected/pending sale
    const { SaleRepository } = await import('../modules/sales/repository')
    const saleRepo = new SaleRepository(db)
    const sale = saleRepo.findById(saleId)
    if (!sale) return { success: false, error: `Venta no encontrada: ${saleId}` }

    const result = await invoicingService.solicitarCAE(sale)

    if (result.success && result.cae) {
      saleRepo.updateStatus(sale.id, 'AUTHORIZED', {
        cae: result.cae,
        caeVto: result.caeVto!,
        invoiceNumber: result.invoiceNumber!,
        puntoVenta: result.puntoVenta!,
      })
    }

    return result
  })
}
