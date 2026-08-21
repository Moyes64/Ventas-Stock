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
  MpFeePaymentMethod,
  FinanceMpFeeRate,
  CreateMpFeeRateInput,
  FinanceMpReconciliation,
  SaveMpReconciliationInput,
  MpReconciliationRow,
} from './types'

const RETIRO_SOCIO_CATEGORIA = 'Retiro de Socio'
const VENTA_CATEGORIA = 'Venta'
const COMISION_MP_CATEGORIA = 'Comisión Mercado Pago'
const AJUSTE_CONCILIACION_CATEGORIA = 'Ajuste Conciliación MP'
const MP_ANABELLA_ACCOUNT_NAME = 'Mercado Pago - Anabella'
/** Medios de pago cuyo dinero se acredita en la cuenta MP-Anabella (posnet local, transferencias, web). */
const MP_ANABELLA_PAYMENT_METHODS = new Set(['transferencia', 'debito', 'credito', 'mercadopago', 'qr'])
/** Medios de pago a los que Mercado Pago les cobra comisión: posnet físico (QR/tarjeta) + tienda web. */
const MP_FEE_METHODS: MpFeePaymentMethod[] = ['qr', 'debito', 'credito', 'mercadopago']
const MP_FEE_PAYMENT_METHODS = new Set<MpFeePaymentMethod>(MP_FEE_METHODS)

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

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
   *
   * Para QR/Débito/Crédito, además del ingreso bruto por la venta, registra un
   * segundo movimiento (egreso) por la comisión que cobra Mercado Pago, según la
   * tasa vigente a la fecha de la venta — ver `registerMpFeeForSale`.
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

    if (MP_FEE_PAYMENT_METHODS.has(input.paymentMethod as MpFeePaymentMethod)) {
      this.registerMpFeeForSale(
        input.saleId,
        input.paymentMethod as MpFeePaymentMethod,
        input.monto,
        input.fecha,
        account.id
      )
    }

    return this.repo.findMovementById(id) ?? null
  }

  /**
   * Descuenta la comisión de Mercado Pago (% + IVA, según la tasa vigente el
   * día de la venta) como un egreso separado en la misma cuenta — visible en
   * "Gastos por categoría" y vinculado a la venta (se borra junto con el
   * ingreso si la venta se cancela o se reclasifica). No hace nada si todavía
   * no hay una tasa configurada para ese medio de pago (mejor no descontar
   * nada que asumir un % incorrecto).
   */
  private registerMpFeeForSale(
    saleId: number,
    paymentMethod: MpFeePaymentMethod,
    monto: number,
    fecha: string,
    accountId: number
  ): void {
    const rate = this.repo.findEffectiveMpFeeRate(paymentMethod, fecha)
    if (!rate) return
    const comision = round2(monto * (rate.pct / 100) * (1 + rate.ivaPct / 100))
    if (comision <= 0) return

    const categoria = this.repo.findCategoryByName(COMISION_MP_CATEGORIA)
    this.repo.createMovement({
      accountId,
      tipo: 'egreso',
      categoriaId: categoria?.id ?? null,
      monto: comision,
      descripcion: `Comisión MP (${paymentMethod.toUpperCase()}) - Venta #${saleId}`,
      fecha,
      saleId,
    })
  }

  /** Revierte (elimina) el ingreso y la comisión MP auto-generados por una venta, si existen. */
  reverseSaleIncome(saleId: number): void {
    for (const movement of this.repo.listMovementsBySaleId(saleId)) {
      this.repo.deleteMovement(movement.id)
    }
  }

  // ── Reportes ──────────────────────────────────────────────────────────────

  getAccountBalances(): AccountBalance[] {
    const accounts = this.repo.listAccounts()
    const cashAccount = this.repo.findCashAccount()
    const foundingDate = this.repo.getFoundingDate()
    const today = localToday()

    return accounts.map(account => {
      let balance: number
      // Para Caja, las transferencias deben sumarse desde la misma fecha que el
      // anchor (no desde foundingDate): el anchor (apertura/cierre físico) ya
      // refleja el efecto de cualquier transferencia anterior a esa fecha —
      // sumarlas de nuevo desde foundingDate las contaba dos veces.
      let transfersFrom = foundingDate
      if (cashAccount && account.id === cashAccount.id) {
        const anchor = this.repo.getLatestCajaAnchor()
        if (anchor && anchor.date >= foundingDate) {
          balance = anchor.amount + this.repo.sumFinanceMovementsNet(account.id, anchor.date, undefined, today)
          transfersFrom = anchor.date
        } else {
          balance = this.repo.sumFinanceMovementsNet(account.id, foundingDate, undefined, today)
        }
      } else {
        balance = this.repo.sumFinanceMovementsNet(account.id, foundingDate, undefined, today)
      }
      balance += this.repo.sumTransfersNet(account.id, transfersFrom)

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
    // Los ingresos todavía pendientes de acreditación (ej. Mercado Pago) se excluyen:
    // no son plata disponible para retirar hasta que efectivamente se acrediten.
    const asOfDate = localToday()
    const totalIngresos = this.repo.sumFinanceMovementsByTipo('ingreso', undefined, foundingDate, undefined, undefined, asOfDate)
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

  // ── Comisiones de Mercado Pago (QR / Débito / Crédito) ──────────────────────

  listMpFeeRates(paymentMethod?: MpFeePaymentMethod): FinanceMpFeeRate[] {
    return this.repo.listMpFeeRates(paymentMethod)
  }

  createMpFeeRate(input: CreateMpFeeRateInput): FinanceMpFeeRate {
    if (!MP_FEE_METHODS.includes(input.paymentMethod)) {
      throw new Error('El medio de pago debe ser "qr", "debito", "credito" o "mercadopago"')
    }
    if (typeof input.pct !== 'number' || Number.isNaN(input.pct) || input.pct < 0) {
      throw new Error('El % de comisión debe ser un número mayor o igual a cero')
    }
    if (input.ivaPct !== undefined && (Number.isNaN(input.ivaPct) || input.ivaPct < 0)) {
      throw new Error('El % de IVA debe ser mayor o igual a cero')
    }
    const id = this.repo.createMpFeeRate(input)
    const created = this.repo.findMpFeeRateById(id)
    if (!created) throw new Error('Error al recuperar la tasa creada')
    return created
  }

  /** Solo se puede borrar la versión más reciente de cada medio de pago — preserva el historial usado por ventas ya cargadas. */
  deleteMpFeeRate(id: number): void {
    const rate = this.repo.findMpFeeRateById(id)
    if (!rate) throw new Error(`Tasa no encontrada: ${id}`)
    const latest = this.repo.findLatestMpFeeRate(rate.paymentMethod)
    if (!latest || latest.id !== id) {
      throw new Error('Solo se puede eliminar la versión más reciente de la tasa — agregá una nueva versión en su lugar')
    }
    this.repo.deleteMpFeeRate(id)
  }

  // ── Conciliación venta por venta con el resumen de Mercado Pago ─────────────

  /**
   * Para una fecha dada (opcionalmente filtrada por medio de pago), una fila por
   * cada venta con comisión de Mercado Pago: el cálculo automático de Ventas-Stock
   * + la conciliación guardada, si existe. Reemplaza el total agregado por día que
   * escondía qué venta puntual tenía la diferencia.
   */
  getMpReconciliationRows(fecha: string, paymentMethod?: MpFeePaymentMethod): MpReconciliationRow[] {
    return this.repo.listSalesForMpReconciliation(fecha, paymentMethod).map(sale => ({
      saleId: sale.saleId,
      paymentMethod: sale.paymentMethod,
      fecha: sale.fecha,
      customerName: sale.customerName,
      invoiceNumber: sale.invoiceNumber,
      total: sale.total,
      brutoSistema: sale.brutoSistema,
      comisionSistema: sale.comisionSistema,
      netoSistema: round2(sale.brutoSistema - sale.comisionSistema),
      reconciliation: this.repo.findMpReconciliationBySaleId(sale.saleId) ?? null,
    }))
  }

  listMpReconciliations(dateFrom?: string, dateTo?: string): FinanceMpReconciliation[] {
    return this.repo.listMpReconciliations(dateFrom, dateTo)
  }

  /** Guarda los datos reales de una venta puntual del resumen de MP, y calcula la diferencia contra lo estimado. */
  saveMpReconciliation(input: SaveMpReconciliationInput): FinanceMpReconciliation {
    if ([input.brutoReal, input.comisionReal, input.netoReal].some(n => typeof n !== 'number' || Number.isNaN(n) || n < 0)) {
      throw new Error('Los montos deben ser números mayores o iguales a cero')
    }

    const sale = this.repo.getMpSystemSummaryForSale(input.saleId)
    if (!sale) throw new Error(`Venta no encontrada: ${input.saleId}`)
    if (!MP_FEE_METHODS.includes(sale.paymentMethod)) {
      throw new Error('Esta venta no corresponde a un medio de pago con comisión de Mercado Pago')
    }

    const existing = this.repo.findMpReconciliationBySaleId(input.saleId)
    if (existing && existing.status === 'adjusted') {
      throw new Error(
        'Esta conciliación ya tiene un ajuste asentado. Reabrila (lo que revierte el ajuste) antes de volver a cargarla.'
      )
    }

    const netoSistema = round2(sale.brutoSistema - sale.comisionSistema)
    const diferencia = round2(netoSistema - input.netoReal)

    const id = this.repo.upsertMpReconciliationForSale({
      saleId: input.saleId,
      fecha: sale.fecha,
      paymentMethod: sale.paymentMethod,
      brutoSistema: sale.brutoSistema,
      comisionSistema: sale.comisionSistema,
      brutoReal: input.brutoReal,
      comisionReal: input.comisionReal,
      netoReal: input.netoReal,
      diferencia,
    })
    const saved = this.repo.findMpReconciliationById(id)
    if (!saved) throw new Error('Error al recuperar la conciliación guardada')
    return saved
  }

  /**
   * Asienta el ajuste de la diferencia detectada en Cuenta MP-Anabella (nunca
   * automático — requiere esta confirmación explícita). Si la diferencia es
   * positiva (el sistema sobreestimó el neto), el ajuste es un egreso; si es
   * negativa, un ingreso.
   */
  confirmMpReconciliationAdjustment(id: number): FinanceMpReconciliation {
    const reconciliation = this.repo.findMpReconciliationById(id)
    if (!reconciliation) throw new Error(`Conciliación no encontrada: ${id}`)
    if (reconciliation.status === 'adjusted') throw new Error('Esta conciliación ya fue ajustada')
    if (Math.abs(reconciliation.diferencia) < 0.01) {
      throw new Error('No hay diferencia para ajustar')
    }

    const account = this.repo.findAccountByName(MP_ANABELLA_ACCOUNT_NAME)
    if (!account) throw new Error('No se encontró la cuenta Mercado Pago - Anabella')
    const categoria = this.repo.findCategoryByName(AJUSTE_CONCILIACION_CATEGORIA)

    const movementId = this.repo.createMovement({
      accountId: account.id,
      tipo: reconciliation.diferencia > 0 ? 'egreso' : 'ingreso',
      categoriaId: categoria?.id ?? null,
      monto: Math.abs(reconciliation.diferencia),
      descripcion: `Ajuste conciliación MP (${reconciliation.paymentMethod.toUpperCase()}) Venta #${reconciliation.saleId} - ${reconciliation.fecha}`,
      fecha: reconciliation.fecha,
    })

    this.repo.updateMpReconciliationStatus(id, 'adjusted', movementId)
    const updated = this.repo.findMpReconciliationById(id)
    if (!updated) throw new Error('Error al recuperar la conciliación actualizada')
    return updated
  }

  /** Marca la diferencia como aceptada (ej: redondeo) sin generar ningún movimiento. */
  ignoreMpReconciliation(id: number): FinanceMpReconciliation {
    const reconciliation = this.repo.findMpReconciliationById(id)
    if (!reconciliation) throw new Error(`Conciliación no encontrada: ${id}`)
    if (reconciliation.status === 'adjusted') throw new Error('Esta conciliación ya fue ajustada')
    this.repo.updateMpReconciliationStatus(id, 'ignored', null)
    const updated = this.repo.findMpReconciliationById(id)
    if (!updated) throw new Error('Error al recuperar la conciliación actualizada')
    return updated
  }

  /** Revierte un ajuste ya asentado (borra el movimiento) y vuelve la conciliación a "pending" para poder recargarla. */
  reopenMpReconciliation(id: number): FinanceMpReconciliation {
    const reconciliation = this.repo.findMpReconciliationById(id)
    if (!reconciliation) throw new Error(`Conciliación no encontrada: ${id}`)
    const ajusteMovementId = reconciliation.ajusteMovementId
    // Primero desvincular la referencia (FK finance_mp_reconciliations.ajuste_movement_id)
    // y recién después borrar el movimiento — al revés, el DELETE viola la FK.
    this.repo.updateMpReconciliationStatus(id, 'pending', null)
    if (ajusteMovementId) {
      this.repo.deleteMovement(ajusteMovementId)
    }
    const updated = this.repo.findMpReconciliationById(id)
    if (!updated) throw new Error('Error al recuperar la conciliación actualizada')
    return updated
  }
}
