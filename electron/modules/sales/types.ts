export type SaleStatus = 'PENDING_CAE' | 'AUTHORIZED' | 'REJECTED' | 'INTERNAL_RECEIPT'

export interface SaleItem {
  id?: number
  saleId?: number
  productId: number
  productName?: string
  quantity: number
  unitPrice: number   // With IVA
  taxRate: number     // % IVA
  subtotal: number    // quantity * unitPrice
}

export interface Sale {
  id: number
  customerId: number | null
  customerName?: string
  userId: number | null
  status: SaleStatus
  subtotal: number     // Without IVA
  taxAmount: number    // Total IVA
  total: number        // With IVA
  saleDate: string
  invoiceType: number | null
  invoiceNumber: number | null
  puntoVenta: number | null
  cae: string | null
  caeVto: string | null
  afipError: string | null
  isBlackSale: boolean // Venta en negro (sin IVA / comprobante interno siempre)
  createdAt: string
  updatedAt: string
  items?: SaleItem[]
}

export interface CreateSaleInput {
  customerId?: number
  userId?: number
  invoiceType?: number
  isBlackSale?: boolean
  items: Array<{
    productId: number
    quantity: number
    unitPrice: number
    taxRate: number
  }>
}
