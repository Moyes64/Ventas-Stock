export interface TicketLine {
  text: string
  bold?: boolean
  center?: boolean
  right?: boolean
  separator?: boolean
}

export interface DiscountLine {
  descripcion: string
  porcentaje: number
  amount: number   // Absolute amount discounted (always positive)
}

export interface TicketData {
  // Header
  companyName: string
  companyCuit: string
  companyAddress: string
  condicionIva: string
  puntoVenta: number
  // Invoice info
  invoiceType: string   // 'FACTURA C', 'FACTURA A', etc.
  invoiceNumber: string // '00001-00000001'
  date: string
  // Customer
  customerName: string
  customerDocType: string
  customerDoc: string
  customerCondicionIva: string
  // Items
  items: Array<{
    name: string
    quantity: number
    unitPrice: number
    subtotal: number
    taxRate: number
  }>
  // Totals
  grossSubtotal: number      // Sum of items with IVA, before parameters
  discountLines: DiscountLine[] // Only tipo='-' parameters (for invoice display)
  subtotal: number           // Adjusted subtotal without IVA (after all parameters; not displayed)
  taxAmount: number
  total: number
  // CAE
  cae?: string
  caeVto?: string
  qrBase64?: string
  // Status
  isAuthorized: boolean
  internalReceiptNumber?: number
}

export interface PrintJob {
  id: string
  type: 'TICKET' | 'REPORT'
  data: TicketData
  status: 'PENDING' | 'PRINTED' | 'ERROR'
  error?: string
  createdAt: string
}
