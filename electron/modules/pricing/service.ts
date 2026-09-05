import type { Database } from 'better-sqlite3'
import { localToday } from '../../lib/date'
import { FinanceRepository } from '../finance/repository'
import type { MpFeePaymentMethod } from '../finance/types'
import { ProductRepository } from '../catalog/repository'
import { PricingRepository } from './repository'
import type { ProductForPricing, ProductSalesMix } from './repository'
import type {
  FixedCost,
  CreateFixedCostInput,
  UpdateFixedCostInput,
  PricingSettings,
  PricingSimulationParams,
  PricingSimulationResult,
  ProductPricingRow,
  DeadStockRow,
  OverheadMovementRow,
  PricingSegment,
} from './types'

/** Categorías de egreso que NO son costo fijo de estructura (COGS, retiros de
 *  socio, comisiones/ajustes de MP que ya se calculan aparte, devoluciones) —
 *  todo lo demás que el usuario cargue en Finanzas como egreso cuenta como
 *  overhead fijo del negocio. */
const NON_OVERHEAD_CATEGORIES = new Set([
  'Pago a Proveedores',
  'Retiro de Socio',
  'Comisión Mercado Pago',
  'Ajuste Conciliación MP',
  'Devolución a Cliente',
])

/** Medios de pago a los que Mercado Pago les cobra comisión (mismo set que el módulo de Finanzas). */
const MP_FEE_METHODS = new Set<MpFeePaymentMethod>(['qr', 'debito', 'credito', 'mercadopago'])

const DEFAULT_VENTANA_DIAS = 90

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function subtractDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() - days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export class PricingService {
  private readonly repo: PricingRepository
  private readonly financeRepo: FinanceRepository
  private readonly productRepo: ProductRepository

  constructor(db: Database) {
    this.repo = new PricingRepository(db)
    this.financeRepo = new FinanceRepository(db)
    this.productRepo = new ProductRepository(db)
  }

  // ── Costos fijos manuales ────────────────────────────────────────────────

  listFixedCosts(): FixedCost[] {
    return this.repo.listFixedCosts()
  }

  createFixedCost(input: CreateFixedCostInput): FixedCost {
    if (!input.nombre?.trim()) throw new Error('El nombre del costo fijo es obligatorio')
    if (typeof input.montoMensual !== 'number' || input.montoMensual < 0) {
      throw new Error('El monto mensual debe ser un número mayor o igual a cero')
    }
    const id = this.repo.createFixedCost(input)
    const created = this.repo.findFixedCostById(id)
    if (!created) throw new Error('Error al recuperar el costo fijo creado')
    return created
  }

  updateFixedCost(id: number, input: UpdateFixedCostInput): FixedCost {
    const existing = this.repo.findFixedCostById(id)
    if (!existing) throw new Error(`Costo fijo no encontrado: ${id}`)
    if (input.montoMensual !== undefined && input.montoMensual < 0) {
      throw new Error('El monto mensual debe ser un número mayor o igual a cero')
    }
    this.repo.updateFixedCost(id, input)
    const updated = this.repo.findFixedCostById(id)
    if (!updated) throw new Error('Error al recuperar el costo fijo actualizado')
    return updated
  }

  deleteFixedCost(id: number): void {
    const existing = this.repo.findFixedCostById(id)
    if (!existing) throw new Error(`Costo fijo no encontrado: ${id}`)
    this.repo.deleteFixedCost(id)
  }

  // ── Configuración ─────────────────────────────────────────────────────────

  getSettings(): PricingSettings {
    return this.repo.getSettings()
  }

  saveSettings(input: PricingSettings): PricingSettings {
    this.repo.saveSettings(input)
    return this.repo.getSettings()
  }

  // ── Simulación ────────────────────────────────────────────────────────────

  simulate(params: PricingSimulationParams): PricingSimulationResult {
    const ventanaDias = params.ventanaDias ?? DEFAULT_VENTANA_DIAS
    const dateTo = localToday()
    const dateFrom = subtractDays(dateTo, ventanaDias - 1)

    const products = this.repo.listActiveProductsForPricing()
    const mixByProduct = new Map(this.repo.salesMixByProduct(dateFrom, dateTo).map(m => [m.productId, m]))

    // ── Costo fijo: manual (prorrateado a la ventana) + egresos "de estructura"
    // ya cargados en Finanzas dentro de la ventana (esto último ya viene acotado
    // al período, no se prorratea de nuevo). Se arma a nivel de MOVIMIENTO
    // individual (no solo por categoría) para poder mostrar el detalle en la UI
    // y dejar que el usuario destilde puntualmente uno (ej: algo que en
    // realidad pagó con plata propia) sin tocar el dato real en Finanzas. ────
    const manualFixedMonthly = this.repo
      .listFixedCosts(true)
      .reduce((acc, fc) => acc + fc.montoMensual, 0)

    const excludedMovementIds = new Set(params.excludedMovementIds ?? [])
    const categoryNameById = new Map(this.financeRepo.listCategories().map(c => [c.id, c.name]))
    // Los egresos sin categoría NO se asumen como costo fijo por defecto —
    // podrían ser cualquier cosa (incluso costo de mercadería mal cargado).
    const overheadMovements: OverheadMovementRow[] = this.financeRepo
      .listMovements({ tipo: 'egreso', dateFrom, dateTo })
      .filter(m => m.categoriaId !== null && !NON_OVERHEAD_CATEGORIES.has(categoryNameById.get(m.categoriaId) ?? ''))
      .map(m => ({
        movementId: m.id,
        fecha: m.fecha,
        categoriaId: m.categoriaId,
        categoriaName: categoryNameById.get(m.categoriaId!) ?? 'Sin categoría',
        descripcion: m.descripcion,
        monto: m.monto,
        included: !excludedMovementIds.has(m.id),
      }))
      .sort((a, b) => b.monto - a.monto)

    const financeExpensesWindow = overheadMovements.filter(m => m.included).reduce((acc, m) => acc + m.monto, 0)

    const manualFixedWindow = manualFixedMonthly * (ventanaDias / 30)
    const costoFijoVentana = manualFixedWindow + financeExpensesWindow
    const costoFijoMensual = manualFixedMonthly + financeExpensesWindow * (30 / ventanaDias)

    // ── Comisión financiera: promedio ponderado por facturación real del mix
    // de medios de pago de la ventana (simplificación: no es por producto, la
    // comisión depende del medio de pago elegido en cada venta). ─────────────
    const paymentMix = this.repo.paymentMethodMix(dateFrom, dateTo)
    let comisionWeightedSum = 0
    let comisionBaseTotal = 0
    for (const pm of paymentMix) {
      comisionBaseTotal += pm.total
      if (MP_FEE_METHODS.has(pm.paymentMethod as MpFeePaymentMethod)) {
        const rate = this.financeRepo.findEffectiveMpFeeRate(pm.paymentMethod as MpFeePaymentMethod, dateTo)
        if (rate) {
          const effectivePct = rate.pct * (1 + rate.ivaPct / 100)
          comisionWeightedSum += pm.total * effectivePct
        }
      }
    }
    const comisionFinancieraPromedioPct = comisionBaseTotal > 0 ? comisionWeightedSum / comisionBaseTotal : 0

    // ── Clasificación. Primero se separan los productos de fabricación propia
    // (costo interno/nominal, no de reventa) — no entran en el Pareto A/B/C
    // para no distorsionar esa clasificación con su markup fuera de escala,
    // pero SÍ suman a la facturación total (es venta real que ayuda a cubrir
    // el costo fijo). Solo se considera la facturación de productos activos —
    // uno dado de baja no debería inflar el denominador del % de costo fijo. ─
    const candidates: Array<{ p: ProductForPricing; mix: ProductSalesMix | undefined }> = products.map(p => ({
      p,
      mix: mixByProduct.get(p.productId),
    }))
    const allWithSales = candidates
      .filter((x): x is { p: ProductForPricing; mix: ProductSalesMix } => !!x.mix && x.mix.unidades > 0)
      .sort((a, b) => b.mix.facturadoSinIva - a.mix.facturadoSinIva)

    // Override manual de segmento por producto (ej: "Moto Vespa" comparte
    // proveedor con la fabricación propia pero en realidad es reventa) — es
    // puramente de esta simulación, no cambia el proveedor real del producto.
    const segmentOverrides = new Map<number, PricingSegment>(
      Object.entries(params.segmentOverrides ?? {}).map(([id, seg]) => [Number(id), seg])
    )
    const proveedorPropioId = params.proveedorPropioId ?? null
    function isPropioEffective(p: ProductForPricing): boolean {
      const override = segmentOverrides.get(p.productId)
      if (override) return override === 'P'
      return proveedorPropioId !== null && p.supplierId === proveedorPropioId
    }
    const propioWithSales = allWithSales.filter(x => isPropioEffective(x.p))
    const resaleWithSales = allWithSales.filter(x => !isPropioEffective(x.p))

    const facturacionVentana = allWithSales.reduce((acc, x) => acc + x.mix.facturadoSinIva, 0)
    const facturacionResaleVentana = resaleWithSales.reduce((acc, x) => acc + x.mix.facturadoSinIva, 0)
    const costoFijoPct = facturacionVentana > 0 ? (costoFijoVentana / facturacionVentana) * 100 : 0

    const deadStock: DeadStockRow[] = products
      .filter(p => !mixByProduct.get(p.productId)?.unidades)
      .map(p => ({
        productId: p.productId,
        sku: p.sku,
        name: p.name,
        stockQuantity: p.stockQuantity,
        cost: p.cost,
        valorInmovilizado: round2(p.stockQuantity * p.cost),
      }))
      .sort((a, b) => b.valorInmovilizado - a.valorInmovilizado)

    const margenPorSegmento: Record<PricingSegment, number> = {
      A: params.margenObjetivoA,
      B: params.margenObjetivoB,
      C: params.margenObjetivoC,
      P: params.margenObjetivoPropio ?? 50,
    }

    function buildRow(p: ProductForPricing, mix: ProductSalesMix, segmento: PricingSegment): ProductPricingRow {
      const margenObjetivo = margenPorSegmento[segmento]

      const priceSinIva = p.taxRatePct > 0 ? p.price / (1 + p.taxRatePct / 100) : p.price
      const markupActualPct = p.cost > 0 ? ((priceSinIva - p.cost) / p.cost) * 100 : 0

      const denomPct = 100 - (comisionFinancieraPromedioPct + costoFijoPct + margenObjetivo)
      const denom = Math.max(denomPct, 1) / 100
      const precioSinIvaSugerido = p.cost / denom
      const precioSugerido = round2(precioSinIvaSugerido * (1 + p.taxRatePct / 100))
      const markupSugeridoPct = p.cost > 0 ? ((precioSinIvaSugerido - p.cost) / p.cost) * 100 : 0
      const deltaVsActualPct = p.price > 0 ? ((precioSugerido - p.price) / p.price) * 100 : 0

      return {
        productId: p.productId,
        sku: p.sku,
        name: p.name,
        cost: p.cost,
        price: p.price,
        taxRatePct: p.taxRatePct,
        stockQuantity: p.stockQuantity,
        segmento,
        unidadesVentana: mix.unidades,
        facturadoVentana: round2(mix.facturadoSinIva),
        diasCobertura: mix.unidades > 0 ? round2(p.stockQuantity / (mix.unidades / ventanaDias)) : null,
        markupActualPct: round2(markupActualPct),
        precioSugerido,
        markupSugeridoPct: round2(markupSugeridoPct),
        deltaVsActualPct: round2(deltaVsActualPct),
      }
    }

    const propioRows: ProductPricingRow[] = propioWithSales.map(({ p, mix }) => buildRow(p, mix, 'P'))

    // El corte de Pareto se calcula sobre la facturación de REVENTA solamente
    // (sin fabricación propia), para que "Grupo A" siga significando "el top
    // de facturación entre lo que se compra a proveedores externos".
    let cumFacturado = 0
    const resaleRows: ProductPricingRow[] = resaleWithSales.map(({ p, mix }) => {
      cumFacturado += mix.facturadoSinIva
      const cumPct = facturacionResaleVentana > 0 ? (cumFacturado / facturacionResaleVentana) * 100 : 0
      const autoSegmento: PricingSegment =
        cumPct <= params.paretoCorteAPct ? 'A' : cumPct <= params.paretoCorteBPct ? 'B' : 'C'
      const segmento = segmentOverrides.get(p.productId) ?? autoSegmento
      return buildRow(p, mix, segmento)
    })

    const rows: ProductPricingRow[] = [...propioRows, ...resaleRows]

    // ── Totales: margen NETO (ya descontada comisión + costo fijo), ponderado
    // por facturación. El proyectado asume el mismo volumen de unidades que la
    // ventana analizada, a los precios sugeridos — es una proyección, no una
    // garantía de que el mix de ventas se mantenga igual con otro precio. ────
    let actualWeightedSum = 0
    let projectedWeightedSum = 0
    let projectedFacturadoTotal = 0
    let gananciaNetaProyectada = 0
    for (const row of rows) {
      const grossMarginActualPct =
        row.price > 0 ? (((row.price / (1 + row.taxRatePct / 100)) - row.cost) / (row.price / (1 + row.taxRatePct / 100))) * 100 : 0
      const netMarginActualPct = grossMarginActualPct - comisionFinancieraPromedioPct - costoFijoPct
      actualWeightedSum += netMarginActualPct * row.facturadoVentana

      const precioSinIvaSugerido = row.precioSugerido / (1 + row.taxRatePct / 100)
      const facturadoProyectado = row.unidadesVentana * precioSinIvaSugerido
      const margenObjetivo = margenPorSegmento[row.segmento]
      projectedWeightedSum += margenObjetivo * facturadoProyectado
      projectedFacturadoTotal += facturadoProyectado
      gananciaNetaProyectada += (margenObjetivo / 100) * facturadoProyectado
    }

    const totals = {
      ventanaDias,
      facturacionVentana: round2(facturacionVentana),
      costoFijoMensual: round2(costoFijoMensual),
      costoFijoVentana: round2(costoFijoVentana),
      costoFijoPct: round2(costoFijoPct),
      comisionFinancieraPromedioPct: round2(comisionFinancieraPromedioPct),
      margenPonderadoActualPct: facturacionVentana > 0 ? round2(actualWeightedSum / facturacionVentana) : 0,
      margenPonderadoProyectadoPct: projectedFacturadoTotal > 0 ? round2(projectedWeightedSum / projectedFacturadoTotal) : 0,
      gananciaNetaProyectadaVentana: round2(gananciaNetaProyectada),
    }

    return { totals, rows, deadStock, overheadMovements }
  }

  applyPrice(productId: number, precio: number): void {
    if (typeof precio !== 'number' || precio <= 0) {
      throw new Error('El precio debe ser un número mayor a cero')
    }
    const product = this.productRepo.findById(productId)
    if (!product) throw new Error(`Producto no encontrado: ${productId}`)

    // Mantiene gain_percent consistente con el nuevo precio (igual que hace price-update.handlers.ts).
    const ivaPct = this.productRepo.getTaxRates().find(t => t.id === product.taxRateId)?.percentage ?? 0
    const gainPercent =
      product.cost > 0 ? round2((precio / (1 + ivaPct / 100) / product.cost - 1) * 100) : product.gainPercent

    this.productRepo.update(productId, { price: precio, gainPercent })
  }
}
