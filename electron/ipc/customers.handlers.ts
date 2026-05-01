import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { CustomerService } from '../modules/customers/service'
import type { CreateCustomerInput, UpdateCustomerInput } from '../modules/customers/types'

export function registerCustomerHandlers(db: Database): void {
  const customerService = new CustomerService(db)

  ipcMain.handle('customers:list', () => {
    return customerService.list()
  })

  ipcMain.handle('customers:search', (_event, query: string) => {
    return customerService.search(query)
  })

  ipcMain.handle('customers:get', (_event, id: number) => {
    return customerService.getById(id)
  })

  ipcMain.handle('customers:create', (_event, data: CreateCustomerInput) => {
    return customerService.create(data)
  })

  ipcMain.handle('customers:update', (_event, id: number, data: UpdateCustomerInput) => {
    return customerService.update(id, data)
  })

  ipcMain.handle('customers:delete', (_event, id: number) => {
    return customerService.delete(id)
  })
}
