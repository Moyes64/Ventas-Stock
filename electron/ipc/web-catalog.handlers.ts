import { ipcMain, dialog, app } from 'electron'
import path from 'path'
import fs from 'fs'
import type { Database } from 'better-sqlite3'
import { WebCatalogService } from '../modules/web-catalog/service'
import type { SaveWebProductInput, SaveWebCategoryInput } from '../modules/web-catalog/types'

export function registerWebCatalogHandlers(db: Database): WebCatalogService {
  const svc = new WebCatalogService(db)

  // ── Categorías ────────────────────────────────────────────────────────────
  ipcMain.handle('webCatalog:listCategories', () => svc.listCategories())

  ipcMain.handle('webCatalog:saveCategory', (_e, id: number | null, input: SaveWebCategoryInput) =>
    svc.saveCategory(id, input))

  ipcMain.handle('webCatalog:deleteCategory', (_e, id: number) => svc.deleteCategory(id))

  // ── Productos ─────────────────────────────────────────────────────────────
  ipcMain.handle('webCatalog:listProducts', () => svc.listWebProducts())

  ipcMain.handle('webCatalog:getProduct', (_e, productId: number) => svc.getWebProduct(productId))

  ipcMain.handle('webCatalog:saveProduct', (_e, input: SaveWebProductInput) => svc.saveWebProduct(input))

  ipcMain.handle('webCatalog:listUnpublished', () => svc.listUnpublishedProducts())

  ipcMain.handle('webCatalog:getNextSortOrder', (_e, webCategoryId: number | null) =>
    svc.getNextSortOrder(webCategoryId))

  ipcMain.handle('webCatalog:getNextFeaturedOrder', () => svc.getNextFeaturedOrder())

  // ── Imágenes ──────────────────────────────────────────────────────────────
  ipcMain.handle('webCatalog:uploadImage', async (_e, productId: number, sortOrder: number) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Seleccionar imagen',
      filters: [{ name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths[0]) return { success: false }
    try {
      const image = svc.saveImage(productId, filePaths[0], sortOrder)
      return { success: true, image }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('webCatalog:deleteImage', (_e, imageId: number) => {
    svc.deleteImage(imageId)
    return { success: true }
  })

  ipcMain.handle('webCatalog:reorderImages', (_e, productId: number, orderedIds: number[]) => {
    svc.reorderImages(productId, orderedIds)
    return { success: true }
  })

  // Devuelve la imagen como data URL para mostrarla en el renderer
  ipcMain.handle('webCatalog:getImageDataUrl', (_e, filename: string) => {
    try {
      const filePath = svc.getImagePath(filename)
      if (!fs.existsSync(filePath)) return null
      const ext = path.extname(filename).toLowerCase().replace('.', '') || 'jpeg'
      const mime = ext === 'jpg' ? 'jpeg' : ext
      const data = fs.readFileSync(filePath).toString('base64')
      return `data:image/${mime};base64,${data}`
    } catch {
      return null
    }
  })

  // Devuelve el directorio de imágenes para que el sync pueda leerlas
  ipcMain.handle('webCatalog:getImagesDir', () =>
    path.join(app.getPath('userData'), 'web-images'))

  return svc
}
