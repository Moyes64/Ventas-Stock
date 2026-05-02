import type { Database } from 'better-sqlite3'
import type {
  SalesSummary,
  ProductReport,
  StockReport,
  DailySummaryReport,
  ReportFilters,
} from './types'

export class ReportingService {
  constructor(private readonly db: Database) {}

  salesByDateRange(filters: ReportFilters): SalesSummary[] {
    const params: Record<string, unknown> = {}
    const conditions: string[] = ["status IN ('AUTHORIZED', 'INTERNAL_RECEIPT')"]

    if (filters.dateFrom) {
      conditions.push('sale_date >= @dateFrom')
      params.dateFrom = filters.dateFrom
    }
    if (filters.dateTo) {
      conditions.push('sale_date <= @dateTo')
      params.dateTo = filters.dateTo
    }

    const where = `WHERE ${conditions.join(' AND ')}`

    const rows = this.db
      .prepare(
        `SELECT
           sale_date AS date,
           COUNT(*) AS salesCount,
           SUM(total) AS totalAmount,
           SUM(CASE WHEN status = 'AUTHORIZED' THEN 1 ELSE 0 END) AS authorizedCount,
           SUM(CASE WHEN status = 'INTERNAL_RECEIPT' THEN 1 ELSE 0 END) AS internalReceiptCount
         FROM sales
         ${where}
         GROUP BY sale_date
         ORDER BY sale_date DESC`
      )
      .all(params) as SalesSummary[]

    return rows
  }

  topProductsByRevenue(filters: ReportFilters): ProductReport[] {
    const params: Record<string, unknown> = {}
    const conditions: string[] = ["s.status IN ('AUTHORIZED', 'INTERNAL_RECEIPT')"]

    if (filters.dateFrom) {
      conditions.push('s.sale_date >= @dateFrom')
      params.dateFrom = filters.dateFrom
    }
    if (filters.dateTo) {
      conditions.push('s.sale_date <= @dateTo')
      params.dateTo = filters.dateTo
    }

    const where = `WHERE ${conditions.join(' AND ')}`

    const rows = this.db
      .prepare(
        `SELECT
           p.id AS productId,
           p.name AS productName,
           p.sku,
           SUM(si.quantity) AS totalSold,
           SUM(si.subtotal) AS totalRevenue
         FROM sale_items si
         JOIN products p ON p.id = si.product_id
         JOIN sales s ON s.id = si.sale_id
         ${where}
         GROUP BY p.id
         ORDER BY totalRevenue DESC
         LIMIT 50`
      )
      .all(params) as ProductReport[]

    return rows
  }

  lowStockProducts(): StockReport[] {
    const rows = this.db
      .prepare(
        `SELECT
           p.id AS productId,
           p.name AS productName,
           p.sku,
           p.barcode,
           p.stock_quantity AS currentStock,
           p.stock_min AS stockMin,
           (p.stock_quantity <= p.stock_min AND p.stock_min > 0) AS isLow,
           (SELECT MAX(created_at) FROM stock_movements WHERE product_id = p.id) AS lastMovementDate
         FROM products p
         WHERE p.active = 1 AND p.stock_min > 0
         ORDER BY (p.stock_quantity - p.stock_min) ASC`
      )
      .all() as StockReport[]

    return rows.map(r => ({ ...r, isLow: Boolean(r.isLow) }))
  }

  stockMovements(filters: ReportFilters) {
    const params: Record<string, unknown> = {}
    const conditions: string[] = []

    if (filters.productId) {
      conditions.push('sm.product_id = @productId')
      params.productId = filters.productId
    }
    if (filters.dateFrom) {
      conditions.push('sm.created_at >= @dateFrom')
      params.dateFrom = filters.dateFrom
    }
    if (filters.dateTo) {
      conditions.push('sm.created_at <= @dateTo')
      params.dateTo = filters.dateTo + ' 23:59:59'
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    return this.db
      .prepare(
        `SELECT sm.*, p.name AS productName, p.sku
         FROM stock_movements sm
         JOIN products p ON p.id = sm.product_id
         ${where}
         ORDER BY sm.created_at DESC
         LIMIT 500`
      )
      .all(params)
  }

  dailySummary(filters: ReportFilters): DailySummaryReport[] {
    const params: Record<string, unknown> = {}
    const conditions: string[] = []

    if (filters.dateFrom) {
      conditions.push('sale_date >= @dateFrom')
      params.dateFrom = filters.dateFrom
    }
    if (filters.dateTo) {
      conditions.push('sale_date <= @dateTo')
      params.dateTo = filters.dateTo
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows = this.db
      .prepare(
        `SELECT
           sale_date AS date,
           COUNT(*) AS salesCount,
           SUM(CASE WHEN status = 'AUTHORIZED' THEN 1 ELSE 0 END) AS authorizedInvoices,
           SUM(CASE WHEN status = 'INTERNAL_RECEIPT' THEN 1 ELSE 0 END) AS internalReceipts,
           SUM(total) AS totalGross,
           SUM(tax_amount) AS totalTax,
           SUM(subtotal) AS totalNet,
           SUM(CASE WHEN is_black_sale = 1 THEN total ELSE 0 END) AS blackSalesTotal
         FROM sales
         ${where}
         GROUP BY sale_date
         ORDER BY sale_date DESC
         LIMIT 90`
      )
      .all(params) as DailySummaryReport[]

    return rows
  }
}
