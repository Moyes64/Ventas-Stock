import type { Database } from 'better-sqlite3'
import type { Product, Category, TaxRate, CreateProductInput, UpdateProductInput } from './types'

interface ProductRow {
  id: number
  sku: string
  barcode: string | null
  name: string
  description: string
  category_id: number | null
  supplier_id: number | null
  supplier_code: string
  price: number
  cost: number
  tax_rate_id: number
  gain_percent: number
  active: number
  stock_quantity: number
  stock_min: number
  created_at: string
  updated_at: string
}

export class ProductRepository {
  constructor(private readonly db: Database) {}

  findById(id: number): Product | undefined {
    const row = this.db
      .prepare('SELECT * FROM products WHERE id = ?')
      .get(id) as ProductRow | undefined
    return row ? this.mapRow(row) : undefined
  }

  findByBarcode(barcode: string): Product | undefined {
    const row = this.db
      .prepare('SELECT * FROM products WHERE barcode = ? AND active = 1')
      .get(barcode) as ProductRow | undefined
    return row ? this.mapRow(row) : undefined
  }

  findBySku(sku: string): Product | undefined {
    const row = this.db
      .prepare('SELECT * FROM products WHERE sku = ?')
      .get(sku) as ProductRow | undefined
    return row ? this.mapRow(row) : undefined
  }

  search(query: string, activeOnly = true): Product[] {
    const like = `%${query}%`
    const activeClause = activeOnly ? 'AND active = 1' : ''
    const rows = this.db
      .prepare(
        `SELECT * FROM products
         WHERE (name LIKE ? OR sku LIKE ? OR barcode LIKE ?) ${activeClause}
         ORDER BY name ASC
         LIMIT 100`
      )
      .all(like, like, like) as ProductRow[]
    return rows.map(r => this.mapRow(r))
  }

  list(activeOnly = true): Product[] {
    const activeClause = activeOnly ? 'WHERE active = 1' : ''
    const rows = this.db
      .prepare(`SELECT * FROM products ${activeClause} ORDER BY name ASC`)
      .all() as ProductRow[]
    return rows.map(r => this.mapRow(r))
  }

  listLowStock(): Product[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM products
         WHERE active = 1 AND stock_quantity <= stock_min AND stock_min > 0
         ORDER BY stock_quantity ASC`
      )
      .all() as ProductRow[]
    return rows.map(r => this.mapRow(r))
  }

  create(data: CreateProductInput): number {
    const result = this.db
      .prepare(
        `INSERT INTO products
           (sku, barcode, name, description, category_id, supplier_id, supplier_code,
            price, cost, tax_rate_id, gain_percent, stock_min)
         VALUES
           (@sku, @barcode, @name, @description, @categoryId, @supplierId, @supplierCode,
            @price, @cost, @taxRateId, @gainPercent, @stockMin)`
      )
      .run({
        sku: data.sku,
        barcode: data.barcode ?? null,
        name: data.name,
        description: data.description ?? '',
        categoryId: data.categoryId ?? null,
        supplierId: data.supplierId ?? null,
        supplierCode: data.supplierCode ?? '',
        price: data.price,
        cost: data.cost,
        taxRateId: data.taxRateId,
        gainPercent: data.gainPercent ?? 0,
        stockMin: data.stockMin ?? 0,
      })
    return result.lastInsertRowid as number
  }

  update(id: number, data: UpdateProductInput): void {
    const fields: string[] = ["updated_at = datetime('now')"]
    const params: Record<string, unknown> = { id }

    if (data.sku !== undefined) { fields.push('sku = @sku'); params.sku = data.sku }
    if (data.barcode !== undefined) { fields.push('barcode = @barcode'); params.barcode = data.barcode }
    if (data.name !== undefined) { fields.push('name = @name'); params.name = data.name }
    if (data.description !== undefined) { fields.push('description = @description'); params.description = data.description }
    if (data.categoryId !== undefined) { fields.push('category_id = @categoryId'); params.categoryId = data.categoryId }
    if (data.supplierId !== undefined) { fields.push('supplier_id = @supplierId'); params.supplierId = data.supplierId }
    if (data.supplierCode !== undefined) { fields.push('supplier_code = @supplierCode'); params.supplierCode = data.supplierCode }
    if (data.price !== undefined) { fields.push('price = @price'); params.price = data.price }
    if (data.cost !== undefined) { fields.push('cost = @cost'); params.cost = data.cost }
    if (data.taxRateId !== undefined) { fields.push('tax_rate_id = @taxRateId'); params.taxRateId = data.taxRateId }
    if (data.gainPercent !== undefined) { fields.push('gain_percent = @gainPercent'); params.gainPercent = data.gainPercent }
    if (data.active !== undefined) { fields.push('active = @active'); params.active = data.active ? 1 : 0 }
    if (data.stockMin !== undefined) { fields.push('stock_min = @stockMin'); params.stockMin = data.stockMin }
    if (data.stockQuantity !== undefined) { fields.push('stock_quantity = @stockQuantity'); params.stockQuantity = data.stockQuantity }

    this.db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = @id`).run(params)
  }

  delete(id: number): void {
    this.db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(id)
  }

  getTaxRates(): TaxRate[] {
    return this.db.prepare('SELECT * FROM tax_rates ORDER BY percentage ASC').all() as TaxRate[]
  }

  getCategories(): Category[] {
    return this.db
      .prepare('SELECT * FROM categories ORDER BY name ASC')
      .all() as Category[]
  }

  private mapRow(row: ProductRow): Product {
    return {
      id: row.id,
      sku: row.sku,
      barcode: row.barcode,
      name: row.name,
      description: row.description,
      categoryId: row.category_id,
      supplierId: row.supplier_id,
      supplierCode: row.supplier_code,
      price: row.price,
      cost: row.cost,
      taxRateId: row.tax_rate_id,
      gainPercent: row.gain_percent,
      active: row.active === 1,
      stockQuantity: row.stock_quantity,
      stockMin: row.stock_min,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
