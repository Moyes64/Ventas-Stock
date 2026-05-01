export interface TicketLine {
  text: string
  bold?: boolean
  center?: boolean
  right?: boolean
  separator?: boolean
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
  subtotal: number
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
