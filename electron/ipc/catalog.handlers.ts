import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { ProductService } from '../modules/catalog/service'
import type { CreateProductInput, UpdateProductInput } from '../modules/catalog/types'

export function registerCatalogHandlers(db: Database): void {
  const productService = new ProductService(db)

  ipcMain.handle('catalog:listProducts', (_event, activeOnly?: boolean) => {
    return productService.list(activeOnly)
  })

  ipcMain.handle('catalog:searchProducts', (_event, query: string) => {
    return productService.search(query)
  })

  ipcMain.handle('catalog:getProduct', (_event, id: number) => {
    return productService.getById(id)
  })

  ipcMain.handle('catalog:getByBarcode', (_event, barcode: string) => {
    return productService.getByBarcode(barcode)
  })

  ipcMain.handle('catalog:createProduct', (_event, data: CreateProductInput) => {
    return productService.create(data)
  })

  ipcMain.handle('catalog:updateProduct', (_event, id: number, data: UpdateProductInput) => {
    return productService.update(id, data)
  })

  ipcMain.handle('catalog:deleteProduct', (_event, id: number) => {
    return productService.delete(id)
  })

  ipcMain.handle('catalog:getTaxRates', () => {
    return productService.getTaxRates()
  })

  ipcMain.handle('catalog:getCategories', () => {
    return productService.getCategories()
  })

  ipcMain.handle('catalog:listLowStock', () => {
    return productService.listLowStock()
  })
}
