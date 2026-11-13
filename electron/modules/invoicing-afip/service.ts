import { solicitarCAE, getUltimoComprobante } from './wsfev1'
import { loadAfipConfig } from './config'
import { SaleRepository } from '../sales/repository'
import type { Sale } from '../sales/types'
import type { CAEResponse, ComprobanteAsociado, FacturaDetalle } from './types'
import { DOC_TYPE_AFIP_CODE } from '../customers/types'
import type { Database } from 'better-sqlite3'
import { isPrincipalPc, principalName } from '../principal/service'

/** Mensaje para cuando se intenta facturar desde una PC que no es la principal. */
export function notPrincipalInvoicingMessage(): string {
  const principal = principalName()
  return principal
    ? `La facturación con AFIP se hace solo desde la PC principal (${principal}). Desde esta PC podés cargarla como Venta N.`
    : 'No hay PC principal: elegila en Parámetros del sistema para poder facturar con AFIP.'
}

/** Factura → nota de crédito de la misma letra (A: 1→3, B: 6→8, C: 11→13). */
export const CREDIT_NOTE_TYPE: Record<number, number> = { 1: 3, 6: 8, 11: 13 }

const MAX_RETRY_ATTEMPTS = 2
const RETRY_DELAY_MS = 1000

export class InvoicingService {
  private readonly saleRepo: SaleRepository

  constructor(private readonly db: Database) {
    this.saleRepo = new SaleRepository(db)
  }

  /**
   * Requests a CAE for the given sale.
   * Implements retry logic: attempts up to MAX_RETRY_ATTEMPTS on transient errors.
   * Returns a CAEResponse — never throws (errors are captured in the response).
   */
  async solicitarCAE(sale: Sale): Promise<CAEResponse> {
    return this.requestCAE(sale, sale.invoiceType ?? 11) // Default: Factura C
  }

  /**
   * Pide a AFIP el CAE de una nota de crédito que anula por completo la
   * factura de la venta (mismo receptor e importes, con la factura como
   * comprobante asociado). Devuelve el número/punto de venta/tipo de la NC.
   */
  async solicitarNotaCredito(sale: Sale): Promise<CAEResponse & { tipoComprobante?: number }> {
    if (!sale.cae || !sale.invoiceNumber) {
      return { success: false, error: 'La venta no tiene una factura autorizada (CAE) para anular.' }
    }
    const invoiceType = sale.invoiceType ?? 11
    const creditNoteType = CREDIT_NOTE_TYPE[invoiceType]
    if (!creditNoteType) {
      return { success: false, error: `No hay nota de crédito para el tipo de comprobante ${invoiceType}.` }
    }
    const config = loadAfipConfig()
    const result = await this.requestCAE(sale, creditNoteType, [{
      tipo: invoiceType,
      puntoVenta: sale.puntoVenta || config.puntoVenta,
      numero: sale.invoiceNumber,
      cuit: config.cuit,
      fecha: sale.saleDate.replace(/-/g, ''),
    }])
    return { ...result, tipoComprobante: creditNoteType }
  }

  private async requestCAE(
    sale: Sale,
    invoiceType: number,
    cbtesAsoc?: ComprobanteAsociado[]
  ): Promise<CAEResponse> {
    // Los certificados de AFIP viven en la PC principal, y una sola PC numera
    // los comprobantes: desde otra se rechaza antes de tocar AFIP.
    if (!isPrincipalPc()) return { success: false, error: notPrincipalInvoicingMessage() }

    const config = loadAfipConfig()

    // Consultar el último número autorizado en AFIP y usar último + 1
    // Esto garantiza sincronía aunque haya habido ventas fallidas o reintentos
    let nextNumber: number
    try {
      const ultimoAfip = await getUltimoComprobante(config.puntoVenta, invoiceType)
      nextNumber = ultimoAfip + 1
      console.log(`[InvoicingService] Próximo comprobante AFIP tipo ${invoiceType}: ${nextNumber} (último autorizado: ${ultimoAfip})`)
    } catch (err) {
      // Las notas de crédito no tienen contador local: sin AFIP no se emiten.
      if (cbtesAsoc) {
        return { success: false, error: `No se pudo consultar el último comprobante en AFIP: ${err instanceof Error ? err.message : String(err)}` }
      }
      // Si no se puede consultar AFIP, usar el contador local como fallback
      nextNumber = this.saleRepo.getNextInvoiceNumber(config.puntoVenta, invoiceType)
      console.warn(`[InvoicingService] No se pudo consultar FECompUltimoAutorizado, usando local: ${nextNumber}. Error: ${err instanceof Error ? err.message : String(err)}`)
    }

    // Build AFIP request details
    const factura = { ...this.buildFacturaDetalle(sale, nextNumber, config.puntoVenta), tipoComprobante: invoiceType, cbtesAsoc }

    let lastError = ''

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        const result = await solicitarCAE({
          tipoComprobante: invoiceType,
          puntoVenta: config.puntoVenta,
          facturas: [factura],
        })

        // La respuesta de AFIP no trae el punto de venta: es el que se usó.
        return { ...result, puntoVenta: config.puntoVenta }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        console.error(`[InvoicingService] Attempt ${attempt}/${MAX_RETRY_ATTEMPTS} failed: ${lastError}`)

        if (attempt < MAX_RETRY_ATTEMPTS) {
          await sleep(RETRY_DELAY_MS * attempt)
        }
      }
    }

    return {
      success: false,
      error: `Error AFIP después de ${MAX_RETRY_ATTEMPTS} intentos: ${lastError}`,
    }
  }

  /** Lists sales with their invoicing status. */
  listInvoices(filters: { dateFrom?: string; dateTo?: string; status?: string }) {
    return this.saleRepo.list(filters)
  }

  private buildFacturaDetalle(
    sale: Sale,
    nro: number,
    puntoVenta: number
  ): FacturaDetalle {
    // Get customer doc info for the AFIP request
    let docTipo = 99 // Sin identificar
    let docNro = 0

    if (sale.customerId) {
      interface CustomerRow { doc_type: string; cuit_dni: string }
      const customer = this.db
        .prepare('SELECT doc_type, cuit_dni FROM customers WHERE id = ?')
        .get(sale.customerId) as CustomerRow | undefined

      if (customer?.cuit_dni) {
        docTipo = DOC_TYPE_AFIP_CODE[customer.doc_type as keyof typeof DOC_TYPE_AFIP_CODE] ?? 99
        docNro = parseInt(customer.cuit_dni.replace(/\D/g, ''), 10) || 0
      }
    }

    // Build IVA breakdown from sale items
    const items = this.saleRepo.getItems(sale.id)
    const ivaMap = new Map<number, { baseImp: number; importe: number }>()

    for (const item of items) {
      // Get AFIP IVA code for this tax rate
      interface TaxRateRow { afip_code: number }
      const taxRateRow = this.db
        .prepare('SELECT afip_code FROM tax_rates WHERE percentage = ?')
        .get(item.taxRate) as TaxRateRow | undefined
      const afipCode = taxRateRow?.afip_code ?? 5

      const itemTotal = item.quantity * item.unitPrice
      const factor = item.taxRate / 100
      const base = itemTotal / (1 + factor)
      const ivaAmount = itemTotal - base

      const existing = ivaMap.get(afipCode) ?? { baseImp: 0, importe: 0 }
      ivaMap.set(afipCode, {
        baseImp: existing.baseImp + base,
        importe: existing.importe + ivaAmount,
      })
    }

    const ivaAlicuotas = Array.from(ivaMap.entries()).map(([id, v]) => ({
      id,
      baseImp: Math.round(v.baseImp * 100) / 100,
      importe: Math.round(v.importe * 100) / 100,
    }))

    return {
      tipoComprobante: sale.invoiceType ?? 11,
      puntoVenta,
      nroDesde: nro,
      nroHasta: nro,
      concepto: 1, // Productos
      docTipo,
      docNro,
      importeTotal: sale.total,
      importeNoGravado: 0,
      importeExento: 0,
      importeIVA: sale.taxAmount,
      importeTributos: 0,
      moneda: 'PES',
      monedaCtz: 1,
      iva: ivaAlicuotas,
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
