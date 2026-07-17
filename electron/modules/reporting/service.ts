import type { Database } from 'better-sqlite3'
import type {
  SalesSummary,
  ProductReport,
  StockReport,
  DailySummaryReport,
  ReportFilters,
  RankingItem,
  PurchasesReport,
  PurchaseSupplierGroup,
  IncompleteEntry,
} from './types'

interface PurchaseRow {
  movementId: number
  productId: number
  productName: string
  sku: string
  quantity: number
  unitCost: number
  unitPrice: number
  supplierId: number | null
  supplierName: string | null
  voucherType: string | null
  voucherNumber: string | null
  voucherDate: string | null
}

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

  /** Top 10 productos por cantidad vendida */
  rankingPorCantidad(filters: ReportFilters): RankingItem[] {
    const params: Record<string, unknown> = {}
    const conditions: string[] = ["s.status IN ('AUTHORIZED', 'INTERNAL_RECEIPT')"]
    if (filters.dateFrom) { conditions.push('s.sale_date >= @dateFrom'); params.dateFrom = filters.dateFrom }
    if (filters.dateTo)   { conditions.push('s.sale_date <= @dateTo');   params.dateTo   = filters.dateTo   }
    const where = `WHERE ${conditions.join(' AND ')}`
    return this.db.prepare(`
      SELECT p.id AS productId, p.name AS productName, p.sku,
             SUM(si.quantity) AS value
      FROM sale_items si
      JOIN products p ON p.id = si.product_id
      JOIN sales s ON s.id = si.sale_id
      ${where}
      GROUP BY p.id
      ORDER BY value DESC
      LIMIT 10
    `).all(params) as RankingItem[]
  }

  /** Top 10 productos por ganancia neta = (precio_venta - costo) * cantidad */
  rankingPorGanancia(filters: ReportFilters): RankingItem[] {
    const params: Record<string, unknown> = {}
    const conditions: string[] = ["s.status IN ('AUTHORIZED', 'INTERNAL_RECEIPT')"]
    if (filters.dateFrom) { conditions.push('s.sale_date >= @dateFrom'); params.dateFrom = filters.dateFrom }
    if (filters.dateTo)   { conditions.push('s.sale_date <= @dateTo');   params.dateTo   = filters.dateTo   }
    const where = `WHERE ${conditions.join(' AND ')}`
    return this.db.prepare(`
      SELECT p.id AS productId, p.name AS productName, p.sku,
             SUM((si.unit_price - p.cost) * si.quantity) AS value
      FROM sale_items si
      JOIN products p ON p.id = si.product_id
      JOIN sales s ON s.id = si.sale_id
      ${where}
      GROUP BY p.id
      ORDER BY value DESC
      LIMIT 10
    `).all(params) as RankingItem[]
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
           SUM(CASE WHEN is_black_sale = 0 THEN 1 ELSE 0 END) AS whiteSalesCount,
           SUM(CASE WHEN is_black_sale = 0 THEN total ELSE 0 END) AS whiteSalesTotal,
           SUM(CASE WHEN is_black_sale = 1 THEN 1 ELSE 0 END) AS blackSalesCount,
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

  /**
   * Ingresos de mercadería (stock_movements type='ENTRY') agrupados por
   * proveedor y luego por comprobante (voucher_type + voucher_number + voucher_date).
   * Valorizado con el costo/precio ACTUAL del producto (no se guarda costo histórico).
   */
  purchasesBySupplier(filters: ReportFilters): PurchasesReport {
    const params: Record<string, unknown> = {}
    const conditions: string[] = [`sm.type = 'ENTRY'`]

    if (filters.dateFrom) {
      conditions.push('sm.created_at >= @dateFrom')
      params.dateFrom = filters.dateFrom
    }
    if (filters.dateTo) {
      conditions.push('sm.created_at <= @dateTo')
      params.dateTo = filters.dateTo + ' 23:59:59'
    }
    if (filters.supplierId) {
      conditions.push('sm.supplier_id = @supplierId')
      params.supplierId = filters.supplierId
    }

    const where = `WHERE ${conditions.join(' AND ')}`

    const rows = this.db
      .prepare(
        `SELECT sm.id AS movementId, sm.product_id AS productId, p.name AS productName, p.sku,
                sm.quantity, p.cost AS unitCost, p.price AS unitPrice,
                sm.supplier_id AS supplierId, s.name AS supplierName,
                sm.voucher_type AS voucherType, sm.voucher_number AS voucherNumber, sm.voucher_date AS voucherDate
         FROM stock_movements sm
         JOIN products p ON p.id = sm.product_id
         LEFT JOIN suppliers s ON s.id = sm.supplier_id
         ${where}
         ORDER BY s.name IS NOT NULL DESC, s.name ASC, sm.voucher_date DESC, sm.created_at DESC`
      )
      .all(params) as PurchaseRow[]

    const supplierGroups = new Map<string, PurchaseSupplierGroup>()

    for (const r of rows) {
      const supplierKey = r.supplierId !== null ? String(r.supplierId) : 'none'
      let supplierGroup = supplierGroups.get(supplierKey)
      if (!supplierGroup) {
        supplierGroup = {
          supplierId: r.supplierId,
          supplierName: r.supplierName ?? 'Sin proveedor',
          vouchers: [],
          totalCost: 0,
          totalPrice: 0,
        }
        supplierGroups.set(supplierKey, supplierGroup)
      }

      const voucherKey = `${r.voucherType ?? ''}|${r.voucherNumber ?? ''}|${r.voucherDate ?? ''}`
      let voucherGroup = supplierGroup.vouchers.find(
        v => `${v.voucherType ?? ''}|${v.voucherNumber ?? ''}|${v.voucherDate ?? ''}` === voucherKey
      )
      if (!voucherGroup) {
        voucherGroup = {
          voucherType: r.voucherType,
          voucherNumber: r.voucherNumber,
          voucherDate: r.voucherDate,
          items: [],
          totalCost: 0,
          totalPrice: 0,
        }
        supplierGroup.vouchers.push(voucherGroup)
      }

      const subtotalCost = r.unitCost * r.quantity
      const subtotalPrice = r.unitPrice * r.quantity

      voucherGroup.items.push({
        movementId: r.movementId,
        productId: r.productId,
        productName: r.productName,
        sku: r.sku,
        quantity: r.quantity,
        unitCost: r.unitCost,
        unitPrice: r.unitPrice,
        subtotalCost,
        subtotalPrice,
      })
      voucherGroup.totalCost += subtotalCost
      voucherGroup.totalPrice += subtotalPrice
      supplierGroup.totalCost += subtotalCost
      supplierGroup.totalPrice += subtotalPrice
    }

    const suppliers = Array.from(supplierGroups.values())
    const grandTotalCost = suppliers.reduce((s, g) => s + g.totalCost, 0)
    const grandTotalPrice = suppliers.reduce((s, g) => s + g.totalPrice, 0)

    const incompleteCount = (
      this.db
        .prepare(
          `SELECT COUNT(*) AS c FROM stock_movements
           WHERE type = 'ENTRY' AND (voucher_number IS NULL OR TRIM(voucher_number) = '')`
        )
        .get() as { c: number }
    ).c

    return { suppliers, grandTotalCost, grandTotalPrice, incompleteCount }
  }

  /** Ingresos (ENTRY) sin número de comprobante — candidatos a completar manualmente. */
  incompleteEntries(filters: { dateFrom?: string; dateTo?: string }): IncompleteEntry[] {
    const params: Record<string, unknown> = {}
    const conditions: string[] = [
      `sm.type = 'ENTRY'`,
      `(sm.voucher_number IS NULL OR TRIM(sm.voucher_number) = '')`,
    ]

    if (filters.dateFrom) {
      conditions.push('sm.created_at >= @dateFrom')
      params.dateFrom = filters.dateFrom
    }
    if (filters.dateTo) {
      conditions.push('sm.created_at <= @dateTo')
      params.dateTo = filters.dateTo + ' 23:59:59'
    }

    const where = `WHERE ${conditions.join(' AND ')}`

    return this.db
      .prepare(
        `SELECT sm.id AS movementId, sm.product_id AS productId, p.name AS productName,
                sm.quantity, sm.created_at AS createdAt,
                sm.supplier_id AS supplierId, s.name AS supplierName,
                sm.voucher_type AS voucherType, sm.voucher_number AS voucherNumber, sm.voucher_date AS voucherDate,
                sm.notes
         FROM stock_movements sm
         JOIN products p ON p.id = sm.product_id
         LEFT JOIN suppliers s ON s.id = sm.supplier_id
         ${where}
         ORDER BY sm.created_at DESC
         LIMIT 500`
      )
      .all(params) as IncompleteEntry[]
  }
}
