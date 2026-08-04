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
