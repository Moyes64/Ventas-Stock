import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { RoleRepository } from '../modules/auth/repository'
import { PUBLIC_CHANNELS, areasForChannel, canAccess } from '../modules/auth/permissions'
import { getCurrentUser } from './auth.handlers'

let installed = false

/**
 * Hace que todo canal IPC registrado de acá en más exija sesión iniciada y,
 * según el canal, acceso a alguna sección (ver permissions.ts). Se instala
 * antes de registrar los handlers. Los permisos del rol se leen en cada
 * llamada, así un cambio en Roles y permisos rige sin volver a iniciar sesión.
 */
export function installAccessControl(db: Database): void {
  if (installed) return
  installed = true
  const roleRepo = new RoleRepository(db)
  const originalHandle = ipcMain.handle.bind(ipcMain)

  ipcMain.handle = (channel, listener) =>
    originalHandle(channel, (event, ...args) => {
      if (!PUBLIC_CHANNELS.has(channel)) {
        const user = getCurrentUser()
        if (!user) throw new Error('Tenés que iniciar sesión')
        const areas = areasForChannel(channel)
        if (areas.length > 0 && !canAccess(user.role.name, roleRepo.getPermissions(user.role.id), areas)) {
          throw new Error('Tu usuario no tiene permiso para esta operación')
        }
      }
      return listener(event, ...args)
    })
}
