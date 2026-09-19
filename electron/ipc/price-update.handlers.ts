import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import type { Database } from 'better-sqlite3'
import { parsePriceExcel } from '../modules/price-update/parser'
import { ProductRepository } from '../modules/catalog/repository'

/** Ítem listo para aplicar: precio nuevo ya validado/redondeado por el usuario */
export interface PriceUpdateItem {
  productId: number
  cost: number           // Nuevo costo (= precio del excel, sin IVA)
  price: number          // Nuevo precio de venta (con IVA), posiblemente redondeado a mano
  gainPercent: number    // % de ganancia recalculado a partir del precio final
  /** Si vino de un match manual y se corrigió el código de proveedor guardado */
  supplierCode?: string
}

export function registerPriceUpdateHandlers(db: Database): void {
  const productRepo = new ProductRepository(db)

  // Abrir diálogo para seleccionar la planilla de precios del proveedor
  ipcMain.handle('priceUpdate:selectExcel', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Seleccionar planilla de precios del proveedor',
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // Parsear la planilla: SKU | Código de barras | Descripción | Precio
  ipcMain.handle('priceUpdate:parseExcel', (_event, filePath: string) => {
    return parsePriceExcel(filePath)
  })

  // Aplicar en bloque los precios verificados por el usuario
  ipcMain.handle('priceUpdate:applyUpdates', (_event, updates: PriceUpdateItem[]) => {
    const applyAll = db.transaction((items: PriceUpdateItem[]) => {
      for (const item of items) {
        productRepo.update(item.productId, {
          cost: item.cost,
          price: item.price,
          gainPercent: item.gainPercent,
          ...(item.supplierCode !== undefined ? { supplierCode: item.supplierCode } : {}),
        })
      }
    })
    applyAll(updates)
    return { updated: updates.length }
  })

  // Exportar la comparación en pantalla a un archivo CSV que se abre con Excel
  ipcMain.handle('priceUpdate:exportCsv', async (_event, content: string, defaultName: string) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Exportar comparación de precios a Excel',
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
