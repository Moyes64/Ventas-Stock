import type { Database } from 'better-sqlite3'
import { localToday } from '../../lib/date'
import { SaleRepository } from './repository'
import { StockService } from '../stock/service'
import { ParameterRepository } from '../parameters/repository'
import { FinanceService } from '../finance/service'
import { notPrincipalInvoicingMessage, type InvoicingService } from '../invoicing-afip/service'
import { isPrincipalPc } from '../principal/service'
import type { Sale, AppliedParameter, CreateSaleInput } from './types'

export class SaleService {
  private readonly db: Database
  private readonly saleRepo: SaleRepository
  private readonly stockService: StockService
  private readonly paramRepo: ParameterRepository
  private readonly invoicingService: InvoicingService
  private readonly financeService: FinanceService

  constructor(db: Database, invoicingService: InvoicingService) {
    this.db = db
    this.saleRepo = new SaleRepository(db)
    this.stockService = new StockService(db)
    this.paramRepo = new ParameterRepository(db)
    this.invoicingService = invoicingService
    this.financeService = new FinanceService(db)
  }

  getById(id: number): Sale | undefined {
    return this.saleRepo.findById(id)
  }

  list(filters: { dateFrom?: string; dateTo?: string; status?: string; limit?: number }): Sale[] {
    return this.saleRepo.list(filters)
  }

  findPendingCAE(): Sale[] {
    return this.saleRepo.findPendingCAE()
  }

  updatePaymentMethod(id: number, paymentMethod: Sale['paymentMethod']): Sale {
    const current = this.saleRepo.findById(id)
    if (!current) throw new Error(`Venta no encontrada: ${id}`)
    if (current.paymentMethod === 'mixto') {
      throw new Error(
        'Esta venta tiene pago combinado (más de un medio de pago) y no se puede reclasificar a un único medio desde acá.'
      )
    }

    this.saleRepo.updatePaymentMethod(id, paymentMethod)
    const sale = this.saleRepo.findById(id)
    if (!sale) throw new Error(`Venta no encontrada: ${id}`)

    // Re-genera el ingreso (y su comisión MP, si corresponde) desde cero con el
    // medio de pago nuevo. Antes esto solo resincronizaba la comisión dejando el
    // ingreso donde ya estaba — al reclasificar entre grupos de cuenta distintos
    // (ej: "Contado Efectivo" -> "Débito") el ingreso se quedaba mal en Caja y
    // solo la comisión se movía, dejando Caja con la venta completa menos la
    // comisión en vez de sin nada. Borrar + recrear usa el mismo ruteo de cuenta
    // que la creación original, así que siempre termina en la cuenta correcta.
    // No bloquea el cambio si falla.
    // La fecha de acreditación de MP Ariel se cargó a mano: se conserva si la
    // venta ya era de MP Ariel (si no, queda acreditada en el momento).
    try {
      const fechaAcreditacion = current.paymentMethod === 'mp_ariel'
        ? this.financeService.findSaleIncomeAccreditationDate(sale.id)
        : null
      this.financeService.reverseSaleIncome(sale.id)
      this.financeService.registerSaleIncome({
        saleId: sale.id,
        salePaymentId: sale.payments?.[0]?.id,
        paymentMethod: sale.paymentMethod,
        monto: sale.total,
        fecha: sale.saleDate,
        fechaAcreditacion,
      })
    } catch (err) {
      console.error('[sales] Error resincronizando finanzas tras cambio de medio de pago:', err)
    }

    return sale
  }

  /**
   * End-to-end sale creation flow:
   *
   * 1. Validate stock availability for all items
   * 2. Calculate base totals (subtotal without IVA, taxAmount)
   * 3. Resolve and apply parameters sequentially on the base subtotal:
   *    - tipo '-': subtotal *= (1 - pct/100)
   *    - tipo '+': subtotal *= (1 + pct/100)
   *    IVA is scaled proportionally with the adjustment factor.
   * 4-6. En una sola transacción: venta + sale_parameters, salidas de stock,
   *    estado INTERNAL_RECEIPT para Venta N y el ingreso financiero automático.
   *    Con la base en Turso cada transacción cuesta viajes de red, y además así
   *    la venta no puede quedar grabada sin su stock.
   * 7. For normal sales: call InvoicingService.solicitarCAE(sale) — fuera de la
   *    transacción, para no tenerla abierta mientras responde AFIP.
   * 8. Return the final sale state
   */
  async createSale(input: CreateSaleInput): Promise<Sale> {
    // Las ventas por Mercado Libre (MP Ariel) van solo como Venta N y con un único
    // medio: el ingreso entero queda pendiente en la cuenta de Ariel.
    if (input.payments?.some(p => p.paymentMethod === 'mp_ariel')) {
      throw new Error('Mercado Libre (MP Ariel) no se puede combinar con otro medio de pago')
    }
    if (input.paymentMethod === 'mp_ariel' && !input.isBlackSale) {
      throw new Error('Las ventas por Mercado Libre (MP Ariel) se cargan como Venta N')
    }

    // Una venta con factura en una PC que no factura quedaría como comprobante
    // interno con error: se rechaza antes de grabarla.
    if (!input.isBlackSale && !isPrincipalPc()) throw new Error(notPrincipalInvoicingMessage())

    // Step 1: Validate stock
    this.stockService.validateAvailability(
      input.items.map(i => ({ productId: i.productId, quantity: i.quantity }))
    )

    // Step 2: Calculate base totals (unitPrice includes IVA)
    let originalSubtotal = 0
    let originalTaxAmount = 0

    for (const item of input.items) {
      const itemTotal = item.quantity * item.unitPrice
      const taxFactor = item.taxRate / 100
      const itemBase = itemTotal / (1 + taxFactor)
      originalSubtotal += itemBase
      originalTaxAmount += itemTotal - itemBase
    }

    // Step 3: Resolve and apply parameters sequentially
    const appliedParameters: AppliedParameter[] = []
    if (input.parameterIds && input.parameterIds.length > 0) {
      for (const pid of input.parameterIds) {
        const param = this.paramRepo.findById(pid)
        if (param) {
          appliedParameters.push({
            parameterId: param.id,
            descripcion: param.descripcion,
            porcentaje: param.porcentaje,
            tipo: param.tipo,
          })
        }
      }
    }

    let adjustedSubtotal = originalSubtotal
    for (const param of appliedParameters) {
      if (param.tipo === '-') {
        adjustedSubtotal *= 1 - param.porcentaje / 100
      } else {
        adjustedSubtotal *= 1 + param.porcentaje / 100
      }
    }

    // Scale IVA proportionally to the adjustment
    const adjustmentFactor = originalSubtotal > 0 ? adjustedSubtotal / originalSubtotal : 1
    const taxAmount = originalTaxAmount * adjustmentFactor
    const discountAmount = originalSubtotal - adjustedSubtotal  // positive = net savings
    const total = adjustedSubtotal + taxAmount

    const saleId = this.db.transaction(() => {
      // Step 4: Persist sale
      const id = this.saleRepo.create({
        ...input,
        subtotal: Math.round(adjustedSubtotal * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        total: Math.round(total * 100) / 100,
        discountAmount: Math.round(discountAmount * 100) / 100,
        appliedParameters,
      })

      // Step 5: Register stock exits
      this.stockService.registerSaleExit(
        input.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
        id,
        input.userId
      )

      // Black sales skip AFIP and are always stored as internal receipts.
      // IVA is still calculated (same as a normal sale) but no CAE is requested.
      if (input.isBlackSale) this.saleRepo.updateStatus(id, 'INTERNAL_RECEIPT')

      // Step 6: Auto-registrar el ingreso a MP-Anabella si corresponde (no bloquea la venta si falla).
      // Una pierna por medio de pago -- para una venta simple es una sola (el
      // total completo); para una combinada, una por cada medio usado. Va en una
      // transacción anidada (SAVEPOINT): si falla se deshace solo el ingreso.
      try {
        this.db.transaction(() => {
          const saleDate = this.saleRepo.getSaleDate(id)
          if (!saleDate) throw new Error(`Venta no encontrada: ${id}`)
          for (const leg of this.saleRepo.getPayments(id)) {
            this.financeService.registerSaleIncome({
              saleId: id,
              salePaymentId: leg.id,
              paymentMethod: leg.paymentMethod,
              monto: leg.amount,
              fecha: saleDate,
              fechaAcreditacion: input.fechaAcreditacion,
            })
          }
        })()
      } catch (err) {
        console.error('[sales] Error registrando ingreso financiero automático:', err)
      }

      return id
    })()

    // Step 7: Request CAE (skip for black sales -- always internal receipt)
    const sale = this.saleRepo.findById(saleId)
    if (!sale) throw new Error(`Venta no encontrada: ${saleId}`)

    if (!input.isBlackSale) {
      try {
        const caeResult = await this.invoicingService.solicitarCAE(sale)

        if (caeResult.success && caeResult.cae) {
          this.saleRepo.updateStatus(sale.id, 'AUTHORIZED', {
            cae: caeResult.cae,
            caeVto: caeResult.caeVto ?? '',
            invoiceNumber: caeResult.invoiceNumber ?? 0,
            puntoVenta: caeResult.puntoVenta ?? 0,
          })
        } else {
          this.saleRepo.updateStatus(sale.id, 'INTERNAL_RECEIPT')
          if (caeResult.error) {
            this.saleRepo.updateAfipError(sale.id, caeResult.error)
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        this.saleRepo.updateStatus(sale.id, 'INTERNAL_RECEIPT')
        this.saleRepo.updateAfipError(sale.id, `Error inesperado: ${errorMsg}`)
      }
    }

    // Step 8: Return final state
    const finalSale = this.saleRepo.findById(saleId)
    if (!finalSale) throw new Error(`Venta no encontrada: ${saleId}`)

    return finalSale
  }

  /**
   * Cancela una venta que todavía no tiene CAE autorizado (errores de carga, pedidos
   * web mal importados, etc.). Las ventas ya facturadas (AUTHORIZED) no se pueden
   * cancelar acá — corresponde usar Cambios y Devoluciones para esos casos.
   * Repone el stock vendido y revierte el ingreso financiero auto-generado, si existe.
   */
  cancelSale(id: number): Sale {
    const sale = this.saleRepo.findById(id)
    if (!sale) throw new Error(`Venta no encontrada: ${id}`)
    if (sale.status === 'CANCELLED') throw new Error('La venta ya está cancelada')
    if (sale.status === 'AUTHORIZED') {
      throw new Error(
        'No se puede cancelar una venta ya facturada con CAE. Usá Cambios y Devoluciones para este caso.'
      )
    }

    this.reverseSale(sale, `Reversión por cancelación de venta #${id}`)

    const updated = this.saleRepo.findById(id)
    if (!updated) throw new Error(`Venta no encontrada: ${id}`)
    return updated
  }

  /**
   * Anula la factura de una venta con una nota de crédito electrónica por el
   * total (AFIP). Con el CAE de la NC: la registra, repone el stock, cancela la
   * venta y revierte el ingreso — igual que cancelSale.
   * Una venta ya CANCELLED que tenía CAE (se canceló a mano antes de existir
   * esta función) solo emite la NC: stock y plata ya estaban revertidos.
   */
  async issueCreditNote(id: number, reason: string): Promise<Sale> {
    const sale = this.saleRepo.findById(id)
    if (!sale) throw new Error(`Venta no encontrada: ${id}`)
    if (sale.creditNote) throw new Error(`La venta #${id} ya tiene una nota de crédito.`)
    if (!sale.cae || !sale.invoiceNumber || sale.isBlackSale) {
      throw new Error('La venta no tiene una factura autorizada (CAE). Si hace falta, usá "Cancelar venta".')
    }
    if (sale.status !== 'AUTHORIZED' && sale.status !== 'CANCELLED') {
      throw new Error(`No se puede anular una venta en estado ${sale.status}.`)
    }
    if (sale.status === 'AUTHORIZED' && this.saleRepo.countExchanges(id) > 0) {
      throw new Error(
        'La venta tiene cambios o devoluciones registrados: la nota de crédito por el total dejaría el stock y la caja mal. Revisalo antes de anularla.'
      )
    }

    const result = await this.invoicingService.solicitarNotaCredito(sale)
    if (!result.success || !result.cae || !result.invoiceNumber) {
      throw new Error(result.error ?? 'AFIP no autorizó la nota de crédito.')
    }

    // Lo primero es dejar registrada la NC: ya existe en AFIP aunque falle lo que sigue.
    this.saleRepo.insertCreditNote({
      saleId: id,
      invoiceType: result.tipoComprobante ?? 13,
      puntoVenta: result.puntoVenta ?? 0,
      number: result.invoiceNumber,
      cae: result.cae,
      caeVto: result.caeVto ?? null,
      total: sale.total,
      issueDate: localToday(),
      reason: reason.trim(),
    })

    if (sale.status === 'AUTHORIZED') {
      this.reverseSale(sale, `Reversión por nota de crédito de la venta #${id}`)
    }

    const updated = this.saleRepo.findById(id)
    if (!updated) throw new Error(`Venta no encontrada: ${id}`)
    return updated
  }

  /** Repone el stock vendido, cancela la venta y revierte su ingreso financiero. */
  private reverseSale(sale: Sale, notes: string): void {
    for (const item of sale.items ?? []) {
      this.stockService.addManualMovement({
        productId: item.productId,
        type: 'ENTRY',
        quantity: item.quantity,
        referenceType: 'SALE_CANCEL',
        referenceId: sale.id,
        notes,
      })
    }

    this.saleRepo.updateStatus(sale.id, 'CANCELLED')
    this.financeService.reverseSaleIncome(sale.id)
  }
}
