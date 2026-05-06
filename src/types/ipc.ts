/**
 * TypeScript types for the IPC bridge exposed by preload.ts
 * These mirror the shapes returned by the main process modules.
 */

export interface LoginResult {
  success: boolean
  user?: AuthenticatedUser
  error?: string
}

export interface AuthenticatedUser {
  id: number
  username: string
  name: string
  role: Role
  permissions: Permission[]
}

export interface Role {
  id: number
  name: string
  description: string
}

export interface Permission {
  id: number
  roleId: number
  module: string
  action: string
}

export interface User {
  id: number
  username: string
  name: string
  roleId: number
  active: boolean
  createdAt: string
  updatedAt: string
}

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
}

export interface Product {
  id: number
  sku: string
  barcode: string | null
  name: string
  description: string
  categoryId: number | null
  supplierId: number | null
  supplierCode: string
  price: number
  cost: number
  taxRateId: number
  gainPercent: number
  active: boolean
  stockQuantity: number
  stockMin: number
  createdAt: string
  updatedAt: string
}

export interface Customer {
  id: number
  name: string
  cuitDni: string
  docType: string
  condicionIva: string
  address: string
  email: string
  phone: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface Supplier {
  id: number
  name: string
  cuit: string
  address: string
  email: string
  phone: string
  contact: string
  notes: string
  active: boolean
  createdAt: string
  updatedAt: string
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

export interface StockMovement {
  id: number
  productId: number
  productName?: string
  type: string
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

export type SaleStatus = 'PENDING_CAE' | 'AUTHORIZED' | 'REJECTED' | 'INTERNAL_RECEIPT'
export type PaymentMethod = 'contado_efectivo' | 'transferencia' | 'debito' | 'credito'

export interface SaleItem {
  id?: number
  saleId?: number
  productId: number
  productName?: string
  quantity: number
  unitPrice: number
  taxRate: number
  subtotal: number
}

export interface AppliedParameter {
  id?: number
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
  paymentMethod: PaymentMethod
  saleDate: string
  invoiceType: number | null
  invoiceNumber: number | null
  puntoVenta: number | null
  cae: string | null
  caeVto: string | null
  afipError: string | null
  isBlackSale: boolean
  createdAt: string
  updatedAt: string
  items?: SaleItem[]
  appliedParameters?: AppliedParameter[]
}

export interface BackupInfo {
  filename: string
  path: string
  sizeBytes: number
  createdAt: string
}

export interface DailySummaryReport {
  date: string
  salesCount: number
  authorizedInvoices: number
  internalReceipts: number
  totalGross: number
  totalTax: number
  totalNet: number
  whiteSalesCount: number
  whiteSalesTotal: number
  blackSalesCount: number
  blackSalesTotal: number
}

export interface SalesSummary {
  date: string
  salesCount: number
  totalAmount: number
  authorizedCount: number
  internalReceiptCount: number
}

export interface Parameter {
  id: number
  descripcion: string
  porcentaje: number
  tipo: '+' | '-'
  createdAt: string
  updatedAt: string
}

export type SessionStatus = 'open' | 'closed'
export type MovimientoTipo = 'ingreso' | 'egreso'

export interface CashSession {
  id: number
  sessionDate: string
  aperturaAmount: number
  cierreAmount: number | null
  status: SessionStatus
  createdAt: string
  updatedAt: string
}

export interface CashMovement {
  id: number
  sessionId: number | null
  descripcion: string
  tipo: MovimientoTipo
  monto: number
  movimientoDate: string
  createdAt: string
}

export interface CierreSummary {
  session: CashSession
  aperturaAmount: number
  cashSalesTotal: number
  ingresosTotal: number
  egresosTotal: number
  expectedTotal: number
  salesByPaymentMethod: {
    contado_efectivo: number
    transferencia: number
    debito: number
    credito: number
  }
  movements: CashMovement[]
}
