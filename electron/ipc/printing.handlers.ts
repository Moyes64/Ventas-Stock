import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
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

  // Listado de stock (para control físico manual).
  // Si se pasa supplierId, se filtra a solo los productos de ese proveedor.
  ipcMain.handle('printing:printStockReport', async (_event, supplierId?: number) => {
    try {
      const printerCfg = new PrinterConfigService().get()
      const isReady = printerCfg.connectionType === 'usb'
        ? !!printerCfg.usbPrinterName
        : !!printerCfg.ip
      if (!printerCfg.enabled || !isReady) {
        return { success: false, error: 'La impresora térmica no está configurada. Revisá Configuración → Impresora.' }
      }

      const allItems = new StockService(db).getStockItems()
      const items = supplierId
        ? allItems.filter(i => i.supplierId === supplierId)
        : allItems

      if (supplierId && items.length === 0) {
        return { success: false, error: 'El proveedor seleccionado no tiene productos activos cargados.' }
      }

      const supplierName = supplierId
        ? new SupplierService(db).getById(supplierId)?.name
        : undefined

      const buffer = buildStockReportBuffer(items, supplierName)
      await sendEscPos(printerCfg, buffer)
      return { success: true, count: items.length }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Mismo listado de stock exportado a .xlsx (por defecto) o .csv, con la
  // columna "Stock real" vacía para completar el conteo a mano o en Excel.
  ipcMain.handle('printing:exportStockReport', async (_event, supplierId?: number) => {
    try {
      const allItems = new StockService(db).getStockItems()
      const items = (supplierId
        ? allItems.filter(i => i.supplierId === supplierId)
        : allItems
      ).sort((a, b) => a.productName.localeCompare(b.productName, 'es'))

      if (items.length === 0) {
        return {
          success: false,
          error: supplierId
            ? 'El proveedor seleccionado no tiene productos activos cargados.'
            : 'No hay productos activos para exportar.',
        }
      }

      const supplierNames = new Map(new SupplierService(db).list(false).map(s => [s.id, s.name]))
      const supplierName = supplierId ? supplierNames.get(supplierId) : undefined

      const baseName = `Listado_stock${supplierName ? `_${supplierName}` : ''}_${new Date().toISOString().slice(0, 10)}`
        .replace(/[\\/:*?"<>|]/g, '')
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Exportar listado de stock a Excel',
        defaultPath: `${baseName}.xlsx`,
        filters: [
          { name: 'Excel', extensions: ['xlsx'] },
          { name: 'CSV (Excel)', extensions: ['csv'] },
        ],
      })
      if (canceled || !filePath) return { success: false, canceled: true }

      const headers = ['SKU', 'Código de barras', 'Producto', 'Proveedor', 'Stock sistema', 'Stock real']
      const rows = items.map(i => [
        i.sku,
        i.barcode ?? '',
        i.productName,
        i.supplierId ? supplierNames.get(i.supplierId) ?? '' : '',
        i.currentStock,
        '',
      ])

      if (path.extname(filePath).toLowerCase() === '.csv') {
        // Formato regional AR: separador ';', con BOM para que Excel lo abra
        // como UTF-8 (acentos).
        const cell = (v: string | number) => {
          const s = String(v)
          return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        }
        const lines = [headers, ...rows].map(r => r.map(cell).join(';'))
        fs.writeFileSync(filePath, String.fromCharCode(0xfeff) + lines.join('\r\n'), 'utf-8')
      } else {
        const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
        sheet['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 45 }, { wch: 22 }, { wch: 13 }, { wch: 12 }]
        const book = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(book, sheet, 'Listado de stock')
        fs.writeFileSync(filePath, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
      }

      return { success: true, count: items.length, filePath }
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

  // Mismo listado de precios pero exportado a archivo: .xlsx (por defecto) o
  // .csv, según la extensión que elija el usuario en el diálogo de guardado.
  ipcMain.handle('printing:exportPriceReport', async (_event, supplierId?: number) => {
    try {
      const productService = new ProductService(db)
      const allProducts = productService.list()
      const products = (supplierId
        ? allProducts.filter(p => p.supplierId === supplierId)
        : allProducts
      ).sort((a, b) => a.name.localeCompare(b.name, 'es'))

      if (products.length === 0) {
        return {
          success: false,
          error: supplierId
            ? 'El proveedor seleccionado no tiene productos activos cargados.'
            : 'No hay productos activos para exportar.',
        }
      }

      const supplierService = new SupplierService(db)
      const supplierNames = new Map(supplierService.list(false).map(s => [s.id, s.name]))
      const supplierName = supplierId ? supplierNames.get(supplierId) : undefined

      const baseName = `Listado_precios${supplierName ? `_${supplierName}` : ''}_${new Date().toISOString().slice(0, 10)}`
        .replace(/[\\/:*?"<>|]/g, '')
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Exportar listado de precios a Excel',
        defaultPath: `${baseName}.xlsx`,
        filters: [
          { name: 'Excel', extensions: ['xlsx'] },
          { name: 'CSV (Excel)', extensions: ['csv'] },
        ],
      })
      if (canceled || !filePath) return { success: false, canceled: true }

      const headers = ['SKU', 'Código de barras', 'Producto', 'Proveedor', 'Costo', 'Ganancia %', 'Precio al público']
      const isCsv = path.extname(filePath).toLowerCase() === '.csv'

      if (isCsv) {
        // Formato regional AR: separador ';' y coma decimal, con BOM para que
        // Excel lo abra como UTF-8 (acentos).
        const num = (n: number) => n.toFixed(2).replace('.', ',')
        const cell = (v: string) => /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
        const lines = [headers, ...products.map(p => [
          p.sku,
          p.barcode ?? '',
          p.name,
          p.supplierId ? supplierNames.get(p.supplierId) ?? '' : '',
          num(p.cost),
          num(p.gainPercent),
          num(p.price),
        ])].map(r => r.map(cell).join(';'))
        fs.writeFileSync(filePath, String.fromCharCode(0xfeff) + lines.join('\r\n'), 'utf-8')
      } else {
        const rows = products.map(p => [
          p.sku,
          p.barcode ?? '',
          p.name,
          p.supplierId ? supplierNames.get(p.supplierId) ?? '' : '',
          p.cost,
          p.gainPercent,
          p.price,
        ])
        const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
        sheet['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 45 }, { wch: 22 }, { wch: 12 }, { wch: 11 }, { wch: 16 }]
        // Formato numérico para costo / ganancia / precio (columnas E-G)
        for (let r = 1; r <= rows.length; r++) {
          for (const c of [4, 5, 6]) {
            const ref = XLSX.utils.encode_cell({ r, c })
            if (sheet[ref]) sheet[ref].z = '#,##0.00'
          }
        }
        const book = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(book, sheet, 'Listado de precios')
        fs.writeFileSync(filePath, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
      }

      return { success: true, count: products.length, filePath }
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
