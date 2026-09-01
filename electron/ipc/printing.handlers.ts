import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { PrintingService } from '../modules/printing/service'
import { printSystemTicket } from '../modules/printing/system-printer'
import { exportInvoicePdf } from '../modules/printing/pdf'
import { buildChangeTicketBuffer } from '../modules/printing/escpos-change-ticket'
import { buildStockReportBuffer } from '../modules/printing/escpos-stock-report'
import { buildPriceReportBuffer } from '../modules/printing/escpos-price-report'
import { PrinterConfigService } from '../modules/printer-config/service'
import { sendEscPos } from '../modules/printer-config/service'
import { SystemParamsService } from '../modules/system-params/service'
import { StockService } from '../modules/stock/service'
import { ProductService } from '../modules/catalog/service'
import { SupplierService } from '../modules/suppliers/service'

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
  //
  // includeChangeTicket (default true): al cerrar una venta en el mostrador
  // tiene sentido imprimir factura + ticket de cambio juntos en el momento.
  // Pero esta misma función también la usa la reimpresión desde Facturación
  // (venta ya vieja) — ahí forzar un ticket de cambio térmico en cada
  // reimpresión no tiene sentido y rompe la reimpresión entera si no hay
  // térmica conectada. Los llamados de reimpresión pasan `false`.
  ipcMain.handle('printing:printInvoiceSystem', async (_event, saleId: number, includeChangeTicket = true) => {
    try {
      const { SaleRepository } = await import('../modules/sales/repository')
      const saleRepo = new SaleRepository(db)
      const sale = saleRepo.findById(saleId)
      if (!sale) return { success: false, error: `Venta no encontrada: ${saleId}` }

      const ticketData = await printingService.buildTicketData(sale)
      await printSystemTicket(ticketData, 'invoice')
      if (includeChangeTicket) await printChangeTicketForSale(db, saleId)
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

  // Exporta el comprobante a PDF (mismo HTML "documento" que ya usa el email)
  ipcMain.handle('printing:exportInvoicePdf', async (_event, saleId: number) => {
    try {
      const { SaleRepository } = await import('../modules/sales/repository')
      const saleRepo = new SaleRepository(db)
      const sale = saleRepo.findById(saleId)
      if (!sale) return { success: false, error: `Venta no encontrada: ${saleId}` }

      const ticketData = await printingService.buildTicketData(sale)
      if (!ticketData) return { success: false, error: `No se pudo construir el comprobante N° ${saleId}.` }

      return await exportInvoicePdf(ticketData)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Impresión en lote: imprime todas las facturas de una lista de IDs.
  // Es siempre reimpresión (nunca el cierre de una venta en el mostrador), así
  // que no dispara el ticket de cambio automático — ver printInvoiceSystem.
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

  // Listado completo de stock (para control físico manual)
  ipcMain.handle('printing:printStockReport', async () => {
    try {
      const printerCfg = new PrinterConfigService().get()
      const isReady = printerCfg.connectionType === 'usb'
        ? !!printerCfg.usbPrinterName
        : !!printerCfg.ip
      if (!printerCfg.enabled || !isReady) {
        return { success: false, error: 'La impresora térmica no está configurada. Revisá Configuración → Impresora.' }
      }

      const stockService = new StockService(db)
      const items = stockService.getStockItems()
      const buffer = buildStockReportBuffer(items)
      await sendEscPos(printerCfg, buffer)
      return { success: true, count: items.length }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Listado de precios: producto, costo, ganancia y precio al público.
  // Si se pasa supplierId, se filtra a solo los productos de ese proveedor.
  ipcMain.handle('printing:printPriceReport', async (_event, supplierId?: number) => {
    try {
      const printerCfg = new PrinterConfigService().get()
      const isReady = printerCfg.connectionType === 'usb'
        ? !!printerCfg.usbPrinterName
        : !!printerCfg.ip
      if (!printerCfg.enabled || !isReady) {
        return { success: false, error: 'La impresora térmica no está configurada. Revisá Configuración → Impresora.' }
      }

      const productService = new ProductService(db)
      const allProducts = productService.list()
      const products = supplierId
        ? allProducts.filter(p => p.supplierId === supplierId)
        : allProducts

      if (supplierId && products.length === 0) {
        return { success: false, error: 'El proveedor seleccionado no tiene productos activos cargados.' }
      }

      const supplierName = supplierId
        ? new SupplierService(db).getById(supplierId)?.name
        : undefined

      const buffer = buildPriceReportBuffer(products, supplierName)
      await sendEscPos(printerCfg, buffer)
      return { success: true, count: products.length }
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
