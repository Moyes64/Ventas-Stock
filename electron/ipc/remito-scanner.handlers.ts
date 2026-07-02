import { ipcMain, dialog, app } from 'electron'
import type { Database } from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { scanRemito } from '../modules/remito-scanner/service'
import { RemitoMappingsRepository } from '../modules/remito-scanner/mappings'

export function registerRemitoScannerHandlers(db: Database): void {
  const mappingsRepo = new RemitoMappingsRepository(db)

  // Abrir diálogo para seleccionar imagen del remito
  ipcMain.handle('remitoScanner:selectImage', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Seleccionar imagen del remito',
      filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // Procesar imagen con Claude Vision
  ipcMain.handle('remitoScanner:scan', async (_event, imagePath: string) => {
    const configPath = path.join(app.getPath('userData'), 'system-params.json')
    let apiKey = ''
    try {
      if (fs.existsSync(configPath)) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, string>
        apiKey = raw.anthropicApiKey ?? ''
      }
    } catch { /* sin config */ }
    return scanRemito(imagePath, apiKey)
  })

  // Buscar mappings para una lista de códigos de proveedor
  ipcMain.handle('remitoScanner:getMappings', (_event, supplierCodes: string[]) => {
    const map = mappingsRepo.findBySupplierCodes(supplierCodes)
    // Convertir Map a objeto plano para IPC
    return Object.fromEntries(map.entries())
  })

  // Guardar mappings en lote (al confirmar un remito)
  ipcMain.handle(
    'remitoScanner:saveMappings',
    (_event, mappings: Array<{ supplierCode: string; productId: number }>) => {
      mappingsRepo.upsertBatch(mappings)
    }
  )

  // Listar todos los mappings guardados (para pantalla de gestión)
  ipcMain.handle('remitoScanner:listMappings', () => {
    return mappingsRepo.listAll()
  })

  // Eliminar un mapping
  ipcMain.handle('remitoScanner:deleteMapping', (_event, supplierCode: string) => {
    mappingsRepo.delete(supplierCode)
  })
}
