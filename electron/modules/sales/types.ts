export type SaleStatus =
  | 'PENDING_CAE'
  | 'AUTHORIZED'
  | 'REJECTED'
  | 'INTERNAL_RECEIPT'
  | 'WEB_ORDER'
  | 'PROCESSED'
  | 'CANCELLED'
export type PaymentMethod =
  | 'contado_efectivo'
  | 'transferencia'
  | 'debito'
  | 'credito'
  | 'credito_cliente'
  | 'WEB_ORDER'
  | 'mercadopago'
  | 'qr'
  | 'mixto'

export interface SalePayment {
  id: number
  saleId: number
  paymentMethod: PaymentMethod
  amount: number
  createdAt: string
}

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

export interface AppliedParameter {
  id?: number         // sale_parameters row id
  parameterId?: number | null
  descripcion: string
  porcentaje: number
  tipo: '+' | '-'
}

export interface Sale {
  id: number
  customerId: number | null
  customerName?: string
  userId: number | null
  status: SaleStatus
  subtotal: number        // Adjusted subtotal without IVA (after parameters)
  taxAmount: number       // IVA on adjusted subtotal
  total: number           // subtotal + taxAmount
  discountAmount: number  // Net reduction in subtotal (positive = money saved)
  otherChargesAmount: number  // Envío / recargo tarjeta (ventas web) — ya incluido en `total`, 0 en ventas de mostrador
  otherChargesLabel: string   // Ej: "Envío a domicilio + Recargo tarjeta de crédito (10%)" — '' si otherChargesAmount es 0
  paymentMethod: PaymentMethod
  saleDate: string
  invoiceType: number | null
  invoiceNumber: number | null
  puntoVenta: number | null
  cae: string | null
  caeVto: string | null
  afipError: string | null
  isBlackSale: boolean    // Venta en negro (comprobante interno, sin CAE)
  createdAt: string
  updatedAt: string
  items?: SaleItem[]
  appliedParameters?: AppliedParameter[]
  payments?: SalePayment[]
}

export interface CreateSaleInput {
  customerId?: number
  userId?: number
  invoiceType?: number
  isBlackSale?: boolean
  paymentMethod?: PaymentMethod
  /** Pago combinado: 2 piernas (medio + monto) cuyo total debe sumar el total
   *  de la venta. Cuando viene presente, tiene prioridad sobre `paymentMethod`
   *  -- `sales.payment_method` queda en 'mixto' y el detalle real vive acá. */
  payments?: Array<{
    paymentMethod: PaymentMethod
    amount: number
  }>
  parameterIds?: number[]
  items: Array<{
    productId: number
    quantity: number
    unitPrice: number
    taxRate: number
  }>
}
