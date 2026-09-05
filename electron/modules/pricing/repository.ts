import type { Database } from 'better-sqlite3'
import { localNow } from '../../lib/date'
import type { FixedCost, CreateFixedCostInput, UpdateFixedCostInput, PricingSettings } from './types'

interface FixedCostRow {
  id: number
  nombre: string
  monto_mensual: number
  activo: number
  notas: string
  created_at: string
  updated_at: string
}

interface SettingsRow {
  id: number
  margen_objetivo_a: number
  margen_objetivo_b: number
  margen_objetivo_c: number
  pareto_corte_a_pct: number
  pareto_corte_b_pct: number
  proveedor_propio_id: number | null
  margen_objetivo_propio: number
}

export interface ProductForPricing {
  productId: number
  sku: string
  name: string
  cost: number
  price: number
  taxRatePct: number
  stockQuantity: number
  supplierId: number | null
}

export interface ProductSalesMix {
  productId: number
  unidades: number
  /** Facturado sin IVA (subtotal / (1 + tax_rate/100) por línea) — misma base que `cost`. */
  facturadoSinIva: number
}

export interface PaymentMethodTotal {
  paymentMethod: string
  total: number
}

export class PricingRepository {
  constructor(private readonly db: Database) {}

  // ── Costos fijos manuales ────────────────────────────────────────────────

  listFixedCosts(activeOnly = false): FixedCost[] {
    const clause = activeOnly ? 'WHERE activo = 1' : ''
    const rows = this.db
      .prepare(`SELECT * FROM pricing_fixed_costs ${clause} ORDER BY nombre ASC`)
      .all() as FixedCostRow[]
    return rows.map(r => this.mapFixedCost(r))
  }

  findFixedCostById(id: number): FixedCost | undefined {
    const row = this.db.prepare('SELECT * FROM pricing_fixed_costs WHERE id = ?').get(id) as
      | FixedCostRow
      | undefined
    return row ? this.mapFixedCost(row) : undefined
  }

  createFixedCost(input: CreateFixedCostInput): number {
    const result = this.db
      .prepare(
        `INSERT INTO pricing_fixed_costs (nombre, monto_mensual, activo, notas)
         VALUES (@nombre, @montoMensual, @activo, @notas)`
      )
      .run({
        nombre: input.nombre,
        montoMensual: input.montoMensual,
        activo: input.activo === false ? 0 : 1,
        notas: input.notas ?? '',
      })
    return result.lastInsertRowid as number
  }

  updateFixedCost(id: number, input: UpdateFixedCostInput): void {
    const fields: string[] = []
    const params: Record<string, unknown> = { id }
    if (input.nombre !== undefined) { fields.push('nombre = @nombre'); params.nombre = input.nombre }
    if (input.montoMensual !== undefined) { fields.push('monto_mensual = @montoMensual'); params.montoMensual = input.montoMensual }
    if (input.activo !== undefined) { fields.push('activo = @activo'); params.activo = input.activo ? 1 : 0 }
    if (input.notas !== undefined) { fields.push('notas = @notas'); params.notas = input.notas }
    if (fields.length === 0) return
    fields.push('updated_at = @updatedAt')
    params.updatedAt = localNow()
    this.db.prepare(`UPDATE pricing_fixed_costs SET ${fields.join(', ')} WHERE id = @id`).run(params)
  }

  deleteFixedCost(id: number): void {
    this.db.prepare('DELETE FROM pricing_fixed_costs WHERE id = ?').run(id)
  }

  // ── Configuración del simulador ──────────────────────────────────────────

  getSettings(): PricingSettings {
    const row = this.db.prepare('SELECT * FROM pricing_settings WHERE id = 1').get() as SettingsRow
    return {
      margenObjetivoA: row.margen_objetivo_a,
      margenObjetivoB: row.margen_objetivo_b,
      margenObjetivoC: row.margen_objetivo_c,
      paretoCorteAPct: row.pareto_corte_a_pct,
      paretoCorteBPct: row.pareto_corte_b_pct,
      proveedorPropioId: row.proveedor_propio_id,
      margenObjetivoPropio: row.margen_objetivo_propio,
    }
  }

  saveSettings(input: PricingSettings): void {
    this.db
      .prepare(
        `UPDATE pricing_settings SET
           margen_objetivo_a = @margenObjetivoA,
           margen_objetivo_b = @margenObjetivoB,
           margen_objetivo_c = @margenObjetivoC,
           pareto_corte_a_pct = @paretoCorteAPct,
           pareto_corte_b_pct = @paretoCorteBPct,
           proveedor_propio_id = @proveedorPropioId,
           margen_objetivo_propio = @margenObjetivoPropio,
           updated_at = @updatedAt
         WHERE id = 1`
      )
      .run({ ...input, proveedorPropioId: input.proveedorPropioId ?? null, updatedAt: localNow() })
  }

  // ── Datos fuente para el simulador ───────────────────────────────────────

  /** Todos los productos activos, con el % de IVA de su tasa asociada. */
  listActiveProductsForPricing(): ProductForPricing[] {
    const rows = this.db
      .prepare(
        `SELECT p.id AS productId, p.sku, p.name, p.cost, p.price, p.stock_quantity AS stockQuantity,
                p.supplier_id AS supplierId,
                COALESCE(t.percentage, 0) AS taxRatePct
         FROM products p
         LEFT JOIN tax_rates t ON t.id = p.tax_rate_id
         WHERE p.active = 1
         ORDER BY p.name ASC`
      )
      .all() as ProductForPricing[]
    return rows
  }

  /** Unidades y facturación (sin IVA) por producto, para las ventas de la ventana. */
  salesMixByProduct(dateFrom: string, dateTo: string): ProductSalesMix[] {
    const rows = this.db
      .prepare(
        `SELECT si.product_id AS productId,
                SUM(si.quantity) AS unidades,
                SUM(si.subtotal / (1 + si.tax_rate / 100.0)) AS facturadoSinIva
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE s.status != 'REJECTED' AND s.sale_date >= @dateFrom AND s.sale_date <= @dateTo
         GROUP BY si.product_id`
      )
      .all({ dateFrom, dateTo }) as ProductSalesMix[]
    return rows
  }

  /** Total facturado (con IVA, tal cual se cobró) por medio de pago, para ponderar la comisión financiera. */
  paymentMethodMix(dateFrom: string, dateTo: string): PaymentMethodTotal[] {
    const rows = this.db
      .prepare(
        `SELECT payment_method AS paymentMethod, SUM(total) AS total
         FROM sales
         WHERE status != 'REJECTED' AND sale_date >= @dateFrom AND sale_date <= @dateTo
         GROUP BY payment_method`
      )
      .all({ dateFrom, dateTo }) as PaymentMethodTotal[]
    return rows
  }

  private mapFixedCost(row: FixedCostRow): FixedCost {
    return {
      id: row.id,
      nombre: row.nombre,
      montoMensual: row.monto_mensual,
      activo: row.activo === 1,
      notas: row.notas,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
