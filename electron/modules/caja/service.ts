import type { Database } from 'better-sqlite3'
import { CajaRepository } from './repository'
import type {
  CashSession,
  CashMovement,
  CierreSummary,
  CreateSessionInput,
  CreateMovementInput,
} from './types'

export class CajaService {
  private readonly repo: CajaRepository

  constructor(db: Database) {
    this.repo = new CajaRepository(db)
  }

  // ── Apertura ──────────────────────────────────────────────────────────────

  openSession(input: CreateSessionInput): CashSession {
    if (typeof input.aperturaAmount !== 'number' || input.aperturaAmount < 0) {
      throw new Error('El monto de apertura debe ser un número mayor o igual a cero')
    }
    if (!input.sessionDate) {
      throw new Error('La fecha de apertura es obligatoria')
    }

    const existing = this.repo.findSessionByDate(input.sessionDate)
    if (existing) {
      if (existing.status === 'open') {
        throw new Error(`Ya existe una apertura de caja abierta para la fecha ${input.sessionDate}`)
      }
      throw new Error(`Ya existe un cierre de caja para la fecha ${input.sessionDate}`)
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

    const movements = this.repo.listMovementsByDate(date)
    const salesByMethod = this.repo.getSalesSummaryByPaymentMethod(date)

    const cashSalesTotal = salesByMethod['contado_efectivo'] ?? 0
    const ingresosTotal = movements
      .filter(m => m.tipo === 'ingreso')
      .reduce((sum, m) => sum + m.monto, 0)
    const egresosTotal = movements
      .filter(m => m.tipo === 'egreso')
      .reduce((sum, m) => sum + m.monto, 0)
    const expectedTotal = session.aperturaAmount + cashSalesTotal + ingresosTotal - egresosTotal

    return {
      session,
      aperturaAmount: session.aperturaAmount,
      cashSalesTotal,
      ingresosTotal,
      egresosTotal,
      expectedTotal,
      salesByPaymentMethod: {
        contado_efectivo: salesByMethod['contado_efectivo'] ?? 0,
        transferencia: salesByMethod['transferencia'] ?? 0,
        debito: salesByMethod['debito'] ?? 0,
        credito: salesByMethod['credito'] ?? 0,
      },
      movements,
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

  // ── Movimientos ───────────────────────────────────────────────────────────

  listMovements(date: string): CashMovement[] {
    return this.repo.listMovementsByDate(date)
  }

  createMovement(input: CreateMovementInput): CashMovement {
    if (!input.descripcion?.trim()) throw new Error('La descripción es obligatoria')
    if (input.tipo !== 'ingreso' && input.tipo !== 'egreso') {
      throw new Error('El tipo debe ser "ingreso" o "egreso"')
    }
    if (typeof input.monto !== 'number' || input.monto <= 0) {
      throw new Error('El monto debe ser un número mayor a cero')
    }

    const date = input.movimientoDate ?? new Date().toISOString().slice(0, 10)
    const session = this.repo.findSessionByDate(date)

    const id = this.repo.createMovement(input, session?.id ?? null)
    const created = this.repo.findMovementById(id)
    if (!created) throw new Error('Error al recuperar el movimiento creado')
    return created
  }

  deleteMovement(id: number): void {
    const existing = this.repo.findMovementById(id)
    if (!existing) throw new Error(`Movimiento no encontrado: ${id}`)
    this.repo.deleteMovement(id)
  }
}
