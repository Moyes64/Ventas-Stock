import type { Database } from 'better-sqlite3'
import type { CashSession, CreateSessionInput } from './types'

interface SessionRow {
  id: number
  session_date: string
  apertura_amount: number
  cierre_amount: number | null
  status: string
  created_at: string
  updated_at: string
}

export class CajaRepository {
  constructor(private readonly db: Database) {}

  // ── Sessions ──────────────────────────────────────────────────────────────

  findSessionById(id: number): CashSession | undefined {
    const row = this.db
      .prepare('SELECT * FROM cash_register_sessions WHERE id = ?')
      .get(id) as SessionRow | undefined
    return row ? this.mapSession(row) : undefined
  }

  findSessionByDate(date: string): CashSession | undefined {
    const row = this.db
      .prepare('SELECT * FROM cash_register_sessions WHERE session_date = ?')
      .get(date) as SessionRow | undefined
    return row ? this.mapSession(row) : undefined
  }

  findLastSessionBefore(date: string): CashSession | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM cash_register_sessions
         WHERE session_date < ?
         ORDER BY session_date DESC LIMIT 1`
      )
      .get(date) as SessionRow | undefined
    return row ? this.mapSession(row) : undefined
  }

  findOpenSession(): CashSession | undefined {
    const row = this.db
      .prepare("SELECT * FROM cash_register_sessions WHERE status = 'open' ORDER BY session_date DESC LIMIT 1")
      .get() as SessionRow | undefined
    return row ? this.mapSession(row) : undefined
  }

  listSessions(limit = 30): CashSession[] {
    return (
      this.db
        .prepare('SELECT * FROM cash_register_sessions ORDER BY session_date DESC LIMIT ?')
        .all(limit) as SessionRow[]
    ).map(r => this.mapSession(r))
  }

  createSession(data: CreateSessionInput): number {
    const result = this.db
      .prepare(
        `INSERT INTO cash_register_sessions (session_date, apertura_amount)
         VALUES (@sessionDate, @aperturaAmount)`
      )
      .run({ sessionDate: data.sessionDate, aperturaAmount: data.aperturaAmount })
    return result.lastInsertRowid as number
  }

  closeSession(id: number, cierreAmount: number): void {
    this.db
      .prepare(
        `UPDATE cash_register_sessions
         SET status = 'closed', cierre_amount = @cierreAmount, updated_at = datetime('now')
         WHERE id = @id`
      )
      .run({ id, cierreAmount })
  }

  reopenSession(id: number): void {
    this.db
      .prepare(
        `UPDATE cash_register_sessions
         SET status = 'open', cierre_amount = NULL, updated_at = datetime('now')
         WHERE id = @id`
      )
      .run({ id })
  }

  findLastSession(): CashSession | undefined {
    const row = this.db
      .prepare('SELECT * FROM cash_register_sessions ORDER BY session_date DESC LIMIT 1')
      .get() as SessionRow | undefined
    return row ? this.mapSession(row) : undefined
  }

  // ── Sales summary by payment method ───────────────────────────────────────

  getSalesSummaryByPaymentMethod(date: string): Record<string, number> {
    const rows = this.db
      .prepare(
        `SELECT payment_method, COALESCE(SUM(total), 0) AS total_amount
         FROM sales
         WHERE sale_date = ? AND status != 'CANCELLED'
         GROUP BY payment_method`
      )
      .all(date) as Array<{ payment_method: string; total_amount: number }>

    const result: Record<string, number> = {
      contado_efectivo: 0,
      transferencia: 0,
      debito: 0,
      credito: 0,
    }
    for (const row of rows) {
      result[row.payment_method] = row.total_amount
    }
    return result
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private mapSession(row: SessionRow): CashSession {
    return {
      id: row.id,
      sessionDate: row.session_date,
      aperturaAmount: row.apertura_amount,
      cierreAmount: row.cierre_amount,
      status: row.status as 'open' | 'closed',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
