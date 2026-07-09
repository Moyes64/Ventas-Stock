import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { PrintingService } from '../modules/printing/service'
import { printSystemTicket } from '../modules/printing/system-printer'
import { buildChangeTicketBuffer } from '../modules/printing/escpos-change-ticket'
import { PrinterConfigService } from '../modules/printer-config/service'
import { sendEscPos } from '../modules/printer-config/service'
import { SystemParamsService } from '../modules/system-params/service'

async function printChangeTicketForSale(db: Database, saleId: number): Promise<void> {
  const { SaleRepository } = await import('../modules/sales/repository')
  const saleRepo = new SaleRepository(db)
  const sale = saleRepo.findById(saleId)
  if (!sale) throw new Error(`Venta no encontrada: ${saleId}`)

  const params = new SystemParamsService().get()
  const printerCfg = new PrinterConfigService().get()

  const data = {
    saleId: sale.id,
    saleDate: sale.saleDate,
    companyName: params.denominacion || 'Comercio',
    customerId: sale.customerId ?? null,
    customerName: sale.customerName ?? 'Consumidor Final',
    items: (sale.items ?? []).map((i) => ({
      productId:   i.productId,
      productName: (i as { productName?: string }).productName ?? `Producto #${i.productId}`,
      quantity:    i.quantity,
      unitPrice:   i.unitPrice,
    })),
    diasCambio: params.diasCambio ?? 30,
  }

  const buffer = buildChangeTicketBuffer(data)
  await sendEscPos(printerCfg, buffer)
}

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
      await printChangeTicketForSale(db, saleId)
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

  // Impresión en lote: imprime todas las facturas de una lista de IDs
  ipcMain.handle('printing:printBatch', async (_event, saleIds: number[]) => {
    const { SaleRepository } = await import('../modules/sales/repository')
    const saleRepo = new SaleRepository(db)
    const errors: string[] = []
    let printed = 0

    for (const saleId of saleIds) {
      try {
        const sale = saleRepo.findById(saleId)
        if (!sale) { errors.push(`Venta ${saleId} no encontrada`); continue }
        const ticketData = await printingService.buildTicketData(sale)
        const isInvoice = sale.status === 'AUTHORIZED'
        await printSystemTicket(ticketData, isInvoice ? 'invoice' : 'delivery')
        if (isInvoice) await printChangeTicketForSale(db, saleId)
        printed++
      } catch (err) {
        errors.push(`Venta ${saleId}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return { success: errors.length === 0, printed, errors }
  })

  // Ticket de cambio: imprime un slip ESC/POS con QR por cada ítem de la venta
  ipcMain.handle('printing:printChangeTicket', async (_event, saleId: number) => {
    try {
      await printChangeTicketForSale(db, saleId)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Lista de ventas del día con filtros extendidos (para reimpresión)
  ipcMain.handle('printing:listForReprint', async (_event, filters: {
    dateFrom?: string; dateTo?: string; status?: string
    customerName?: string; customerDoc?: string; invoiceNumber?: number
  }) => {
    const { SaleRepository } = await import('../modules/sales/repository')
    const saleRepo = new SaleRepository(db)
    return saleRepo.list(filters)
  })
}
