import type { FinanceMovement } from '../finance/types'

export type PaymentMethod = 'contado_efectivo' | 'transferencia' | 'debito' | 'credito'
export type SessionStatus = 'open' | 'closed'

export interface CashSession {
  id: number
  sessionDate: string
  aperturaAmount: number
  cierreAmount: number | null
  status: SessionStatus
  createdAt: string
  updatedAt: string
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
  // Movimientos de la cuenta Caja del día (cargados desde el módulo de Finanzas)
  movements: FinanceMovement[]
}

export interface CreateSessionInput {
  sessionDate: string
  aperturaAmount: number
}
