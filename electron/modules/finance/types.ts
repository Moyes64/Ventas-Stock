export type FinanceMovementTipo = 'ingreso' | 'egreso'
export type FinanceAccountType = 'efectivo' | 'mercadopago' | 'banco'
export type FinanceCategoryAppliesTo = 'ingreso' | 'egreso' | 'ambos'

export interface FinancePartner {
  id: number
  name: string
  ownershipPct: number
  active: boolean
  createdAt: string
}

export interface FinanceAccount {
  id: number
  name: string
  type: FinanceAccountType
  active: boolean
  createdAt: string
}

export interface FinanceCategory {
  id: number
  name: string
  appliesTo: FinanceCategoryAppliesTo
  active: boolean
}

export interface FinanceMovement {
  id: number
  accountId: number
  tipo: FinanceMovementTipo
  categoriaId: number | null
  monto: number
  descripcion: string
  fecha: string
  /** Fecha en la que el dinero queda disponible en la cuenta. null = disponible de inmediato (fecha == fecha del movimiento). */
  fechaAcreditacion: string | null
  partnerId: number | null
  supplierId: number | null
  saleId: number | null
  createdAt: string
}

export interface CreateMovementInput {
  accountId: number
  tipo: FinanceMovementTipo
  categoriaId?: number | null
  monto: number
  descripcion: string
  fecha?: string
  fechaAcreditacion?: string | null
  partnerId?: number | null
  supplierId?: number | null
  saleId?: number | null
}

export interface MovementFilters {
  accountId?: number
  tipo?: FinanceMovementTipo
  categoriaId?: number
  partnerId?: number
  dateFrom?: string
  dateTo?: string
}

export interface CreateCategoryInput {
  name: string
  appliesTo: FinanceCategoryAppliesTo
}

export interface AccountBalance {
  accountId: number
  accountName: string
  accountType: FinanceAccountType
  balance: number
  /** Suma de ingresos ya registrados en esta cuenta pero cuya fecha de acreditación todavía no llegó. */
  pendingAmount: number
  /** Fecha de acreditación más próxima entre los ingresos pendientes de esta cuenta (null si no hay pendientes). */
  nextAccreditationDate: string | null
}

export interface PendingAccreditation {
  movementId: number
  accountId: number
  accountName: string
  monto: number
  fecha: string
  fechaAcreditacion: string
  descripcion: string
}

export interface FinanceTransfer {
  id: number
  fromAccountId: number
  toAccountId: number
  monto: number
  descripcion: string | null
  fecha: string
  createdAt: string
}

export interface CreateTransferInput {
  fromAccountId: number
  toAccountId: number
  monto: number
  descripcion?: string | null
  fecha?: string
}

export interface TransferFilters {
  dateFrom?: string
  dateTo?: string
  accountId?: number
}

export interface CashFlowPoint {
  period: string
  ingresos: number
  egresos: number
  neto: number
}

export interface CategoryExpense {
  categoriaId: number | null
  categoriaName: string
  total: number
}

export interface PartnerEquity {
  partnerId: number
  partnerName: string
  ownershipPct: number
  utilidadAcumulada: number
  retirosRealizados: number
  saldoPendiente: number
}

// ── Comisiones de Mercado Pago (QR / Débito / Crédito / tienda web) y conciliación ──

/**
 * Medios de pago a los que Mercado Pago les cobra comisión: 'qr'/'debito'/'credito'
 * son el posnet físico; 'mercadopago' es la tienda online (Checkout Pro) — misma
 * cuenta destino (MP-Anabella) pero comisión y acreditación muy distintas.
 */
export type MpFeePaymentMethod = 'qr' | 'debito' | 'credito' | 'mercadopago'

export interface FinanceMpFeeRate {
  id: number
  paymentMethod: MpFeePaymentMethod
  /** % de comisión antes de IVA (ej: 0.8 = 0.8%). */
  pct: number
  /** % de IVA que se aplica sobre la comisión (ej: 21). */
  ivaPct: number
  /** Fecha desde la cual esta tasa está vigente (inclusive). */
  vigenteDesde: string
  createdAt: string
}

export interface CreateMpFeeRateInput {
  paymentMethod: MpFeePaymentMethod
  pct: number
  ivaPct?: number
  vigenteDesde?: string
}

export type MpReconciliationStatus = 'pending' | 'adjusted' | 'ignored'

export interface FinanceMpReconciliation {
  id: number
  saleId: number
  fecha: string
  paymentMethod: MpFeePaymentMethod
  brutoSistema: number
  comisionSistema: number
  brutoReal: number
  comisionReal: number
  netoReal: number
  /** (brutoSistema - comisionSistema) - netoReal. Positivo = el sistema sobreestimó el neto. */
  diferencia: number
  status: MpReconciliationStatus
  ajusteMovementId: number | null
  createdAt: string
  updatedAt: string
}

export interface SaveMpReconciliationInput {
  saleId: number
  brutoReal: number
  comisionReal: number
  netoReal: number
}

/** Una venta puntual (QR/Débito/Crédito/MP-Web) del día filtrado, con el
 *  cálculo automático de Ventas-Stock y la conciliación guardada, si existe. */
export interface MpReconciliationRow {
  saleId: number
  paymentMethod: MpFeePaymentMethod
  fecha: string
  customerName: string | null
  invoiceNumber: number | null
  total: number
  brutoSistema: number
  comisionSistema: number
  netoSistema: number
  reconciliation: FinanceMpReconciliation | null
}
