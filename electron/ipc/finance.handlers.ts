import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { FinanceService } from '../modules/finance/service'
import type {
  CreateMovementInput,
  CreateCategoryInput,
  MovementFilters,
  FinanceCategoryAppliesTo,
} from '../modules/finance/types'

export function registerFinanceHandlers(db: Database): void {
  const financeService = new FinanceService(db)

  // Catálogos
  ipcMain.handle('finance:listPartners', () => {
    return financeService.listPartners()
  })

  ipcMain.handle('finance:listAccounts', () => {
    return financeService.listAccounts()
  })

  ipcMain.handle('finance:listCategories', (_event, appliesTo?: FinanceCategoryAppliesTo) => {
    return financeService.listCategories(appliesTo)
  })

  ipcMain.handle('finance:createCategory', (_event, input: CreateCategoryInput) => {
    return financeService.createCategory(input)
  })

  // Movimientos
  ipcMain.handle('finance:listMovements', (_event, filters?: MovementFilters) => {
    return financeService.listMovements(filters)
  })

  ipcMain.handle('finance:createMovement', (_event, input: CreateMovementInput) => {
    return financeService.createMovement(input)
  })

  ipcMain.handle('finance:deleteMovement', (_event, id: number) => {
    return financeService.deleteMovement(id)
  })

  // Reportes
  ipcMain.handle('finance:getAccountBalances', () => {
    return financeService.getAccountBalances()
  })

  ipcMain.handle(
    'finance:getCashFlowSummary',
    (_event, dateFrom: string, dateTo: string, groupBy?: 'day' | 'month', accountId?: number) => {
      return financeService.getCashFlowSummary(dateFrom, dateTo, groupBy, accountId)
    }
  )

  ipcMain.handle('finance:getExpensesByCategory', (_event, dateFrom: string, dateTo: string, accountId?: number) => {
    return financeService.getExpensesByCategory(dateFrom, dateTo, accountId)
  })

  ipcMain.handle('finance:getPartnersEquity', () => {
    return financeService.getPartnersEquity()
  })
}
