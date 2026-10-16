export interface SyncConfig {
  enabled: boolean
  apiUrl: string
  apiKey: string
  intervalMinutes: number
}

export interface SyncStockItem {
  id: number
  name: string
  precio: number
  costo: number    // costo + IVA
  margen: number   // % ganancia sobre costo s/IVA
  currentStock: number
  stockMin: number
  isLow: boolean
}

export interface SyncVentasHoy {
  count: number
  total: number
  byPaymentMethod: Record<string, number>
  recentSales: Array<{
    id: number
    time: string
    total: number
    paymentMethod: string
    status: string
    items: Array<{ productName: string; quantity: number }>
  }>
}

export interface SyncSaleHistory {
  id: number
  date: string          // YYYY-MM-DD
  time: string          // HH:MM
  total: number
  paymentMethod: string
  status: string
  items: Array<{ productName: string; quantity: number }>
}

export interface SyncCaja {
  status: 'open' | 'closed' | 'no_session'
  sessionDate: string | null
  aperturaAmount: number
  efectivoVentas: number
  ingresosTotal: number
  egresosTotal: number
  expectedTotal: number
}

// ── Web catalog (push) ───────────────────────────────────────────────────

export interface SyncWebCategory {
  id: number
  name: string
  slug: string
  description: string
  sortOrder: number
}

export interface SyncWebImage {
  sortOrder: number
  filename: string
}

export interface SyncWebProduct {
  productId: number
  name: string
  slug: string
  visible: boolean
  featured: boolean
  featuredOrder: number
  giftCategories: string // slugs separados por coma (ver web-catalog/giftCategories.ts)
  price: number          // precio efectivo web
  stock: number
  webCategoryId: number | null
  shortDescription: string
  longDescription: string
  ageMin: number | null
  playersMin: number | null
  playersMax: number | null
  playTimeMin: number | null
  difficulty: number | null
  videoUrl: string
  tags: string
  sortOrder: number
  images: SyncWebImage[]
}

// ── Web orders (pull) ────────────────────────────────────────────────────

export interface WebOrderItem {
  productId: number
  productName: string
  quantity: number
  unitPrice: number
}

export interface WebOrder {
  id: number
  externalId: string     // ID de la orden en Hostinger
  customerName: string
  customerEmail: string
  customerPhone: string
  customerDocType?: string
  customerDocNumber?: string
  deliveryType: 'pickup' | 'shipping'
  deliveryAddress: string
  total: number
  shippingAmount: number
  surchargeAmount: number
  surchargePct: number
  paymentMethod: string
  mpPaymentId: string
  items: WebOrderItem[]
  createdAt: string
}

// ── Finanzas (ingresos/egresos y patrimonio de socios) ──────────────────

export interface SyncFinanceAccountBalance {
  accountId: number
  accountName: string
  accountType: string
  balance: number
  pendingAmount: number
  nextAccreditationDate: string | null
}

export interface SyncFinancePendingAccreditation {
  accountName: string
  monto: number
  fecha: string
  fechaAcreditacion: string
  descripcion: string
}

export interface SyncFinanceTransfer {
  fecha: string
  fromAccountName: string
  toAccountName: string
  monto: number
  descripcion: string | null
}

/** Un renglón del extracto de una cuenta: movimiento propio o transferencia
 *  desde/hacia otra cuenta. monto con signo (+ entra, − sale). */
export interface SyncFinanceAccountMovement {
  fecha: string
  kind: 'ingreso' | 'egreso' | 'transferencia'
  concepto: string
  descripcion: string | null
  monto: number
  /** Solo si todavía no se acreditó (fecha de acreditación futura). */
  fechaAcreditacion: string | null
}

export interface SyncFinanceAccountStatement {
  accountName: string
  movements: SyncFinanceAccountMovement[]
}

export interface SyncFinanceCashFlow {
  ingresos: number
  egresos: number
  neto: number
}

export interface SyncFinanceCategoryExpense {
  categoriaName: string
  total: number
}

export interface SyncFinancePartnerEquity {
  partnerName: string
  ownershipPct: number
  utilidadAcumulada: number
  retirosRealizados: number
  saldoPendiente: number
  prestamosPendientes: number
  aportesPendientes: number
}

export interface SyncFinance {
  accountBalances: SyncFinanceAccountBalance[]
  cashFlowMonth: SyncFinanceCashFlow
  expensesByCategoryMonth: SyncFinanceCategoryExpense[]
  partnersEquity: SyncFinancePartnerEquity[]
  pendingAccreditations: SyncFinancePendingAccreditation[]
  recentTransfers: SyncFinanceTransfer[]
  /** Historial completo de la cuenta MP de Ariel (el dashboard filtra por fecha). */
  mpArielStatement?: SyncFinanceAccountStatement | null
}

export interface SyncPayload {
  timestamp: string
  empresa: string
  stock: SyncStockItem[]
  ventasHoy: SyncVentasHoy
  salesHistory: SyncSaleHistory[]
  caja: SyncCaja
  webCategories: SyncWebCategory[]
  webProducts: SyncWebProduct[]
  webParams?: { costoEnvioWeb: number; recargoTarjetaCreditoWeb: number }
  finance: SyncFinance
}

export interface PullResult {
  success: boolean
  ordersProcessed: number
  errors: string[]
  timestamp: string
}

export interface SyncResult {
  success: boolean
  timestamp: string
  error?: string
}
