import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { SearchAnalyticsService } from '../modules/search-analytics/service'
import type { SearchAnalyticsFilters } from '../modules/search-analytics/types'

export function registerSearchAnalyticsHandlers(db: Database): void {
  const service = new SearchAnalyticsService(db)

  ipcMain.handle('searchAnalytics:getReport', (_event, filters: SearchAnalyticsFilters) => {
    return service.getReport(filters)
  })
}
