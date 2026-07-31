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
  partner_id: number | null
  supplier_id: number | null
  sale_id: number | null
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
   * Monto de apertura de la primera sesión de caja registrada — es plata física
   * que ya existía antes de empezar a llevar el control en Finanzas (no es una
   * venta ni un movimiento cargado), así que hay que sumarla una sola vez al
   * saldo de la cuenta Caja para que coincida con el total físico real.
   */
  getFirstCajaAperturaAmount(): number {
    const row = this.db
      .prepare('SELECT apertura_amount FROM cash_register_sessions ORDER BY session_date ASC LIMIT 1')
      .get() as { apertura_amount: number } | undefined
    return row?.apertura_amount ?? 0
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
           (account_id, tipo, categoria_id, monto, descripcion, fecha, partner_id, supplier_id, sale_id)
         VALUES
           (@accountId, @tipo, @categoriaId, @monto, @descripcion, @fecha, @partnerId, @supplierId, @saleId)`
      )
      .run({
        accountId: input.accountId,
        tipo: input.tipo,
        categoriaId: input.categoriaId ?? null,
        monto: input.monto,
        descripcion: input.descripcion,
        fecha: input.fecha ?? localToday(),
        partnerId: input.partnerId ?? null,
        supplierId: input.supplierId ?? null,
        saleId: input.saleId ?? null,
      })
    return result.lastInsertRowid as number
  }

  deleteMovement(id: number): void {
    this.db.prepare('DELETE FROM finance_movements WHERE id = ?').run(id)
  }

  // ── Agregados: finance_movements ──────────────────────────────────────────

  sumFinanceMovementsNet(accountId?: number, dateFrom?: string, dateTo?: string): number {
    const { where, params } = this.buildDateAccountFilter(accountId, dateFrom, dateTo)
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0) AS net
         FROM finance_movements ${where}`
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

  sumFinanceMovementsByPartner(categoriaId: number, partnerId: number): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(monto), 0) AS total FROM finance_movements
         WHERE tipo = 'egreso' AND categoria_id = @categoriaId AND partner_id = @partnerId`
      )
      .get({ categoriaId, partnerId }) as { total: number }
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
      partnerId: row.partner_id,
      supplierId: row.supplier_id,
      saleId: row.sale_id,
      createdAt: row.created_at,
    }
  }
}
