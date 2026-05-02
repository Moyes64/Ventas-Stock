export type MovementType = 'ENTRY' | 'EXIT' | 'ADJUSTMENT' | 'SALE' | 'PURCHASE_RETURN'

export interface StockMovement {
  id: number
  productId: number
  productName?: string
  type: MovementType
  /** Positive = entry, Negative = exit */
  quantity: number
  referenceType: string | null
  referenceId: number | null
  notes: string
  userId: number | null
  createdAt: string
  voucherType: string | null
  voucherNumber: string | null
  voucherDate: string | null
  supplierId: number | null
  supplierName: string | null
}

export interface StockItem {
  productId: number
  productName: string
  sku: string
  barcode: string | null
  currentStock: number
  stockMin: number
  isLow: boolean
}

export interface CreateMovementInput {
  productId: number
  type: MovementType
  quantity: number
  referenceType?: string
  referenceId?: number
  notes?: string
  userId?: number
  voucherType?: string
  voucherNumber?: string
  voucherDate?: string
  supplierId?: number
}
