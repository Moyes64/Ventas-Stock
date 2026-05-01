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
}

export interface ReportFilters {
  dateFrom?: string
  dateTo?: string
  productId?: number
  categoryId?: number
}
