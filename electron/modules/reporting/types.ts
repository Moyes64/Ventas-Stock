export interface SalesSummary {
  date: string
  salesCount: number
  totalAmount: number
  authorizedCount: number
  internalReceiptCount: number
}

export interface ProductReport {
  productId: number
  productName: string
  sku: string
  totalSold: number
  totalRevenue: number
}

export interface StockReport {
  productId: number
  productName: string
  sku: string
  barcode: string | null
  currentStock: number
  stockMin: number
  isLow: boolean
  lastMovementDate: string | null
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

export interface ReportFilters {
  dateFrom?: string
  dateTo?: string
  productId?: number
  categoryId?: number
  supplierId?: number
}

export interface RankingItem {
  productId: number
  productName: string
  sku: string
  value: number   // cantidad vendida ó ganancia neta según el reporte
}

export interface PurchaseItem {
  movementId: number
  productId: number
  productName: string
  sku: string
  quantity: number
  unitCost: number
  unitPrice: number
  subtotalCost: number
  subtotalPrice: number
}

export interface PurchaseVoucherGroup {
  voucherType: string | null
  voucherNumber: string | null
  voucherDate: string | null
  items: PurchaseItem[]
  totalCost: number
  totalPrice: number
}

export interface PurchaseSupplierGroup {
  supplierId: number | null
  supplierName: string
  vouchers: PurchaseVoucherGroup[]
  totalCost: number
  totalPrice: number
}

export interface PurchasesReport {
  suppliers: PurchaseSupplierGroup[]
  grandTotalCost: number
  grandTotalPrice: number
  incompleteCount: number
}

export interface IncompleteEntry {
  movementId: number
  productId: number
  productName: string
  quantity: number
  createdAt: string
  supplierId: number | null
  supplierName: string | null
  voucherType: string | null
  voucherNumber: string | null
  voucherDate: string | null
  notes: string
}
