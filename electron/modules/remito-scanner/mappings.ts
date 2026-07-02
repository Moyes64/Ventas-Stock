import type { Database } from 'better-sqlite3'

export interface RemitoMapping {
  supplierCode: string
  productId: number
  productName: string
}

export class RemitoMappingsRepository {
  constructor(private readonly db: Database) {}

  /** Busca todos los mappings para una lista de códigos de proveedor */
  findBySupplierCodes(codes: string[]): Map<string, { productId: number; productName: string }> {
    if (codes.length === 0) return new Map()
    const placeholders = codes.map(() => '?').join(',')
    const rows = this.db
      .prepare(
        `SELECT rm.supplier_code, rm.product_id, p.name AS product_name
         FROM remito_product_mappings rm
         JOIN products p ON p.id = rm.product_id
         WHERE rm.supplier_code IN (${placeholders})`
      )
      .all(...codes) as Array<{ supplier_code: string; product_id: number; product_name: string }>

    const map = new Map<string, { productId: number; productName: string }>()
    for (const r of rows) {
      map.set(r.supplier_code, { productId: r.product_id, productName: r.product_name })
    }
    return map
  }

  /** Guarda o actualiza un mapping */
  upsert(supplierCode: string, productId: number): void {
    this.db
      .prepare(
        `INSERT INTO remito_product_mappings (supplier_code, product_id)
         VALUES (?, ?)
         ON CONFLICT(supplier_code) DO UPDATE SET product_id = excluded.product_id`
      )
      .run(supplierCode, productId)
  }

  /** Guarda múltiples mappings en una transacción */
  upsertBatch(mappings: Array<{ supplierCode: string; productId: number }>): void {
    const stmt = this.db.prepare(
      `INSERT INTO remito_product_mappings (supplier_code, product_id)
       VALUES (?, ?)
       ON CONFLICT(supplier_code) DO UPDATE SET product_id = excluded.product_id`
    )
    const tx = this.db.transaction(() => {
      for (const m of mappings) {
        stmt.run(m.supplierCode, m.productId)
      }
    })
    tx()
  }

  listAll(): RemitoMapping[] {
    return this.db
      .prepare(
        `SELECT rm.supplier_code AS supplierCode, rm.product_id AS productId, p.name AS productName
         FROM remito_product_mappings rm
         JOIN products p ON p.id = rm.product_id
         ORDER BY rm.supplier_code ASC`
      )
      .all() as RemitoMapping[]
  }

  delete(supplierCode: string): void {
    this.db.prepare('DELETE FROM remito_product_mappings WHERE supplier_code = ?').run(supplierCode)
  }
}
