import type { Database } from 'better-sqlite3'
import { StockRepository } from './repository'
import type { StockItem, StockMovement, CreateMovementInput, UpdateMovementInput } from './types'

export class StockService {
  private readonly repo: StockRepository

  constructor(db: Database) {
    this.repo = new StockRepository(db)
  }

  getStockItems(): StockItem[] {
    return this.repo.getStockItems()
  }

  getCurrentStock(productId: number): number {
    return this.repo.getCurrentStock(productId)
  }

  getMovements(filters: {
    productId?: number
    dateFrom?: string
    dateTo?: string
    limit?: number
  }): StockMovement[] {
    return this.repo.getMovements(filters)
  }

  /** Validates that all sale items have sufficient stock. Throws if any product is short. */
  validateAvailability(items: Array<{ productId: number; quantity: number }>): void {
    for (const item of items) {
      const current = this.repo.getCurrentStock(item.productId)
      if (current < item.quantity) {
        throw new Error(
          `Stock insuficiente para producto ID ${item.productId}: disponible ${current}, requerido ${item.quantity}`
        )
      }
    }
  }

  /** Registers stock exits for each sold item. */
  registerSaleExit(
    items: Array<{ productId: number; quantity: number }>,
    saleId: number,
    userId?: number
  ): void {
    for (const item of items) {
      this.repo.addMovement({
        productId: item.productId,
        type: 'SALE',
        quantity: item.quantity,
        referenceType: 'SALE',
        referenceId: saleId,
        notes: `Venta #${saleId}`,
        userId,
      })
    }
  }

  addManualMovement(data: CreateMovementInput): number {
    return this.repo.addMovement(data)
  }

  updateMovement(id: number, data: UpdateMovementInput): void {
    if (data.quantity !== undefined && data.quantity <= 0) {
      throw new Error('La cantidad debe ser mayor a cero')
    }
    this.repo.updateMovement(id, data)
  }

  deleteMovement(id: number): void {
    this.repo.deleteMovement(id)
  }

  /**
   * Sets the absolute stock quantity for a product by recording an ADJUSTMENT movement.
   * The movement quantity is the signed delta (positive = added, negative = removed).
   */
  adjustStockAbsolute(productId: number, newQuantity: number, userId?: number): number {
    if (newQuantity < 0) {
      throw new Error('La cantidad de stock no puede ser negativa')
    }
    return this.repo.adjustStockAbsolute(productId, newQuantity, userId)
  }
}
