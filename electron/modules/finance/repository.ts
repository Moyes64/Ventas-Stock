import type { Database } from 'better-sqlite3'
import { localToday } from '../../lib/date'
import type {
  FinancePartner,
  FinanceAccount,
  FinanceCategory,
  FinanceMovement,
  CreateMovementInput,
  CreateCategoryInput,
  MovementFilters,
  FinanceCategoryAppliesTo,
  CashFlowPoint,
  CategoryExpense,
  PendingAccreditation,
  FinanceTransfer,
  CreateTransferInput,
  TransferFilters,
} from './types'

interface PartnerRow {
  id: number
  name: string
  ownership_pct: number
  active: number
  created_at: string
}

interface AccountRow {
  id: number
  name: string
  type: string
  active: number
  created_at: string
}

interface CategoryRow {
  id: number
  name: string
  applies_to: string
  active: number
}

interface MovementRow {
  id: number
  account_id: number
  tipo: string
  categoria_id: number | null
  monto: number
  descripcion: string
  fecha: string
  fecha_acreditacion: string | null
  partner_id: number | null
  supplier_id: number | null
  sale_id: number | null
  created_at: string
}

interface TransferRow {
  id: number
  from_account_id: number
  to_account_id: number
  monto: number
  descripcion: string | null
  fecha: string
  created_at: string
}

export class FinanceRepository {
  constructor(private readonly db: Database) {}

  // ── Catálogos ─────────────────────────────────────────────────────────────

  listPartners(): FinancePartner[] {
    return (
      this.db
        .prepare('SELECT * FROM finance_partners WHERE active = 1 ORDER BY ownership_pct DESC')
        .all() as PartnerRow[]
    ).map(r => this.mapPartner(r))
  }

  findPartnerById(id: number): FinancePartner | undefined {
    const row = this.db
      .prepare('SELECT * FROM finance_partners WHERE id = ?')
      .get(id) as PartnerRow | undefined
    return row ? this.mapPartner(row) : undefined
  }

  listAccounts(): FinanceAccount[] {
    return (
      this.db
        .prepare('SELECT * FROM finance_accounts WHERE active = 1 ORDER BY id ASC')
        .all() as AccountRow[]
    ).map(r => this.mapAccount(r))
  }

  findAccountById(id: number): FinanceAccount | undefined {
    const row = this.db
      .prepare('SELECT * FROM finance_accounts WHERE id = ?')
      .get(id) as AccountRow | undefined
    return row ? this.mapAccount(row) : undefined
  }

  findCashAccount(): FinanceAccount | undefined {
    const row = this.db
      .prepare("SELECT * FROM finance_accounts WHERE type = 'efectivo' AND active = 1 ORDER BY id ASC LIMIT 1")
      .get() as AccountRow | undefined
    return row ? this.mapAccount(row) : undefined
  }

/**
   * Punto de anclaje para calcular el saldo actual de Caja: el conteo físico
   * conocido más reciente (el cierre de la última sesión cerrada, o la apertura
   * de la sesión de hoy si todavía está abierta) — NO la primera sesión jamás
   * abierta. Usar la primera sesión rompía el saldo apenas había más de un día
   * de historial, porque acumulaba cualquier diferencia entre lo que Finanzas
   * calculaba en teoría y lo que en la práctica se contó/asentó cada cierre.
   */
  getLatestCajaAnchor(): { amount: number; date: string } | undefined {
    const row = this.db
      .prepare(
        `SELECT session_date, apertura_amount, cierre_amount, status
         FROM cash_register_sessions ORDER BY session_date DESC LIMIT 1`
      )
      .get() as { session_date: string; apertura_amount: number; cierre_amount: number | null; status: string } | undefined
    if (!row) return undefined

    const amount = row.status === 'closed' && row.cierre_amount !== null ? row.cierre_amount : row.apertura_amount
    // Si la sesión ya cerró, ese cierre ya incluye todo lo del día de esa sesión —
    // los movimientos a sumar arriba del ancla empiezan al día siguiente. Si sigue
    // abierta (es "hoy"), los movimientos de ese mismo día todavía hay que sumarlos.
    const date = row.status === 'closed' ? this.nextDay(row.session_date) : row.session_date
    return { amount, date }
  }

  private nextDay(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  }

  /** Fecha a partir de la cual arranca la contabilidad societaria (ver migración 020). */
  getFoundingDate(): string {
    const row = this.db
      .prepare('SELECT founding_date FROM finance_settings WHERE id = 1')
      .get() as { founding_date: string } | undefined
    return row?.founding_date ?? '2026-08-01'
  }

  findAccountByName(name: string): FinanceAccount | undefined {
    const row = this.db
      .prepare('SELECT * FROM finance_accounts WHERE name = ? AND active = 1')
      .get(name) as AccountRow | undefined
    return row ? this.mapAccount(row) : undefined
  }

  listCategories(appliesTo?: FinanceCategoryAppliesTo): FinanceCategory[] {
    const rows = appliesTo
      ? (this.db
          .prepare(
            "SELECT * FROM finance_categories WHERE active = 1 AND (applies_to = @appliesTo OR applies_to = 'ambos') ORDER BY name ASC"
          )
          .all({ appliesTo }) as CategoryRow[])
      : (this.db
          .prepare('SELECT * FROM finance_categories WHERE active = 1 ORDER BY name ASC')
          .all() as CategoryRow[])
    return rows.map(r => this.mapCategory(r))
  }

  findCategoryById(id: number): FinanceCategory | undefined {
    const row = this.db
      .prepare('SELECT * FROM finance_categories WHERE id = ?')
      .get(id) as CategoryRow | undefined
    return row ? this.mapCategory(row) : undefined
  }

  findCategoryByName(name: string): FinanceCategory | undefined {
    const row = this.db
      .prepare('SELECT * FROM finance_categories WHERE name = ?')
      .get(name) as CategoryRow | undefined
    return row ? this.mapCategory(row) : undefined
  }

  createCategory(input: CreateCategoryInput): number {
    const result = this.db
      .prepare('INSERT INTO finance_categories (name, applies_to) VALUES (@name, @appliesTo)')
      .run({ name: input.name, appliesTo: input.appliesTo })
    return result.lastInsertRowid as number
  }

  // ── Movimientos ───────────────────────────────────────────────────────────

  findMovementById(id: number): FinanceMovement | undefined {
    const row = this.db
      .prepare('SELECT * FROM finance_movements WHERE id = ?')
      .get(id) as MovementRow | undefined
    return row ? this.mapMovement(row) : undefined
  }

  findMovementBySaleId(saleId: number): FinanceMovement | undefined {
    const row = this.db
      .prepare('SELECT * FROM finance_movements WHERE sale_id = ?')
      .get(saleId) as MovementRow | undefined
    return row ? this.mapMovement(row) : undefined
  }

  listMovements(filters: MovementFilters = {}): FinanceMovement[] {
    const conditions: string[] = []
    const params: Record<string, unknown> = {}

    if (filters.accountId !== undefined) {
      conditions.push('account_id = @accountId')
      params.accountId = filters.accountId
    }
    if (filters.tipo !== undefined) {
      conditions.push('tipo = @tipo')
      params.tipo = filters.tipo
    }
    if (filters.categoriaId !== undefined) {
      conditions.push('categoria_id = @categoriaId')
      params.categoriaId = filters.categoriaId
    }
    if (filters.partnerId !== undefined) {
      conditions.push('partner_id = @partnerId')
      params.partnerId = filters.partnerId
    }
    if (filters.dateFrom !== undefined) {
      conditions.push('fecha >= @dateFrom')
      params.dateFrom = filters.dateFrom
    }
    if (filters.dateTo !== undefined) {
      conditions.push('fecha <= @dateTo')
      params.dateTo = filters.dateTo
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = this.db
      .prepare(`SELECT * FROM finance_movements ${where} ORDER BY fecha DESC, created_at DESC`)
      .all(params) as MovementRow[]
    return rows.map(r => this.mapMovement(r))
  }

  createMovement(input: CreateMovementInput): number {
    const result = this.db
      .prepare(
        `INSERT INTO finance_movements
           (account_id, tipo, categoria_id, monto, descripcion, fecha, fecha_acreditacion, partner_id, supplier_id, sale_id)
         VALUES
           (@accountId, @tipo, @categoriaId, @monto, @descripcion, @fecha, @fechaAcreditacion, @partnerId, @supplierId, @saleId)`
      )
      .run({
        accountId: input.accountId,
        tipo: input.tipo,
        categoriaId: input.categoriaId ?? null,
        monto: input.monto,
        descripcion: input.descripcion,
        fecha: input.fecha ?? localToday(),
        fechaAcreditacion: input.fechaAcreditacion ?? null,
        partnerId: input.partnerId ?? null,
        supplierId: input.supplierId ?? null,
        saleId: input.saleId ?? null,
      })
    return result.lastInsertRowid as number
  }

  deleteMovement(id: number): void {
    this.db.prepare('DELETE FROM finance_movements WHERE id = ?').run(id)
  }

  // ── Pendientes de acreditación ───────────────────────────────────────────

  /**
   * Ingresos cuya fecha de acreditación todavía no llegó (asOfDate por defecto: hoy).
   * Se listan individualmente porque cada uno puede acreditarse en una fecha distinta.
   */
  listPendingAccreditations(asOfDate: string, accountId?: number): PendingAccreditation[] {
    const conditions = [
      "tipo = 'ingreso'",
      'fecha_acreditacion IS NOT NULL',
      'fecha_acreditacion > @asOfDate',
    ]
    const params: Record<string, unknown> = { asOfDate }
    if (accountId !== undefined) {
      conditions.push('account_id = @accountId')
      params.accountId = accountId
    }
    const rows = this.db
      .prepare(
        `SELECT fm.id AS movementId, fm.account_id AS accountId, fa.name AS accountName,
                fm.monto AS monto, fm.fecha AS fecha, fm.fecha_acreditacion AS fechaAcreditacion,
                fm.descripcion AS descripcion
         FROM finance_movements fm
         JOIN finance_accounts fa ON fa.id = fm.account_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY fm.fecha_acreditacion ASC`
      )
      .all(params) as PendingAccreditation[]
    return rows
  }

  /** Actualiza la fecha de acreditación de un movimiento (acreditación manual anticipada). */
  accreditMovement(id: number, fecha: string): void {
    this.db.prepare('UPDATE finance_movements SET fecha_acreditacion = @fecha WHERE id = @id').run({ id, fecha })
  }

  /** Total pendiente y próxima fecha de acreditación de una cuenta puntual (asOfDate por defecto: hoy). */
  pendingAccreditationSummary(accountId: number, asOfDate: string): { pendingAmount: number; nextAccreditationDate: string | null } {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(monto), 0) AS pendingAmount, MIN(fecha_acreditacion) AS nextAccreditationDate
         FROM finance_movements
         WHERE tipo = 'ingreso' AND account_id = @accountId
           AND fecha_acreditacion IS NOT NULL AND fecha_acreditacion > @asOfDate`
      )
      .get({ accountId, asOfDate }) as { pendingAmount: number; nextAccreditationDate: string | null }
    return row
  }

  // ── Transferencias entre cuentas ─────────────────────────────────────────

  listTransfers(filters: TransferFilters = {}): FinanceTransfer[] {
    const conditions: string[] = []
    const params: Record<string, unknown> = {}
    if (filters.accountId !== undefined) {
      conditions.push('(from_account_id = @accountId OR to_account_id = @accountId)')
      params.accountId = filters.accountId
    }
    if (filters.dateFrom !== undefined) {
      conditions.push('fecha >= @dateFrom')
      params.dateFrom = filters.dateFrom
    }
    if (filters.dateTo !== undefined) {
      conditions.push('fecha <= @dateTo')
      params.dateTo = filters.dateTo
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = this.db
      .prepare(`SELECT * FROM finance_transfers ${where} ORDER BY fecha DESC, created_at DESC`)
      .all(params) as TransferRow[]
    return rows.map(r => this.mapTransfer(r))
  }

  findTransferById(id: number): FinanceTransfer | undefined {
    const row = this.db
      .prepare('SELECT * FROM finance_transfers WHERE id = ?')
      .get(id) as TransferRow | undefined
    return row ? this.mapTransfer(row) : undefined
  }

  createTransfer(input: CreateTransferInput): number {
    const result = this.db
      .prepare(
        `INSERT INTO finance_transfers (from_account_id, to_account_id, monto, descripcion, fecha)
         VALUES (@fromAccountId, @toAccountId, @monto, @descripcion, @fecha)`
      )
      .run({
        fromAccountId: input.fromAccountId,
        toAccountId: input.toAccountId,
        monto: input.monto,
        descripcion: input.descripcion ?? null,
        fecha: input.fecha ?? localToday(),
      })
    return result.lastInsertRowid as number
  }

  deleteTransfer(id: number): void {
    this.db.prepare('DELETE FROM finance_transfers WHERE id = ?').run(id)
  }

  /** Neto de transferencias (entradas - salidas) de una cuenta desde dateFrom. */
  sumTransfersNet(accountId: number, dateFrom?: string): number {
    const dateCondition = dateFrom !== undefined ? 'AND fecha >= @dateFrom' : ''
    const params: Record<string, unknown> = { accountId }
    if (dateFrom !== undefined) params.dateFrom = dateFrom
    const row = this.db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN to_account_id = @accountId THEN monto ELSE 0 END), 0) -
           COALESCE(SUM(CASE WHEN from_account_id = @accountId THEN monto ELSE 0 END), 0) AS net
         FROM finance_transfers
         WHERE (from_account_id = @accountId OR to_account_id = @accountId) ${dateCondition}`
      )
      .get(params) as { net: number }
    return row.net
  }

  // ── Agregados: finance_movements ──────────────────────────────────────────

  /**
   * Neto de movimientos (ingresos - egresos). Si se pasa asOfDate, los ingresos cuya
   * fecha_acreditacion todavía no llegó a esa fecha se excluyen del neto — todavía no
   * son saldo disponible, aunque ya estén registrados como movimiento.
   */
  sumFinanceMovementsNet(accountId?: number, dateFrom?: string, dateTo?: string, asOfDate?: string): number {
    const { where, params } = this.buildDateAccountFilter(accountId, dateFrom, dateTo)
    const conditions = where ? [where.replace(/^WHERE /, '')] : []
    if (asOfDate !== undefined) {
      conditions.push("(tipo = 'egreso' OR fecha_acreditacion IS NULL OR fecha_acreditacion <= @asOfDate)")
      params.asOfDate = asOfDate
    }
    const finalWhere = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0) AS net
         FROM finance_movements ${finalWhere}`
      )
      .get(params) as { net: number }
    return row.net
  }

  sumFinanceMovementsByTipo(
    tipo: 'ingreso' | 'egreso',
    accountId?: number,
    dateFrom?: string,
    dateTo?: string,
    excludeCategoriaId?: number
  ): number {
    const { where, params } = this.buildDateAccountFilter(accountId, dateFrom, dateTo)
    const conditions = where ? [where.replace(/^WHERE /, '')] : []
    conditions.push('tipo = @tipo')
    params.tipo = tipo
    if (excludeCategoriaId !== undefined) {
      conditions.push('(categoria_id IS NULL OR categoria_id != @excludeCategoriaId)')
      params.excludeCategoriaId = excludeCategoriaId
    }
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(monto), 0) AS total FROM finance_movements WHERE ${conditions.join(' AND ')}`
      )
      .get(params) as { total: number }
    return row.total
  }

  sumFinanceMovementsByPartner(categoriaId: number, partnerId: number, dateFrom?: string): number {
    const conditions = ["tipo = 'egreso'", 'categoria_id = @categoriaId', 'partner_id = @partnerId']
    const params: Record<string, unknown> = { categoriaId, partnerId }
    if (dateFrom !== undefined) {
      conditions.push('fecha >= @dateFrom')
      params.dateFrom = dateFrom
    }
    const row = this.db
      .prepare(`SELECT COALESCE(SUM(monto), 0) AS total FROM finance_movements WHERE ${conditions.join(' AND ')}`)
      .get(params) as { total: number }
    return row.total
  }

  cashFlowByFinanceMovements(dateFrom: string, dateTo: string, groupBy: 'day' | 'month', accountId?: number): CashFlowPoint[] {
    const periodExpr = groupBy === 'month' ? "strftime('%Y-%m', fecha)" : 'fecha'
    const conditions = ['fecha >= @dateFrom', 'fecha <= @dateTo']
    const params: Record<string, unknown> = { dateFrom, dateTo }
    if (accountId !== undefined) {
      conditions.push('account_id = @accountId')
      params.accountId = accountId
    }
    const rows = this.db
      .prepare(
        `SELECT ${periodExpr} AS period,
                COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE 0 END), 0) AS ingresos,
                COALESCE(SUM(CASE WHEN tipo = 'egreso' THEN monto ELSE 0 END), 0) AS egresos
         FROM finance_movements
         WHERE ${conditions.join(' AND ')}
         GROUP BY period`
      )
      .all(params) as Array<{ period: string; ingresos: number; egresos: number }>
    return rows.map(r => ({ period: r.period, ingresos: r.ingresos, egresos: r.egresos, neto: r.ingresos - r.egresos }))
  }

  expensesByCategory(dateFrom: string, dateTo: string, accountId?: number): CategoryExpense[] {
    const conditions = ["tipo = 'egreso'", 'fecha >= @dateFrom', 'fecha <= @dateTo']
    const params: Record<string, unknown> = { dateFrom, dateTo }
    if (accountId !== undefined) {
      conditions.push('account_id = @accountId')
      params.accountId = accountId
    }
    const rows = this.db
      .prepare(
        `SELECT fm.categoria_id AS categoriaId,
                COALESCE(fc.name, 'Sin categoría') AS categoriaName,
                COALESCE(SUM(fm.monto), 0) AS total
         FROM finance_movements fm
         LEFT JOIN finance_categories fc ON fc.id = fm.categoria_id
         WHERE ${conditions.join(' AND ')}
         GROUP BY fm.categoria_id, categoriaName
         ORDER BY total DESC`
      )
      .all(params) as Array<{ categoriaId: number | null; categoriaName: string; total: number }>
    return rows
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  private buildDateAccountFilter(
    accountId?: number,
    dateFrom?: string,
    dateTo?: string
  ): { where: string; params: Record<string, unknown> } {
    const conditions: string[] = []
    const params: Record<string, unknown> = {}
    if (accountId !== undefined) {
      conditions.push('account_id = @accountId')
      params.accountId = accountId
    }
    if (dateFrom !== undefined) {
      conditions.push('fecha >= @dateFrom')
      params.dateFrom = dateFrom
    }
    if (dateTo !== undefined) {
      conditions.push('fecha <= @dateTo')
      params.dateTo = dateTo
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    return { where, params }
  }

  private mapPartner(row: PartnerRow): FinancePartner {
    return {
      id: row.id,
      name: row.name,
      ownershipPct: row.ownership_pct,
      active: row.active === 1,
      createdAt: row.created_at,
    }
  }

  private mapAccount(row: AccountRow): FinanceAccount {
    return {
      id: row.id,
      name: row.name,
      type: row.type as FinanceAccount['type'],
      active: row.active === 1,
      createdAt: row.created_at,
    }
  }

  private mapCategory(row: CategoryRow): FinanceCategory {
    return {
      id: row.id,
      name: row.name,
      appliesTo: row.applies_to as FinanceCategory['appliesTo'],
      active: row.active === 1,
    }
  }

  private mapMovement(row: MovementRow): FinanceMovement {
    return {
      id: row.id,
      accountId: row.account_id,
      tipo: row.tipo as FinanceMovement['tipo'],
      categoriaId: row.categoria_id,
      monto: row.monto,
      descripcion: row.descripcion,
      fecha: row.fecha,
      fechaAcreditacion: row.fecha_acreditacion,
      partnerId: row.partner_id,
      supplierId: row.supplier_id,
      saleId: row.sale_id,
      createdAt: row.created_at,
    }
  }

  private mapTransfer(row: TransferRow): FinanceTransfer {
    return {
      id: row.id,
      fromAccountId: row.from_account_id,
      toAccountId: row.to_account_id,
      monto: row.monto,
      descripcion: row.descripcion,
      fecha: row.fecha,
      createdAt: row.created_at,
    }
  }
}
