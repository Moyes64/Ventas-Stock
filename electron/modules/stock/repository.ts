import type { Database } from 'better-sqlite3'
import type { StockMovement, StockItem, CreateMovementInput, UpdateMovementInput } from './types'

interface MovementRow {
  id: number
  product_id: number
  type: string
  quantity: number
  reference_type: string | null
  reference_id: number | null
  notes: string
  user_id: number | null
  created_at: string
  product_name?: string
  voucher_type: string | null
  voucher_number: string | null
  voucher_date: string | null
  supplier_id: number | null
  supplier_name: string | null
}

export class StockRepository {
  constructor(private readonly db: Database) {}

  getCurrentStock(productId: number): number {
    const row = this.db
      .prepare('SELECT stock_quantity FROM products WHERE id = ?')
      .get(productId) as { stock_quantity: number } | undefined
    return row?.stock_quantity ?? 0
  }

  getStockItems(): StockItem[] {
    const rows = this.db
      .prepare(
        `SELECT p.id AS productId, p.name AS productName, p.sku, p.barcode,
                p.stock_quantity AS currentStock, p.stock_min AS stockMin
         FROM products p
         WHERE p.active = 1
         ORDER BY p.name ASC`
      )
      .all() as {
        productId: number
        productName: string
        sku: string
        barcode: string | null
        currentStock: number
        stockMin: number
      }[]

    return rows.map(r => ({
      ...r,
      isLow: r.stockMin > 0 && r.currentStock <= r.stockMin,
    }))
  }

  addMovement(data: CreateMovementInput): number {
    // Run in transaction: insert movement + update product stock
    const insertMovement = this.db.prepare(
      `INSERT INTO stock_movements
         (product_id, type, quantity, reference_type, reference_id, notes, user_id,
          voucher_type, voucher_number, voucher_date, supplier_id)
       VALUES
         (@productId, @type, @quantity, @referenceType, @referenceId, @notes, @userId,
          @voucherType, @voucherNumber, @voucherDate, @supplierId)`
    )

    const updateStock = this.db.prepare(
      'UPDATE products SET stock_quantity = stock_quantity + @delta WHERE id = @productId'
    )

    const result = this.db.transaction(() => {
      const r = insertMovement.run({
        productId: data.productId,
        type: data.type,
        quantity: data.quantity,
        referenceType: data.referenceType ?? null,
        referenceId: data.referenceId ?? null,
        notes: data.notes ?? '',
        userId: data.userId ?? null,
        voucherType: data.voucherType ?? null,
        voucherNumber: data.voucherNumber ?? null,
        voucherDate: data.voucherDate ?? null,
        supplierId: data.supplierId ?? null,
      })

      // EXIT and SALE are negative stock changes; ENTRY and PURCHASE_RETURN are positive
      const delta =
        data.type === 'EXIT' || data.type === 'SALE' ? -Math.abs(data.quantity) : Math.abs(data.quantity)

      updateStock.run({ delta, productId: data.productId })
      return r.lastInsertRowid as number
    })()

    return result
  }

  adjustStockAbsolute(productId: number, newQuantity: number, userId?: number): number {
    const current = this.getCurrentStock(productId)
    const delta = newQuantity - current

    const insertMovement = this.db.prepare(
      `INSERT INTO stock_movements
         (product_id, type, quantity, reference_type, reference_id, notes, user_id)
       VALUES
         (@productId, 'ADJUSTMENT', @quantity, NULL, NULL, @notes, @userId)`
    )

    const updateStock = this.db.prepare(
      'UPDATE products SET stock_quantity = @newQuantity WHERE id = @productId'
    )

    const result = this.db.transaction(() => {
      const r = insertMovement.run({
        productId,
        quantity: delta,
        notes: `Ajuste manual: ${current} → ${newQuantity}`,
        userId: userId ?? null,
      })
      updateStock.run({ newQuantity, productId })
      return r.lastInsertRowid as number
    })()

    return result
  }

  getMovements(filters: {
    productId?: number
    dateFrom?: string
    dateTo?: string
    limit?: number
  }): StockMovement[] {
    const conditions: string[] = []
    const params: Record<string, unknown> = {}

    if (filters.productId) {
      conditions.push('sm.product_id = @productId')
      params.productId = filters.productId
    }
    if (filters.dateFrom) {
      conditions.push('sm.created_at >= @dateFrom')
      params.dateFrom = filters.dateFrom
    }
    if (filters.dateTo) {
      conditions.push('sm.created_at <= @dateTo')
      params.dateTo = filters.dateTo + ' 23:59:59'
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = filters.limit ?? 200

    const rows = this.db
      .prepare(
        `SELECT sm.*, p.name AS product_name,
                s.name AS supplier_name
         FROM stock_movements sm
         JOIN products p ON p.id = sm.product_id
         LEFT JOIN suppliers s ON s.id = sm.supplier_id
         ${where}
         ORDER BY sm.created_at DESC
         LIMIT ${limit}`
      )
      .all(params) as MovementRow[]

    return rows.map(r => ({
      id: r.id,
      productId: r.product_id,
      productName: r.product_name,
      type: r.type as StockMovement['type'],
      quantity: r.quantity,
      referenceType: r.reference_type,
      referenceId: r.reference_id,
      notes: r.notes,
      userId: r.user_id,
      createdAt: r.created_at,
      voucherType: r.voucher_type,
      voucherNumber: r.voucher_number,
      voucherDate: r.voucher_date,
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
    }))
  }

  /**
   * Returns the signed stock delta that was applied when the movement was recorded.
   * - EXIT / SALE: stock was decreased  → delta = -abs(quantity)
   * - ADJUSTMENT: quantity IS the signed delta (may be negative)
   * - ENTRY / PURCHASE_RETURN: stock was increased → delta = +abs(quantity)
   */
  private movementEffectiveDelta(type: string, quantity: number): number {
    if (type === 'EXIT' || type === 'SALE') return -Math.abs(quantity)
    if (type === 'ADJUSTMENT') return quantity
    return Math.abs(quantity)
  }

  updateMovement(id: number, data: UpdateMovementInput): void {
    const existing = this.db
      .prepare(
        `SELECT sm.*, p.name AS product_name, s.name AS supplier_name
         FROM stock_movements sm
         JOIN products p ON p.id = sm.product_id
         LEFT JOIN suppliers s ON s.id = sm.supplier_id
         WHERE sm.id = ?`
      )
      .get(id) as MovementRow | undefined

    if (!existing) throw new Error(`Movimiento #${id} no encontrado`)

    const newQuantity = data.quantity ?? existing.quantity

    const oldDelta = this.movementEffectiveDelta(existing.type, existing.quantity)
    const newDelta = this.movementEffectiveDelta(existing.type, newQuantity)
    const stockAdjustment = newDelta - oldDelta

    const currentStock = this.getCurrentStock(existing.product_id)
    if (currentStock + stockAdjustment < 0) {
      throw new Error(
        `El cambio dejaría el stock en negativo (stock actual: ${currentStock}, ajuste: ${stockAdjustment > 0 ? '+' : ''}${stockAdjustment})`
      )
    }

    const updateMovement = this.db.prepare(
      `UPDATE stock_movements
         SET quantity       = @quantity,
             voucher_type   = @voucherType,
             voucher_number = @voucherNumber,
             voucher_date   = @voucherDate,
             supplier_id    = @supplierId,
             notes          = @notes
       WHERE id = @id`
    )

    const updateStock = this.db.prepare(
      'UPDATE products SET stock_quantity = stock_quantity + @delta WHERE id = @productId'
    )

    this.db.transaction(() => {
      updateMovement.run({
        id,
        quantity: newQuantity,
        voucherType: data.voucherType !== undefined ? data.voucherType : existing.voucher_type,
        voucherNumber:
          data.voucherNumber !== undefined ? data.voucherNumber : existing.voucher_number,
        voucherDate: data.voucherDate !== undefined ? data.voucherDate : existing.voucher_date,
        supplierId: data.supplierId !== undefined ? data.supplierId : existing.supplier_id,
        notes: data.notes !== undefined ? data.notes : existing.notes,
      })
      if (stockAdjustment !== 0) {
        updateStock.run({ delta: stockAdjustment, productId: existing.product_id })
      }
    })()
  }

  deleteMovement(id: number): void {
    const existing = this.db
      .prepare('SELECT * FROM stock_movements WHERE id = ?')
      .get(id) as MovementRow | undefined

    if (!existing) throw new Error(`Movimiento #${id} no encontrado`)

    const effectiveDelta = this.movementEffectiveDelta(existing.type, existing.quantity)
    const reverseAdjustment = -effectiveDelta

    const currentStock = this.getCurrentStock(existing.product_id)
    if (currentStock + reverseAdjustment < 0) {
      throw new Error(
        `Eliminar este movimiento dejaría el stock en negativo (stock actual: ${currentStock})`
      )
    }

    const deleteStmt = this.db.prepare('DELETE FROM stock_movements WHERE id = ?')
    const updateStock = this.db.prepare(
      'UPDATE products SET stock_quantity = stock_quantity + @delta WHERE id = @productId'
    )

    this.db.transaction(() => {
      deleteStmt.run(id)
      if (reverseAdjustment !== 0) {
        updateStock.run({ delta: reverseAdjustment, productId: existing.product_id })
      }
    })()
  }
}
