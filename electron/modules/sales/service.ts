import type { Database } from 'better-sqlite3'
import { SaleRepository } from './repository'
import { StockService } from '../stock/service'
import { ParameterRepository } from '../parameters/repository'
import { FinanceService } from '../finance/service'
import type { InvoicingService } from '../invoicing-afip/service'
import type { Sale, AppliedParameter, CreateSaleInput } from './types'

export class SaleService {
  private readonly saleRepo: SaleRepository
  private readonly stockService: StockService
  private readonly paramRepo: ParameterRepository
  private readonly invoicingService: InvoicingService
  private readonly financeService: FinanceService

  constructor(db: Database, invoicingService: InvoicingService) {
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
    try {
      this.financeService.reverseSaleIncome(sale.id)
      this.financeService.registerSaleIncome({
        saleId: sale.id,
        paymentMethod: sale.paymentMethod,
        monto: sale.total,
        fecha: sale.saleDate,
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
   * 4. Persist sale + sale_parameters
   * 5. Register stock exits
   * 6. For normal sales: call InvoicingService.solicitarCAE(sale)
   *    For black sales: skip AFIP -> status = INTERNAL_RECEIPT (IVA is still calculated)
   * 7. Return the final sale state
   */
  async createSale(input: CreateSaleInput): Promise<Sale> {
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

    // Step 4: Persist sale
    const saleId = this.saleRepo.create({
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
      saleId,
      input.userId
    )

    // Step 6: Request CAE (skip for black sales -- always internal receipt)
    const sale = this.saleRepo.findById(saleId)
    if (!sale) throw new Error(`Venta no encontrada: ${saleId}`)

    if (input.isBlackSale) {
      // Black sales skip AFIP and are always stored as internal receipts.
      // IVA is still calculated (same as a normal sale) but no CAE is requested.
      this.saleRepo.updateStatus(sale.id, 'INTERNAL_RECEIPT')
    } else {
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

    // Step 7: Return final state
    const finalSale = this.saleRepo.findById(saleId)
    if (!finalSale) throw new Error(`Venta no encontrada: ${saleId}`)

    // Step 8: Auto-registrar el ingreso a MP-Anabella si corresponde (no bloquea la venta si falla)
    try {
      this.financeService.registerSaleIncome({
        saleId: finalSale.id,
        paymentMethod: finalSale.paymentMethod,
        monto: finalSale.total,
        fecha: finalSale.saleDate,
      })
    } catch (err) {
      console.error('[sales] Error registrando ingreso financiero automático:', err)
    }

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

    for (const item of sale.items ?? []) {
      this.stockService.addManualMovement({
        productId: item.productId,
        type: 'ENTRY',
        quantity: item.quantity,
        referenceType: 'SALE_CANCEL',
        referenceId: id,
        notes: `Reversión por cancelación de venta #${id}`,
      })
    }

    this.saleRepo.updateStatus(id, 'CANCELLED')
    this.financeService.reverseSaleIncome(id)

    const updated = this.saleRepo.findById(id)
    if (!updated) throw new Error(`Venta no encontrada: ${id}`)
    return updated
  }
}
