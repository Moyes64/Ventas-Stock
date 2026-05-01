import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { ReportingService } from '../modules/reporting/service'
import type { ReportFilters } from '../modules/reporting/types'

export function registerReportingHandlers(db: Database): void {
  const reportingService = new ReportingService(db)

  ipcMain.handle('reporting:salesByDateRange', (_event, filters: ReportFilters) => {
    return reportingService.salesByDateRange(filters)
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
}
