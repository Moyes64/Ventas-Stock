export interface TaxRate {
  id: number
  name: string
  percentage: number
  afipCode: number
}

export interface Category {
  id: number
  name: string
  description: string
  createdAt: string
}

export interface Product {
  id: number
  sku: string
  barcode: string | null
  name: string
  description: string
  categoryId: number | null
  category?: Category
  supplierId: number | null
  supplierCode: string
  price: number        // Precio de venta con IVA
  cost: number         // Costo sin IVA
  taxRateId: number
  taxRate?: TaxRate
  gainPercent: number  // Porcentaje de ganancia
  active: boolean
  stockQuantity: number
  stockMin: number
  createdAt: string
  updatedAt: string
}

export interface CreateProductInput {
  sku: string
  barcode?: string
  name: string
  description?: string
  categoryId?: number
  supplierId?: number
  supplierCode?: string
  price: number
  cost: number
  taxRateId: number
  gainPercent?: number
  stockMin?: number
  /** Stock inicial: genera un movimiento ENTRY al crear el producto */
  initialStock?: number
}

export interface UpdateProductInput extends Partial<CreateProductInput> {
  active?: boolean
  stockQuantity?: number
}
