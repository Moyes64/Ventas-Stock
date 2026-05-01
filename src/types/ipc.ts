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
  price: number
  cost: number
  taxRateId: number
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
}

export type SaleStatus = 'PENDING_CAE' | 'AUTHORIZED' | 'REJECTED' | 'INTERNAL_RECEIPT'

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

export interface Sale {
  id: number
  customerId: number | null
  customerName?: string
  userId: number | null
  status: SaleStatus
  subtotal: number
  taxAmount: number
  total: number
  saleDate: string
  invoiceType: number | null
  invoiceNumber: number | null
  puntoVenta: number | null
  cae: string | null
  caeVto: string | null
  afipError: string | null
  createdAt: string
  updatedAt: string
  items?: SaleItem[]
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
}

export interface SalesSummary {
  date: string
  salesCount: number
  totalAmount: number
  authorizedCount: number
  internalReceiptCount: number
}
