import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import type { Database } from 'better-sqlite3'
import { FinanceService } from '../modules/finance/service'
import type {
  CreateMovementInput,
  CreateCategoryInput,
  MovementFilters,
  FinanceCategoryAppliesTo,
  CreateTransferInput,
  TransferFilters,
  MpFeePaymentMethod,
  CreateMpFeeRateInput,
  SaveMpReconciliationInput,
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

  ipcMain.handle('finance:getFoundingDate', () => {
    return financeService.getFoundingDate()
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

  ipcMain.handle('finance:getPendingAccreditations', (_event, accountId?: number) => {
    return financeService.getPendingAccreditations(accountId)
  })

  ipcMain.handle('finance:accreditMovement', (_event, movementId: number, fecha?: string) => {
    return financeService.accreditMovement(movementId, fecha)
  })

  // Transferencias entre cuentas
  ipcMain.handle('finance:listTransfers', (_event, filters?: TransferFilters) => {
    return financeService.listTransfers(filters)
  })

  ipcMain.handle('finance:createTransfer', (_event, input: CreateTransferInput) => {
    return financeService.createTransfer(input)
  })

  ipcMain.handle('finance:deleteTransfer', (_event, id: number) => {
    return financeService.deleteTransfer(id)
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

  // Comisiones de Mercado Pago (QR / Débito / Crédito)
  ipcMain.handle('finance:listMpFeeRates', (_event, paymentMethod?: MpFeePaymentMethod) => {
    return financeService.listMpFeeRates(paymentMethod)
  })

  ipcMain.handle('finance:createMpFeeRate', (_event, input: CreateMpFeeRateInput) => {
    return financeService.createMpFeeRate(input)
  })

  ipcMain.handle('finance:deleteMpFeeRate', (_event, id: number) => {
    return financeService.deleteMpFeeRate(id)
  })

  // Conciliación venta por venta con el resumen de Mercado Pago
  ipcMain.handle('finance:getMpReconciliationRows', (_event, fecha: string, paymentMethod?: MpFeePaymentMethod) => {
    return financeService.getMpReconciliationRows(fecha, paymentMethod)
  })

  ipcMain.handle('finance:listMpReconciliations', (_event, dateFrom?: string, dateTo?: string) => {
    return financeService.listMpReconciliations(dateFrom, dateTo)
  })

  ipcMain.handle('finance:saveMpReconciliation', (_event, input: SaveMpReconciliationInput) => {
    return financeService.saveMpReconciliation(input)
  })

  ipcMain.handle('finance:confirmMpReconciliationAdjustment', (_event, id: number) => {
    return financeService.confirmMpReconciliationAdjustment(id)
  })

  ipcMain.handle('finance:ignoreMpReconciliation', (_event, id: number) => {
    return financeService.ignoreMpReconciliation(id)
  })

  ipcMain.handle('finance:reopenMpReconciliation', (_event, id: number) => {
    return financeService.reopenMpReconciliation(id)
  })

  // Exportar movimientos a un archivo CSV que se abre con Excel
  ipcMain.handle('finance:exportMovements', async (_event, content: string, defaultName: string) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Exportar movimientos a Excel',
      defaultPath: defaultName,
      filters: [{ name: 'CSV (Excel)', extensions: ['csv'] }],
    })

    if (canceled || !filePath) return { success: false, canceled: true }

    try {
      // BOM inicial para que Excel interprete el archivo como UTF-8 (acentos, símbolo $).
      fs.writeFileSync(filePath, String.fromCharCode(0xfeff) + content, 'utf-8')
      return { success: true, filePath }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
