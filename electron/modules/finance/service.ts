import type { Database } from 'better-sqlite3'
import { localToday } from '../../lib/date'
import { FinanceRepository } from './repository'
import type {
  FinancePartner,
  FinanceAccount,
  FinanceCategory,
  FinanceMovement,
  CreateMovementInput,
  CreateCategoryInput,
  MovementFilters,
  FinanceCategoryAppliesTo,
  AccountBalance,
  CashFlowPoint,
  CategoryExpense,
  PartnerEquity,
  PendingAccreditation,
  FinanceTransfer,
  CreateTransferInput,
  TransferFilters,
} from './types'

const RETIRO_SOCIO_CATEGORIA = 'Retiro de Socio'
const VENTA_CATEGORIA = 'Venta'
const MP_ANABELLA_ACCOUNT_NAME = 'Mercado Pago - Anabella'
/** Medios de pago cuyo dinero se acredita en la cuenta MP-Anabella (posnet local, transferencias, web). */
const MP_ANABELLA_PAYMENT_METHODS = new Set(['transferencia', 'debito', 'credito', 'mercadopago'])

export class FinanceService {
  private readonly repo: FinanceRepository

  constructor(db: Database) {
    this.repo = new FinanceRepository(db)
  }

  // ── Catálogos ─────────────────────────────────────────────────────────────

  listPartners(): FinancePartner[] {
    return this.repo.listPartners()
  }

  listAccounts(): FinanceAccount[] {
    return this.repo.listAccounts()
  }

  /** La cuenta de tipo "efectivo" (Caja física del local). */
  getCashAccount(): FinanceAccount | undefined {
    return this.repo.findCashAccount()
  }

  /** Fecha a partir de la cual arranca la contabilidad societaria. */
  getFoundingDate(): string {
    return this.repo.getFoundingDate()
  }

  /** Nunca deja que una fecha "desde" quede antes de la fecha fundacional. */
  private clampDateFrom(dateFrom?: string): string {
    const foundingDate = this.repo.getFoundingDate()
    return dateFrom && dateFrom > foundingDate ? dateFrom : foundingDate
  }

  listCategories(appliesTo?: FinanceCategoryAppliesTo): FinanceCategory[] {
    return this.repo.listCategories(appliesTo)
  }

  createCategory(input: CreateCategoryInput): FinanceCategory {
    if (!input.name?.trim()) throw new Error('El nombre de la categoría es obligatorio')
    if (!['ingreso', 'egreso', 'ambos'].includes(input.appliesTo)) {
      throw new Error('El tipo de categoría debe ser "ingreso", "egreso" o "ambos"')
    }
    const id = this.repo.createCategory(input)
    const created = this.repo.findCategoryById(id)
    if (!created) throw new Error('Error al recuperar la categoría creada')
    return created
  }

  // ── Movimientos ───────────────────────────────────────────────────────────

  listMovements(filters?: MovementFilters): FinanceMovement[] {
    return this.repo.listMovements({
      ...filters,
      dateFrom: this.clampDateFrom(filters?.dateFrom),
    })
  }

  createMovement(input: CreateMovementInput): FinanceMovement {
    if (typeof input.monto !== 'number' || input.monto <= 0) {
      throw new Error('El monto debe ser un número mayor a cero')
    }
    if (!input.descripcion?.trim()) throw new Error('La descripción es obligatoria')
    if (input.tipo !== 'ingreso' && input.tipo !== 'egreso') {
      throw new Error('El tipo debe ser "ingreso" o "egreso"')
    }

    const foundingDate = this.repo.getFoundingDate()
    const fecha = input.fecha ?? localToday()
    if (fecha < foundingDate) {
      throw new Error(
        `No se pueden cargar movimientos anteriores al ${foundingDate} — la contabilidad de Finanzas arranca esa fecha.`
      )
    }
    if (input.fechaAcreditacion && input.fechaAcreditacion < fecha) {
      throw new Error('La fecha de acreditación no puede ser anterior a la fecha del movimiento')
    }
    if (input.fechaAcreditacion && input.tipo !== 'ingreso') {
      throw new Error('La fecha de acreditación solo aplica a movimientos de ingreso')
    }

    const account = this.repo.findAccountById(input.accountId)
    if (!account) throw new Error(`La cuenta ${input.accountId} no existe`)

    let categoria = null as ReturnType<FinanceRepository['findCategoryById']>
    if (input.categoriaId !== undefined && input.categoriaId !== null) {
      categoria = this.repo.findCategoryById(input.categoriaId)
      if (!categoria) throw new Error(`La categoría ${input.categoriaId} no existe`)
      if (categoria.appliesTo !== 'ambos' && categoria.appliesTo !== input.tipo) {
        throw new Error(`La categoría "${categoria.name}" no aplica a movimientos de tipo "${input.tipo}"`)
      }
    }

    if (categoria?.name === RETIRO_SOCIO_CATEGORIA && !input.partnerId) {
      throw new Error('Debés indicar el socio para un retiro de socio')
    }
    if (input.partnerId) {
      const partner = this.repo.findPartnerById(input.partnerId)
      if (!partner) throw new Error(`El socio ${input.partnerId} no existe`)
    }

    const id = this.repo.createMovement(input)
    const created = this.repo.findMovementById(id)
    if (!created) throw new Error('Error al recuperar el movimiento creado')
    return created
  }

  deleteMovement(id: number): void {
    const existing = this.repo.findMovementById(id)
    if (!existing) throw new Error(`Movimiento no encontrado: ${id}`)
    if (existing.saleId !== null) {
      throw new Error(
        'Este movimiento se generó automáticamente desde una venta. Para revertirlo, cancelá la venta en el módulo de Ventas.'
      )
    }
    this.repo.deleteMovement(id)
  }

  /** Ingresos registrados cuya fecha de acreditación todavía no llegó (hoy como referencia). */
  getPendingAccreditations(accountId?: number): PendingAccreditation[] {
    return this.repo.listPendingAccreditations(localToday(), accountId)
  }

  /**
   * Marca manualmente un ingreso pendiente como acreditado en una fecha puntual
   * (por defecto hoy) — útil cuando la plata llega antes de la fecha estimada al
   * cargar el movimiento (ej: Mercado Pago acredita un par de días antes). Solo
   * permite adelantar la fecha, nunca postergarla más allá de lo ya indicado.
   */
  accreditMovement(movementId: number, fecha?: string): FinanceMovement {
    const movement = this.repo.findMovementById(movementId)
    if (!movement) throw new Error(`Movimiento no encontrado: ${movementId}`)
    if (movement.tipo !== 'ingreso') {
      throw new Error('Solo los ingresos pueden tener fecha de acreditación')
    }
    if (!movement.fechaAcreditacion) {
      throw new Error('Este movimiento no tiene una acreditación pendiente')
    }

    const nuevaFecha = fecha ?? localToday()
    if (nuevaFecha < movement.fecha) {
      throw new Error('La fecha de acreditación no puede ser anterior a la fecha del movimiento')
    }
    if (nuevaFecha > movement.fechaAcreditacion) {
      throw new Error('La acreditación manual solo permite adelantar la fecha, no postergarla')
    }

    this.repo.accreditMovement(movementId, nuevaFecha)
    const updated = this.repo.findMovementById(movementId)
    if (!updated) throw new Error('Error al recuperar el movimiento actualizado')
    return updated
  }

  // ── Transferencias entre cuentas ─────────────────────────────────────────

  listTransfers(filters?: TransferFilters): FinanceTransfer[] {
    return this.repo.listTransfers({
      ...filters,
      dateFrom: filters?.dateFrom !== undefined ? this.clampDateFrom(filters.dateFrom) : undefined,
    })
  }

  createTransfer(input: CreateTransferInput): FinanceTransfer {
    if (typeof input.monto !== 'number' || input.monto <= 0) {
      throw new Error('El monto debe ser un número mayor a cero')
    }
    if (input.fromAccountId === input.toAccountId) {
      throw new Error('La cuenta de origen y destino no pueden ser la misma')
    }
    const fromAccount = this.repo.findAccountById(input.fromAccountId)
    if (!fromAccount) throw new Error(`La cuenta de origen ${input.fromAccountId} no existe`)
    const toAccount = this.repo.findAccountById(input.toAccountId)
    if (!toAccount) throw new Error(`La cuenta de destino ${input.toAccountId} no existe`)

    const foundingDate = this.repo.getFoundingDate()
    const fecha = input.fecha ?? localToday()
    if (fecha < foundingDate) {
      throw new Error(
        `No se pueden cargar transferencias anteriores al ${foundingDate} — la contabilidad de Finanzas arranca esa fecha.`
      )
    }

    const id = this.repo.createTransfer(input)
    const created = this.repo.findTransferById(id)
    if (!created) throw new Error('Error al recuperar la transferencia creada')
    return created
  }

  deleteTransfer(id: number): void {
    const existing = this.repo.findTransferById(id)
    if (!existing) throw new Error(`Transferencia no encontrada: ${id}`)
    this.repo.deleteTransfer(id)
  }

  // ── Ventas (auto-generación de ingresos) ───────────────────────────────────

  /**
   * Registra automáticamente el ingreso en la cuenta correspondiente cuando se
   * cobra una venta: Caja para efectivo, MP-Anabella para posnet/transferencia/web.
   * No-op para crédito de cliente (consumo de un crédito ya existente, no dinero nuevo)
   * o cualquier otro medio no mapeado.
   */
  registerSaleIncome(input: {
    saleId: number
    paymentMethod: string
    monto: number
    fecha: string
  }): FinanceMovement | null {
    let account: FinanceAccount | undefined
    if (input.paymentMethod === 'contado_efectivo') {
      account = this.repo.findCashAccount()
    } else if (MP_ANABELLA_PAYMENT_METHODS.has(input.paymentMethod)) {
      account = this.repo.findAccountByName(MP_ANABELLA_ACCOUNT_NAME)
    } else {
      return null
    }
    if (!account) return null
    const categoria = this.repo.findCategoryByName(VENTA_CATEGORIA)

    const id = this.repo.createMovement({
      accountId: account.id,
      tipo: 'ingreso',
      categoriaId: categoria?.id ?? null,
      monto: input.monto,
      descripcion: `Venta #${input.saleId}`,
      fecha: input.fecha,
      saleId: input.saleId,
    })
    return this.repo.findMovementById(id) ?? null
  }

  /** Revierte (elimina) el ingreso auto-generado por una venta, si existe. */
  reverseSaleIncome(saleId: number): void {
    const movement = this.repo.findMovementBySaleId(saleId)
    if (movement) this.repo.deleteMovement(movement.id)
  }

  // ── Reportes ──────────────────────────────────────────────────────────────

  getAccountBalances(): AccountBalance[] {
    const accounts = this.repo.listAccounts()
    const cashAccount = this.repo.findCashAccount()
    const foundingDate = this.repo.getFoundingDate()
    const today = localToday()

    return accounts.map(account => {
      let balance: number
      if (cashAccount && account.id === cashAccount.id) {
        const anchor = this.repo.getLatestCajaAnchor()
        balance = anchor && anchor.date >= foundingDate
          ? anchor.amount + this.repo.sumFinanceMovementsNet(account.id, anchor.date, undefined, today)
          : this.repo.sumFinanceMovementsNet(account.id, foundingDate, undefined, today)
      } else {
        balance = this.repo.sumFinanceMovementsNet(account.id, foundingDate, undefined, today)
      }
      balance += this.repo.sumTransfersNet(account.id, foundingDate)

      const { pendingAmount, nextAccreditationDate } = this.repo.pendingAccreditationSummary(account.id, today)
      return {
        accountId: account.id,
        accountName: account.name,
        accountType: account.type,
        balance,
        pendingAmount,
        nextAccreditationDate,
      }
    })
  }

  getCashFlowSummary(dateFrom: string, dateTo: string, groupBy: 'day' | 'month' = 'month', accountId?: number): CashFlowPoint[] {
    return this.repo
      .cashFlowByFinanceMovements(this.clampDateFrom(dateFrom), dateTo, groupBy, accountId)
      .sort((a, b) => a.period.localeCompare(b.period))
  }

  getExpensesByCategory(dateFrom: string, dateTo: string, accountId?: number): CategoryExpense[] {
    return this.repo.expensesByCategory(this.clampDateFrom(dateFrom), dateTo, accountId)
  }

  getPartnersEquity(): PartnerEquity[] {
    const partners = this.repo.listPartners()
    const retiroCategoria = this.repo.findCategoryByName(RETIRO_SOCIO_CATEGORIA)
    const foundingDate = this.repo.getFoundingDate()

    // Nota: el monto de apertura inicial de Caja no entra acá — es plata que ya
    // existía, no utilidad generada por el negocio.
    const totalIngresos = this.repo.sumFinanceMovementsByTipo('ingreso', undefined, foundingDate)
    const totalEgresosSinRetiros = retiroCategoria
      ? this.repo.sumFinanceMovementsByTipo('egreso', undefined, foundingDate, undefined, retiroCategoria.id)
      : this.repo.sumFinanceMovementsByTipo('egreso', undefined, foundingDate)

    const utilidadNetaTotal = totalIngresos - totalEgresosSinRetiros

    return partners.map(partner => {
      const utilidadAcumulada = (partner.ownershipPct / 100) * utilidadNetaTotal
      const retirosRealizados = retiroCategoria
        ? this.repo.sumFinanceMovementsByPartner(retiroCategoria.id, partner.id, foundingDate)
        : 0
      return {
        partnerId: partner.id,
        partnerName: partner.name,
        ownershipPct: partner.ownershipPct,
        utilidadAcumulada,
        retirosRealizados,
        saldoPendiente: utilidadAcumulada - retirosRealizados,
      }
    })
  }
}
