import type { Database } from 'better-sqlite3'
import { ProductRepository } from './repository'
import type { Product, Category, TaxRate, CreateProductInput, UpdateProductInput } from './types'

export class ProductService {
  private readonly repo: ProductRepository

  constructor(db: Database) {
    this.repo = new ProductRepository(db)
  }

  getById(id: number): Product | undefined {
    return this.repo.findById(id)
  }

  getByBarcode(barcode: string): Product | undefined {
    return this.repo.findByBarcode(barcode)
  }

  search(query: string): Product[] {
    return this.repo.search(query)
  }

  list(activeOnly = true): Product[] {
    return this.repo.list(activeOnly)
  }

  listLowStock(): Product[] {
    return this.repo.listLowStock()
  }

  create(data: CreateProductInput): Product {
    if (!data.sku.trim()) throw new Error('El SKU es obligatorio')
    if (!data.name.trim()) throw new Error('El nombre es obligatorio')
    if (data.price < 0) throw new Error('El precio no puede ser negativo')

    const existing = this.repo.findBySku(data.sku)
    if (existing) throw new Error(`Ya existe un producto con SKU: ${data.sku}`)

    if (data.barcode) {
      const byBarcode = this.repo.findByBarcode(data.barcode)
      if (byBarcode) throw new Error(`Ya existe un producto con código de barras: ${data.barcode}`)
    }

    const id = this.repo.create(data)
    return this.repo.findById(id)!
  }

  update(id: number, data: UpdateProductInput): Product {
    const existing = this.repo.findById(id)
    if (!existing) throw new Error(`Producto no encontrado: ${id}`)
    this.repo.update(id, data)
    return this.repo.findById(id)!
  }

  delete(id: number): void {
    const existing = this.repo.findById(id)
    if (!existing) throw new Error(`Producto no encontrado: ${id}`)
    this.repo.delete(id)
  }

  getTaxRates(): TaxRate[] {
    return this.repo.getTaxRates()
  }

  getCategories(): Category[] {
    return this.repo.getCategories()
  }
}
