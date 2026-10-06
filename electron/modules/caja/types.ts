import type { FinanceMovement, FinanceTransfer } from '../finance/types'

export type PaymentMethod =
  | 'contado_efectivo' | 'transferencia' | 'debito' | 'credito' | 'qr' | 'mercadopago'
  | 'fiserv_qr' | 'fiserv_debito' | 'fiserv_credito_1' | 'fiserv_credito_2' | 'fiserv_credito_3'
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
  /** Transferencias entre cuentas que ingresaron dinero a Caja ese día. */
  transfersInTotal: number
  /** Transferencias entre cuentas que sacaron dinero de Caja ese día. */
  transfersOutTotal: number
  expectedTotal: number
  // Payment method breakdown for all sales of the day
  salesByPaymentMethod: {
    contado_efectivo: number
    transferencia: number
    debito: number
    credito: number
    qr: number
    mercadopago: number
    fiserv_qr: number
    fiserv_debito: number
    fiserv_credito_1: number
    fiserv_credito_2: number
    fiserv_credito_3: number
  }
  /** Diferencias cobradas en cambios (con/sin ticket) del día, por medio de pago.
   *  Solo los medios con monto; no están incluidas en salesByPaymentMethod. Las
   *  cobradas en efectivo ya cuentan en ingresosTotal (generan un movimiento en Caja). */
  exchangeDifferencesByPaymentMethod: Record<string, number>
  // Movimientos de la cuenta Caja del día (cargados desde el módulo de Finanzas)
  movements: FinanceMovement[]
  // Transferencias entre cuentas de la cuenta Caja del día
  transfers: FinanceTransfer[]
}

export interface CreateSessionInput {
  sessionDate: string
  aperturaAmount: number
}
