import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { AuthService } from '../modules/auth/service'
import type { AuthenticatedUser, LoginResult } from '../modules/auth/types'

/**
 * Sesión de la app: vive en el proceso principal (no en la pantalla), así
 * sobrevive a recargar la ventana y otros módulos pueden saber quién opera.
 */
let currentUser: AuthenticatedUser | null = null

export function getCurrentUser(): AuthenticatedUser | null {
  return currentUser
}

function startSession(result: LoginResult): LoginResult {
  if (result.success && result.user) currentUser = result.user
  return result
}

export function registerAuthHandlers(db: Database): void {
  const authService = new AuthService(db)

  ipcMain.handle('auth:login', (_event, username: string, password: string) => {
    return startSession(authService.login({ username, password }))
  })

  ipcMain.handle('auth:logout', () => {
    currentUser = null
  })

  ipcMain.handle('auth:currentUser', () => {
    return currentUser
  })

  ipcMain.handle('auth:needsSetup', () => {
    return authService.needsSetup()
  })

  ipcMain.handle('auth:setupFirstAdmin', (_event, data: Parameters<AuthService['setupFirstAdmin']>[0]) => {
    return startSession(authService.setupFirstAdmin(data))
  })

  ipcMain.handle('auth:listUsers', () => {
    return authService.listUsers()
  })

  ipcMain.handle('auth:createUser', (_event, data: Parameters<AuthService['createUser']>[0]) => {
    return authService.createUser(data)
  })

  ipcMain.handle('auth:updateUser', (_event, id: number, data: Parameters<AuthService['updateUser']>[1]) => {
    authService.updateUser(id, data)
    // Si el usuario de la sesión quedó inactivo, la sesión se cierra.
    if (currentUser?.id === id && data.active === false) currentUser = null
  })

  ipcMain.handle('auth:deleteUser', (_event, id: number) => {
    return authService.deleteUser(id, currentUser?.id)
  })

  ipcMain.handle('auth:listRoles', () => {
    return authService.listRoles()
  })
}
