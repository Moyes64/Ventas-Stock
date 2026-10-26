import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import type { Database } from 'better-sqlite3'
import { ReportingService } from '../modules/reporting/service'
import type { ReportFilters } from '../modules/reporting/types'

export function registerReportingHandlers(db: Database): void {
  const reportingService = new ReportingService(db)

  ipcMain.handle('reporting:salesByDateRange', (_event, filters: ReportFilters) => {
    return reportingService.salesByDateRange(filters)
  })

  ipcMain.handle('reporting:exchangeDifferences', (_event, filters: ReportFilters) => {
    return reportingService.exchangeDifferences(filters)
  })

  ipcMain.handle('reporting:topProducts', (_event, filters: ReportFilters) => {
    return reportingService.topProductsByRevenue(filters)
  })

  ipcMain.handle('reporting:lowStock', () => {
    return reportingService.lowStockProducts()
  })

  ipcMain.handle('reporting:stockMovements', (_event, filters: ReportFilters) => {
    return reportingService.stockMovements(filters)
  })

  ipcMain.handle('reporting:dailySummary', (_event, filters: ReportFilters) => {
    return reportingService.dailySummary(filters)
  })

  ipcMain.handle('reporting:rankingPorCantidad', (_event, filters: ReportFilters) => {
    return reportingService.rankingPorCantidad(filters)
  })

  ipcMain.handle('reporting:rankingPorGanancia', (_event, filters: ReportFilters) => {
    return reportingService.rankingPorGanancia(filters)
  })

  // Productos vendidos en el período (todos, no solo el top 10) exportados a
  // .xlsx (por defecto) o .csv, según la extensión elegida en el diálogo.
  ipcMain.handle('reporting:exportProductsReport', async (_event, filters: ReportFilters) => {
    try {
      const items = reportingService.productSalesSummary(filters)
      if (items.length === 0) {
        return { success: false, error: 'No hay ventas de productos en el período seleccionado.' }
      }

      const ddmmyyyy = (iso?: string) => iso ? iso.split('-').reverse().join('-') : ''
      const baseName = `Productos_vendidos_${ddmmyyyy(filters.dateFrom)}_al_${ddmmyyyy(filters.dateTo)}`
        .replace(/[\\/:*?"<>|]/g, '')
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Exportar productos vendidos a Excel',
        defaultPath: `${baseName}.xlsx`,
        filters: [
          { name: 'Excel', extensions: ['xlsx'] },
          { name: 'CSV (Excel)', extensions: ['csv'] },
        ],
      })
      if (canceled || !filePath) return { success: false, canceled: true }

      const headers = ['#', 'SKU', 'Código de barras', 'Producto', 'Unidades', 'Total vendido', 'Ganancia neta']

      if (path.extname(filePath).toLowerCase() === '.csv') {
        // Formato regional AR: separador ';' y coma decimal, con BOM para que
        // Excel lo abra como UTF-8 (acentos).
        const num = (n: number) => n.toFixed(2).replace('.', ',')
        const cell = (v: string) => /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
        const lines = [headers, ...items.map((i, idx) => [
          String(idx + 1),
          i.sku,
          i.barcode ?? '',
          i.productName,
          String(i.quantity),
          num(i.revenue),
          num(i.profit),
        ])].map(r => r.map(cell).join(';'))
        fs.writeFileSync(filePath, String.fromCharCode(0xfeff) + lines.join('\r\n'), 'utf-8')
      } else {
        const rows = items.map((i, idx) => [
          idx + 1,
          i.sku,
          i.barcode ?? '',
          i.productName,
          i.quantity,
          i.revenue,
          i.profit,
        ])
        const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
        sheet['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 16 }, { wch: 45 }, { wch: 10 }, { wch: 16 }, { wch: 16 }]
        // Formato numérico para total vendido / ganancia (columnas F-G)
        for (let r = 1; r <= rows.length; r++) {
          for (const c of [5, 6]) {
            const ref = XLSX.utils.encode_cell({ r, c })
            if (sheet[ref]) sheet[ref].z = '#,##0.00'
          }
        }
        const book = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(book, sheet, 'Productos vendidos')
        fs.writeFileSync(filePath, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
      }

      return { success: true, count: items.length, filePath }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('reporting:purchasesBySupplier', (_event, filters: ReportFilters) => {
    return reportingService.purchasesBySupplier(filters)
  })

  ipcMain.handle(
    'reporting:incompleteEntries',
    (_event, filters: { dateFrom?: string; dateTo?: string }) => {
      return reportingService.incompleteEntries(filters)
    }
  )
}
