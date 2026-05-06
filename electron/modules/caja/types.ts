export type PaymentMethod = 'contado_efectivo' | 'transferencia' | 'debito' | 'credito'
export type SessionStatus = 'open' | 'closed'
export type MovimientoTipo = 'ingreso' | 'egreso'

export interface CashSession {
  id: number
  sessionDate: string
  aperturaAmount: number
  cierreAmount: number | null
  status: SessionStatus
  createdAt: string
  updatedAt: string
}

export interface CashMovement {
  id: number
  sessionId: number | null
  descripcion: string
  tipo: MovimientoTipo
  monto: number
  movimientoDate: string
  createdAt: string
}

export interface CierreSummary {
  session: CashSession
  aperturaAmount: number
  cashSalesTotal: number
  ingresosTotal: number
  egresosTotal: number
  expectedTotal: number
  // Payment method breakdown for all sales of the day
  salesByPaymentMethod: {
    contado_efectivo: number
    transferencia: number
    debito: number
    credito: number
  }
  movements: CashMovement[]
}

export interface CreateSessionInput {
  sessionDate: string
  aperturaAmount: number
}

export interface CreateMovementInput {
  descripcion: string
  tipo: MovimientoTipo
  monto: number
  movimientoDate?: string
}
