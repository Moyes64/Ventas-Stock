import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { SupplierService } from '../modules/suppliers/service'
import type { CreateSupplierInput, UpdateSupplierInput } from '../modules/suppliers/types'

export function registerSupplierHandlers(db: Database): void {
  const supplierService = new SupplierService(db)

  ipcMain.handle('suppliers:list', (_event, activeOnly?: boolean) => {
    return supplierService.list(activeOnly)
  })

  ipcMain.handle('suppliers:search', (_event, query: string) => {
    return supplierService.search(query)
  })

  ipcMain.handle('suppliers:get', (_event, id: number) => {
    return supplierService.getById(id)
  })

  ipcMain.handle('suppliers:create', (_event, data: CreateSupplierInput) => {
    return supplierService.create(data)
  })

  ipcMain.handle('suppliers:update', (_event, id: number, data: UpdateSupplierInput) => {
    return supplierService.update(id, data)
  })

  ipcMain.handle('suppliers:delete', (_event, id: number) => {
    return supplierService.delete(id)
  })
}
