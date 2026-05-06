import type { Database } from 'better-sqlite3'
import type { Sale, SaleItem, AppliedParameter, CreateSaleInput } from './types'

interface SaleRow {
  id: number
  customer_id: number | null
  user_id: number | null
  status: string
  subtotal: number
  tax_amount: number
  total: number
  discount_amount: number
  payment_method: string
  sale_date: string
  invoice_type: number | null
  invoice_number: number | null
  punto_venta: number | null
  cae: string | null
  cae_vto: string | null
  afip_error: string | null
  is_black_sale: number
  created_at: string
  updated_at: string
  customer_name?: string
}

interface SaleItemRow {
  id: number
  sale_id: number
  product_id: number
  quantity: number
  unit_price: number
  tax_rate: number
  subtotal: number
  product_name?: string
}

interface SaleParameterRow {
  id: number
  sale_id: number
  parameter_id: number | null
  descripcion: string
  porcentaje: number
  tipo: string
}

export class SaleRepository {
  constructor(private readonly db: Database) {}

  findById(id: number): Sale | undefined {
    const row = this.db
      .prepare(
        `SELECT s.*, c.name AS customer_name
         FROM sales s
         LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.id = ?`
      )
      .get(id) as SaleRow | undefined
    if (!row) return undefined

    const items = this.getItems(id)
    const appliedParameters = this.getAppliedParameters(id)
    return { ...this.mapRow(row), items, appliedParameters }
  }

  list(filters: { dateFrom?: string; dateTo?: string; status?: string; limit?: number }): Sale[] {
    const conditions: string[] = []
    const params: Record<string, unknown> = {}

    if (filters.dateFrom) {
      conditions.push('s.sale_date >= @dateFrom')
      params.dateFrom = filters.dateFrom
    }
    if (filters.dateTo) {
      conditions.push('s.sale_date <= @dateTo')
      params.dateTo = filters.dateTo
    }
    if (filters.status) {
      conditions.push('s.status = @status')
      params.status = filters.status
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const limit = filters.limit ?? 200

    const rows = this.db
      .prepare(
        `SELECT s.*, c.name AS customer_name
         FROM sales s
         LEFT JOIN customers c ON c.id = s.customer_id
         ${where}
         ORDER BY s.created_at DESC
         LIMIT ${limit}`
      )
      .all(params) as SaleRow[]

    return rows.map(r => this.mapRow(r))
  }

  findPendingCAE(): Sale[] {
    return this.list({ status: 'PENDING_CAE' })
  }

  create(
    data: CreateSaleInput & {
      subtotal: number
      taxAmount: number
      total: number
      discountAmount: number
      appliedParameters: AppliedParameter[]
    }
  ): number {
    const insertSale = this.db.prepare(
      `INSERT INTO sales (customer_id, user_id, invoice_type, subtotal, tax_amount, total, discount_amount, is_black_sale, payment_method)
       VALUES (@customerId, @userId, @invoiceType, @subtotal, @taxAmount, @total, @discountAmount, @isBlackSale, @paymentMethod)`
    )

    const insertItem = this.db.prepare(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, tax_rate, subtotal)
       VALUES (@saleId, @productId, @quantity, @unitPrice, @taxRate, @subtotal)`
    )

    const insertParam = this.db.prepare(
      `INSERT INTO sale_parameters (sale_id, parameter_id, descripcion, porcentaje, tipo)
       VALUES (@saleId, @parameterId, @descripcion, @porcentaje, @tipo)`
    )

    const saleId = this.db.transaction(() => {
      const r = insertSale.run({
        customerId: data.customerId ?? null,
        userId: data.userId ?? null,
        invoiceType: data.invoiceType ?? 11,
        subtotal: data.subtotal,
        taxAmount: data.taxAmount,
        total: data.total,
        discountAmount: data.discountAmount,
        isBlackSale: data.isBlackSale ? 1 : 0,
        paymentMethod: data.paymentMethod ?? 'contado_efectivo',
      })
      const id = r.lastInsertRowid as number

      for (const item of data.items) {
        insertItem.run({
          saleId: id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate,
          subtotal: item.quantity * item.unitPrice,
        })
      }

      for (const param of data.appliedParameters) {
        insertParam.run({
          saleId: id,
          parameterId: param.parameterId ?? null,
          descripcion: param.descripcion,
          porcentaje: param.porcentaje,
          tipo: param.tipo,
        })
      }

      return id
    })()

    return saleId
  }

  updateStatus(
    id: number,
    status: Sale['status'],
    caeData?: { cae: string; caeVto: string; invoiceNumber: number; puntoVenta: number }
  ): void {
    if (caeData) {
      this.db
        .prepare(
          `UPDATE sales
           SET status = @status, cae = @cae, cae_vto = @caeVto,
               invoice_number = @invoiceNumber, punto_venta = @puntoVenta,
               updated_at = datetime('now')
           WHERE id = @id`
        )
        .run({ id, status, ...caeData })
    } else {
      this.db
        .prepare(
          `UPDATE sales SET status = @status, updated_at = datetime('now') WHERE id = @id`
        )
        .run({ id, status })
    }
  }

  updateAfipError(id: number, error: string): void {
    this.db
      .prepare(
        `UPDATE sales
         SET afip_error = @error, status = 'REJECTED', updated_at = datetime('now')
         WHERE id = @id`
      )
      .run({ id, error })
  }

  getNextInvoiceNumber(puntoVenta: number, invoiceType: number): number {
    const row = this.db
      .prepare(
        `SELECT MAX(invoice_number) AS max_num
         FROM sales
         WHERE punto_venta = ? AND invoice_type = ? AND status IN ('AUTHORIZED')`
      )
      .get(puntoVenta, invoiceType) as { max_num: number | null }
    return (row?.max_num ?? 0) + 1
  }

  getItems(saleId: number): SaleItem[] {
    const rows = this.db
      .prepare(
        `SELECT si.*, p.name AS product_name
         FROM sale_items si
         JOIN products p ON p.id = si.product_id
         WHERE si.sale_id = ?`
      )
      .all(saleId) as SaleItemRow[]

    return rows.map(r => ({
      id: r.id,
      saleId: r.sale_id,
      productId: r.product_id,
      productName: r.product_name,
      quantity: r.quantity,
      unitPrice: r.unit_price,
      taxRate: r.tax_rate,
      subtotal: r.subtotal,
    }))
  }

  getAppliedParameters(saleId: number): AppliedParameter[] {
    const rows = this.db
      .prepare('SELECT * FROM sale_parameters WHERE sale_id = ? ORDER BY id ASC')
      .all(saleId) as SaleParameterRow[]

    return rows.map(r => ({
      id: r.id,
      parameterId: r.parameter_id,
      descripcion: r.descripcion,
      porcentaje: r.porcentaje,
      tipo: r.tipo as '+' | '-',
    }))
  }

  private mapRow(row: SaleRow): Sale {
    return {
      id: row.id,
      customerId: row.customer_id,
      customerName: row.customer_name,
      userId: row.user_id,
      status: row.status as Sale['status'],
      subtotal: row.subtotal,
      taxAmount: row.tax_amount,
      total: row.total,
      discountAmount: row.discount_amount ?? 0,
      paymentMethod: (row.payment_method ?? 'contado_efectivo') as Sale['paymentMethod'],
      saleDate: row.sale_date,
      invoiceType: row.invoice_type,
      invoiceNumber: row.invoice_number,
      puntoVenta: row.punto_venta,
      cae: row.cae,
      caeVto: row.cae_vto,
      afipError: row.afip_error,
      isBlackSale: Boolean(row.is_black_sale),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
