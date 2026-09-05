export interface FixedCost {
  id: number
  nombre: string
  montoMensual: number
  activo: boolean
  notas: string
  createdAt: string
  updatedAt: string
}

export interface CreateFixedCostInput {
  nombre: string
  montoMensual: number
  activo?: boolean
  notas?: string
}

export interface UpdateFixedCostInput {
  nombre?: string
  montoMensual?: number
  activo?: boolean
  notas?: string
}

export interface PricingSettings {
  margenObjetivoA: number
  margenObjetivoB: number
  margenObjetivoC: number
  paretoCorteAPct: number
  paretoCorteBPct: number
  /** Proveedor cuyos productos son fabricación propia (costo interno/nominal,
   *  no de reventa) — se agrupan aparte con su propio margen objetivo. null = desactivado. */
  proveedorPropioId: number | null
  margenObjetivoPropio: number
}

export type PricingSegment = 'A' | 'B' | 'C' | 'P'

export interface ProductPricingRow {
  productId: number
  sku: string
  name: string
  cost: number
  price: number
  taxRatePct: number
  stockQuantity: number
  segmento: PricingSegment
  unidadesVentana: number
  facturadoVentana: number
  /** stock actual ÷ velocidad de venta diaria de la ventana. null si no hay ventas (no debería pasar para A/B/C). */
  diasCobertura: number | null
  markupActualPct: number
  precioSugerido: number
  markupSugeridoPct: number
  deltaVsActualPct: number
}

export interface DeadStockRow {
  productId: number
  sku: string
  name: string
  stockQuantity: number
  cost: number
  valorInmovilizado: number
}

export interface PricingTotals {
  ventanaDias: number
  facturacionVentana: number
  costoFijoMensual: number
  costoFijoVentana: number
  costoFijoPct: number
  comisionFinancieraPromedioPct: number
  margenPonderadoActualPct: number
  margenPonderadoProyectadoPct: number
  gananciaNetaProyectadaVentana: number
}

export interface PricingSimulationParams {
  ventanaDias?: number
  margenObjetivoA: number
  margenObjetivoB: number
  margenObjetivoC: number
  paretoCorteAPct: number
  paretoCorteBPct: number
  proveedorPropioId?: number | null
  margenObjetivoPropio?: number
  /** Override manual de segmento por producto, SOLO para esta simulación (ej:
   *  un producto que comparte proveedor con la fabricación propia pero en
   *  realidad es reventa). No cambia el proveedor real del producto. */
  segmentOverrides?: Record<number, PricingSegment>
  /** IDs de finance_movements a excluir del costo fijo SOLO para esta simulación
   *  (ej: un gasto que en realidad se pagó con plata propia, no de la empresa).
   *  No modifica los movimientos reales de Finanzas. */
  excludedMovementIds?: number[]
}

/** Un egreso de Finanzas que cuenta como costo fijo de estructura — el usuario
 *  puede destildarlo para excluirlo de esta simulación puntual. */
export interface OverheadMovementRow {
  movementId: number
  fecha: string
  categoriaId: number | null
  categoriaName: string
  descripcion: string
  monto: number
  included: boolean
}

export interface PricingSimulationResult {
  totals: PricingTotals
  rows: ProductPricingRow[]
  deadStock: DeadStockRow[]
  overheadMovements: OverheadMovementRow[]
}
