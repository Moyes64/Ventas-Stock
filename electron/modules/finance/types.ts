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
