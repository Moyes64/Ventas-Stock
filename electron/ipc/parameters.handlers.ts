import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { ParameterService } from '../modules/parameters/service'
import type { CreateParameterInput, UpdateParameterInput } from '../modules/parameters/types'

export function registerParameterHandlers(db: Database): void {
  const parameterService = new ParameterService(db)

  ipcMain.handle('parameters:list', () => {
    return parameterService.list()
  })

  ipcMain.handle('parameters:get', (_event, id: number) => {
    return parameterService.getById(id)
  })

  ipcMain.handle('parameters:create', (_event, data: CreateParameterInput) => {
    return parameterService.create(data)
  })

  ipcMain.handle('parameters:update', (_event, id: number, data: UpdateParameterInput) => {
    return parameterService.update(id, data)
  })

  ipcMain.handle('parameters:delete', (_event, id: number) => {
    return parameterService.delete(id)
  })
}
