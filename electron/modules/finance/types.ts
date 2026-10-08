export type FinanceMovementTipo = 'ingreso' | 'egreso'
/** 'socios' = cuenta especial para lo que pasa fuera de las cuentas de Pandora
 *  (pagos directos de un socio, compensaciones entre socios): siempre suma cero. */
export type FinanceAccountType = 'efectivo' | 'mercadopago' | 'banco' | 'socios'
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
  /** Pierna de pago (sale_payments.id) que originó este movimiento, cuando la
   *  venta se cobró con más de un medio. null en ventas de un solo medio y en
   *  movimientos que no vienen de una venta. */
  salePaymentId: number | null
  /** Solo en devoluciones ("Devolución de Préstamo" / "Devolución de Aporte"):
   *  el préstamo o aporte original que esta devolución cancela (total o parcialmente). */
  relatedMovementId: number | null
  /** Solo en operaciones de socios fuera de Pandora (pago directo / compensación):
   *  la otra mitad del par ingreso + egreso. Se borran juntas. */
  pairMovementId: number | null
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
  salePaymentId?: number | null
  relatedMovementId?: number | null
}

/** Un socio paga de su bolsillo un gasto del negocio (típicamente un proveedor). */
export interface CreatePartnerDirectPaymentInput {
  partnerId: number
  /** Categoría del gasto (egreso), ej. "Pago a Proveedores". */
  categoriaId: number
  supplierId?: number | null
  monto: number
  descripcion: string
  fecha?: string
}

/** Un socio le paga a otro, por fuera de Pandora, parte de un aporte pendiente. */
export interface CreatePartnerCompensationInput {
  /** El "Aporte de Socio" pendiente que se compensa. */
  aporteMovementId: number
  /** Socio que paga y pasa a ser acreedor de Pandora por ese monto. */
  toPartnerId: number
  monto: number
  descripcion?: string
  fecha?: string
}

/** Las dos mitades de una operación de socios fuera de Pandora. */
export interface PartnerOperationResult {
  ingreso: FinanceMovement
  egreso: FinanceMovement
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
  /** Préstamos del negocio al socio todavía no devueltos (lo que el socio le debe al negocio). */
  prestamosPendientes: number
  /** Total aportado por el socio desde la fecha fundacional. */
  aportesRealizados: number
  /** Aportes que el negocio todavía no le devolvió al socio (lo que el negocio le debe al socio). */
  aportesPendientes: number
}

export type PartnerLoanKind = 'prestamo' | 'aporte'

/**
 * Un préstamo a socio o un aporte de socio, con lo devuelto hasta ahora.
 * saldo = monto − devuelto; saldo 0 = cancelado.
 */
export interface PartnerLoan {
  movementId: number
  kind: PartnerLoanKind
  partnerId: number | null
  partnerName: string | null
  accountId: number
  fecha: string
  descripcion: string
  monto: number
  devuelto: number
  saldo: number
}

// ── Comisiones de Mercado Pago (QR / Débito / Crédito / tienda web) y conciliación ──

/**
 * Medios de pago a los que Mercado Pago les cobra comisión: 'qr'/'debito'/'credito'
 * son el posnet físico; 'mercadopago' es la tienda online (Checkout Pro) — misma
 * cuenta destino (MP-Anabella) pero comisión y acreditación muy distintas.
 */
export type MpFeePaymentMethod = 'qr' | 'debito' | 'credito' | 'mercadopago'

/**
 * Medios de pago del posnet FISERV. El cobro queda en una cuenta de FISERV y se
 * transfiere a MP-Anabella pasado 1 día hábil; cada modalidad tiene su arancel.
 */
export type FiservPaymentMethod =
  | 'fiserv_qr'
  | 'fiserv_debito'
  | 'fiserv_credito_1'
  | 'fiserv_credito_2'
  | 'fiserv_credito_3'

/** Todo medio de pago con comisión versionada en finance_mp_fee_rates (MP + FISERV). */
export type FeePaymentMethod = MpFeePaymentMethod | FiservPaymentMethod

export interface FinanceMpFeeRate {
  id: number
  paymentMethod: FeePaymentMethod
  /** % de comisión antes de IVA (ej: 0.8 = 0.8%). */
  pct: number
  /** % de IVA que se aplica sobre la comisión (ej: 21). */
  ivaPct: number
  /** Fecha desde la cual esta tasa está vigente (inclusive). */
  vigenteDesde: string
  createdAt: string
}

export interface CreateMpFeeRateInput {
  paymentMethod: FeePaymentMethod
  pct: number
  ivaPct?: number
  vigenteDesde?: string
}

export type MpReconciliationStatus = 'pending' | 'adjusted' | 'ignored'

export interface FinanceMpReconciliation {
  id: number
  saleId: number
  /** Pierna de pago conciliada (sale_payments.id) -- una venta combinada con
   *  dos medios con comisión MP tiene una fila de conciliación por pierna. */
  salePaymentId: number
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
  salePaymentId: number
  brutoReal: number
  comisionReal: number
  netoReal: number
}

/** Una pierna de pago (QR/Débito/Crédito/MP-Web) del día filtrado, con el
 *  cálculo automático de Ventas-Stock y la conciliación guardada, si existe.
 *  Una venta combinada con dos medios con comisión aporta dos filas acá. */
export interface MpReconciliationRow {
  saleId: number
  salePaymentId: number
  paymentMethod: MpFeePaymentMethod
  fecha: string
  customerName: string | null
  invoiceNumber: number | null
  /** Monto de esta pierna (no el total de la venta, si la venta es combinada). */
  total: number
  brutoSistema: number
  comisionSistema: number
  netoSistema: number
  reconciliation: FinanceMpReconciliation | null
}
