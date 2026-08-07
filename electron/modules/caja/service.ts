import type { Database } from 'better-sqlite3'
import { CajaRepository } from './repository'
import { FinanceService } from '../finance/service'
import type { CashSession, CierreSummary, CreateSessionInput } from './types'

export class CajaService {
  private readonly repo: CajaRepository
  private readonly financeService: FinanceService

  constructor(db: Database) {
    this.repo = new CajaRepository(db)
    this.financeService = new FinanceService(db)
  }

  // ── Apertura ──────────────────────────────────────────────────────────────

  openSession(input: CreateSessionInput): CashSession {
    if (typeof input.aperturaAmount !== 'number' || input.aperturaAmount < 0) {
      throw new Error('El monto de apertura debe ser un número mayor o igual a cero')
    }
    if (!input.sessionDate) {
      throw new Error('La fecha de apertura es obligatoria')
    }

    // Verificar si ya existe sesión para la fecha solicitada
    const existing = this.repo.findSessionByDate(input.sessionDate)
    if (existing) {
      if (existing.status === 'open') {
        throw new Error(`Ya existe una apertura de caja abierta para la fecha ${input.sessionDate}`)
      }
      throw new Error(`Ya existe un cierre de caja para la fecha ${input.sessionDate}`)
    }

    // Verificar que el día anterior esté cerrado (salvo que sea el primer uso)
    const lastSession = this.repo.findLastSessionBefore(input.sessionDate)
    if (lastSession && lastSession.status === 'open') {
      throw new Error(
        `No se puede abrir la caja del ${input.sessionDate} porque la sesión del ${lastSession.sessionDate} aún está abierta. ` +
        `Realizá primero el cierre de esa jornada.`
      )
    }

    const id = this.repo.createSession(input)
    const session = this.repo.findSessionById(id)
    if (!session) throw new Error('Error al recuperar la sesión creada')
    return session
  }

  getOpenSession(): CashSession | undefined {
    return this.repo.findOpenSession()
  }

  getSessionByDate(date: string): CashSession | undefined {
    return this.repo.findSessionByDate(date)
  }

  listSessions(limit?: number): CashSession[] {
    return this.repo.listSessions(limit)
  }

  // ── Cierre ────────────────────────────────────────────────────────────────

  getCierreSummary(date: string): CierreSummary {
    const session = this.repo.findSessionByDate(date)
    if (!session) {
      throw new Error(`No hay apertura de caja para la fecha ${date}`)
    }

    const cajaAccount = this.financeService.getCashAccount()
    const allMovements = cajaAccount
      ? this.financeService.listMovements({ accountId: cajaAccount.id, dateFrom: date, dateTo: date })
      : []
    // Los movimientos generados automáticamente por una venta (saleId != null) ya
    // están contados en cashSalesTotal — solo los manuales entran en ingresos/egresos.
    const movements = allMovements.filter(m => m.saleId === null)
    const salesByMethod = this.repo.getSalesSummaryByPaymentMethod(date)

    // Transferencias entre cuentas que involucran a Caja ese día (dinero que
    // físicamente entró o salió de la caja pero no pasa por finance_movements).
    const transfers = cajaAccount
      ? this.financeService.listTransfers({ accountId: cajaAccount.id, dateFrom: date, dateTo: date })
      : []
    const transfersInTotal = transfers
      .filter(t => cajaAccount && t.toAccountId === cajaAccount.id)
      .reduce((sum, t) => sum + t.monto, 0)
    const transfersOutTotal = transfers
      .filter(t => cajaAccount && t.fromAccountId === cajaAccount.id)
      .reduce((sum, t) => sum + t.monto, 0)

    const cashSalesTotal = salesByMethod['contado_efectivo'] ?? 0
    const ingresosTotal = movements
      .filter(m => m.tipo === 'ingreso')
      .reduce((sum, m) => sum + m.monto, 0)
    const egresosTotal = movements
      .filter(m => m.tipo === 'egreso')
      .reduce((sum, m) => sum + m.monto, 0)
    const expectedTotal =
      session.aperturaAmount + cashSalesTotal + ingresosTotal - egresosTotal + transfersInTotal - transfersOutTotal

    return {
      session,
      aperturaAmount: session.aperturaAmount,
      cashSalesTotal,
      ingresosTotal,
      egresosTotal,
      transfersInTotal,
      transfersOutTotal,
      expectedTotal,
      salesByPaymentMethod: {
        contado_efectivo: salesByMethod['contado_efectivo'] ?? 0,
        transferencia: salesByMethod['transferencia'] ?? 0,
        debito: salesByMethod['debito'] ?? 0,
        credito: salesByMethod['credito'] ?? 0,
        qr: salesByMethod['qr'] ?? 0,
        mercadopago: salesByMethod['mercadopago'] ?? 0,
      },
      movements,
      transfers,
    }
  }

  closeSession(date: string, cierreAmount: number): CashSession {
    const session = this.repo.findSessionByDate(date)
    if (!session) throw new Error(`No hay apertura de caja para la fecha ${date}`)
    if (session.status === 'closed') throw new Error('La caja ya fue cerrada para ese día')
    if (typeof cierreAmount !== 'number' || cierreAmount < 0) {
      throw new Error('El monto de cierre debe ser un número mayor o igual a cero')
    }

    this.repo.closeSession(session.id, cierreAmount)
    const updated = this.repo.findSessionById(session.id)
    if (!updated) throw new Error('Error al recuperar la sesión cerrada')
    return updated
  }

  reopenSession(date: string): CashSession {
    const session = this.repo.findSessionByDate(date)
    if (!session) throw new Error(`No hay caja registrada para la fecha ${date}`)
    if (session.status === 'open') throw new Error('La caja ya está abierta para ese día')

    const lastSession = this.repo.findLastSession()
    if (!lastSession || lastSession.id !== session.id) {
      throw new Error(
        `Solo se puede reabrir el cierre más reciente. Existe una jornada posterior (${lastSession?.sessionDate}).`
      )
    }

    this.repo.reopenSession(session.id)
    const updated = this.repo.findSessionById(session.id)
    if (!updated) throw new Error('Error al recuperar la sesión reabierta')
    return updated
  }
}
