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
  price: number        // Precio de venta con IVA
  cost: number         // Costo sin IVA
  taxRateId: number
  taxRate?: TaxRate
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
  price: number
  cost: number
  taxRateId: number
  stockMin?: number
}

export interface UpdateProductInput extends Partial<CreateProductInput> {
  active?: boolean
  stockQuantity?: number
}
