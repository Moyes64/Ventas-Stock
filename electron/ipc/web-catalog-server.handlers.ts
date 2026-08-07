import { ipcMain } from 'electron'
import { WebCatalogServerService } from '../modules/web-catalog-server/service'
import type { WebCatalogService } from '../modules/web-catalog/service'

/**
 * Devuelve la instancia (única) del servicio para que main.ts pueda llamar
 * autoStartIfEnabled() sobre EXACTAMENTE este objeto — mismo motivo que
 * stock-count.handlers.ts (el `http.Server` vive como estado en memoria de
 * la instancia que lo arrancó).
 */
export function registerWebCatalogServerHandlers(webCatalogService: WebCatalogService): WebCatalogServerService {
  const webCatalogServerService = new WebCatalogServerService(webCatalogService)

  ipcMain.handle('webCatalogServer:getStatus', () => {
    return webCatalogServerService.getServerStatus()
  })

  ipcMain.handle('webCatalogServer:setEnabled', (_event, enabled: boolean) => {
    return webCatalogServerService.setEnabled(enabled)
  })

  ipcMain.handle('webCatalogServer:regenerateToken', () => {
    return webCatalogServerService.regenerateToken()
  })

  ipcMain.handle('webCatalogServer:getPairingInfo', () => {
    return webCatalogServerService.getPairingInfo()
  })

  return webCatalogServerService
}
