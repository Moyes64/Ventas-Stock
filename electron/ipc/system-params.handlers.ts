import { ipcMain, dialog } from 'electron'
import fs from 'fs'
import type { Database } from 'better-sqlite3'
import { SystemParamsService } from '../modules/system-params/service'
import type { SystemParams } from '../modules/system-params/types'

export function registerSystemParamsHandlers(db: Database): void {
  const service = new SystemParamsService()

  ipcMain.handle('systemParams:get', () => {
    return service.get()
  })

  ipcMain.handle('systemParams:save', (_event, params: SystemParams) => {
    service.save(params)
  })

  // ── Pedido de reposición: productos por proveedor ─────────────────────────
  ipcMain.handle('pedido:getSupplierProducts', (_event, supplierId: number) => {
    const rows = db
      .prepare(
        `SELECT p.id, p.name, p.sku, p.supplier_code, p.stock_quantity, p.stock_min, p.cost,
                s.name AS supplier_name
         FROM products p
         JOIN suppliers s ON s.id = p.supplier_id
         WHERE p.supplier_id = ? AND p.active = 1
         ORDER BY p.name ASC`
      )
      .all(supplierId) as Array<{
        id: number
        name: string
        sku: string
        supplier_code: string
        stock_quantity: number
        stock_min: number
        cost: number
        supplier_name: string
      }>

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      sku: r.sku,
      supplierCode: r.supplier_code,
      stockQuantity: r.stock_quantity,
      stockMin: r.stock_min,
      cost: r.cost,
      supplierName: r.supplier_name,
      isLow: r.stock_min > 0 && r.stock_quantity <= r.stock_min,
    }))
  })

  // ── Pedido de reposición: guardar archivo de texto ────────────────────────
  ipcMain.handle('pedido:saveFile', async (_event, content: string, defaultName: string) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Guardar Pedido de Reposición',
      defaultPath: defaultName,
      filters: [{ name: 'Archivo de texto', extensions: ['txt'] }],
    })

    if (canceled || !filePath) return { success: false, canceled: true }

    try {
      fs.writeFileSync(filePath, content, 'utf-8')
      return { success: true, filePath }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
