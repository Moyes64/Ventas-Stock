import type { Database } from 'better-sqlite3'
import { ProductRepository } from './repository'
import { StockRepository } from '../stock/repository'
import type { Product, Category, TaxRate, CreateProductInput, UpdateProductInput } from './types'

export class ProductService {
  private readonly repo: ProductRepository
  private readonly stockRepo: StockRepository

  constructor(db: Database) {
    this.repo = new ProductRepository(db)
    this.stockRepo = new StockRepository(db)
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
    if (!data.supplierId) throw new Error('El proveedor es obligatorio')
    if (data.price < 0) throw new Error('El precio no puede ser negativo')
    if (data.cost < 0) throw new Error('El costo no puede ser negativo')
    if (data.gainPercent !== undefined && data.gainPercent < 0) {
      throw new Error('La ganancia no puede ser negativa')
    }
    if (data.initialStock !== undefined && data.initialStock < 0) {
      throw new Error('El stock inicial no puede ser negativo')
    }

    const existing = this.repo.findBySku(data.sku)
    if (existing) throw new Error(`Ya existe un producto con SKU: ${data.sku}`)

    if (data.barcode) {
      const byBarcode = this.repo.findByBarcode(data.barcode)
      if (byBarcode) throw new Error(`Ya existe un producto con código de barras: ${data.barcode}`)
    }

    const id = this.repo.create(data)

    if (data.initialStock !== undefined && data.initialStock > 0) {
      this.stockRepo.addMovement({
        productId: id,
        type: 'ENTRY',
        quantity: data.initialStock,
        referenceType: 'MANUAL',
        notes: 'Stock inicial',
      })
    }

    const created = this.repo.findById(id)
    if (!created) throw new Error('Error al recuperar el producto creado')
    return created
  }

  update(id: number, data: UpdateProductInput): Product {
    const existing = this.repo.findById(id)
    if (!existing) throw new Error(`Producto no encontrado: ${id}`)
    this.repo.update(id, data)
    const updated = this.repo.findById(id)
    if (!updated) throw new Error(`Producto no encontrado: ${id}`)
    return updated
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
