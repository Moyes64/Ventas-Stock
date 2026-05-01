import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { AuthService } from '../modules/auth/service'

export function registerAuthHandlers(db: Database): void {
  const authService = new AuthService(db)

  ipcMain.handle('auth:login', (_event, username: string, password: string) => {
    return authService.login({ username, password })
  })

  ipcMain.handle('auth:listUsers', () => {
    return authService.listUsers()
  })

  ipcMain.handle('auth:createUser', (_event, data: Parameters<AuthService['createUser']>[0]) => {
    return authService.createUser(data)
  })

  ipcMain.handle('auth:updateUser', (_event, id: number, data: Parameters<AuthService['updateUser']>[1]) => {
    return authService.updateUser(id, data)
  })

  ipcMain.handle('auth:deleteUser', (_event, id: number) => {
    return authService.deleteUser(id)
  })

  ipcMain.handle('auth:listRoles', () => {
    return authService.listRoles()
  })
}
