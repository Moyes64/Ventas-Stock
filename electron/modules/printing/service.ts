import type { Database } from 'better-sqlite3'
import { SaleRepository } from '../sales/repository'
import { tryLoadAfipConfig } from '../invoicing-afip/config'
import { generateAfipQR, buildAfipQrPayload } from './qr-generator'
import { printTicket } from './thermal-printer'
import type { Sale } from '../sales/types'
import type { TicketData } from './types'
import { DOC_TYPE_AFIP_CODE } from '../customers/types'

const INVOICE_TYPE_LABELS: Record<number, string> = {
  1: 'FACTURA A',
  2: 'NOTA DE DÉBITO A',
  3: 'NOTA DE CRÉDITO A',
  6: 'FACTURA B',
  7: 'NOTA DE DÉBITO B',
  8: 'NOTA DE CRÉDITO B',
  11: 'FACTURA C',
  12: 'NOTA DE DÉBITO C',
  13: 'NOTA DE CRÉDITO C',
}

export class PrintingService {
  private readonly saleRepo: SaleRepository

  constructor(private readonly db: Database) {
    this.saleRepo = new SaleRepository(db)
  }

  async buildTicketData(sale: Sale): Promise<TicketData> {
    const config = tryLoadAfipConfig()
    const defaultPuntoVenta = parseInt(process.env.VITE_EMPRESA_PUNTO_VENTA ?? '1', 10) || 1

    const companyName = process.env.VITE_EMPRESA_RAZON_SOCIAL ?? 'Mi Empresa'
    const companyAddress = process.env.VITE_EMPRESA_DOMICILIO ?? ''
    const condicionIva = process.env.VITE_EMPRESA_CONDICION_IVA ?? 'Monotributo'

    // Customer info
    let customerName = 'Consumidor Final'
    let customerDocType = 'DNI'
    let customerDoc = '0'
    let customerCondicionIva = 'Consumidor Final'

    if (sale.customerId) {
      interface CustomerRow {
        name: string
        doc_type: string
        cuit_dni: string
        condicion_iva: string
      }
      const customer = this.db
        .prepare('SELECT name, doc_type, cuit_dni, condicion_iva FROM customers WHERE id = ?')
        .get(sale.customerId) as CustomerRow | undefined

      if (customer) {
        customerName = customer.name
        customerDocType = customer.doc_type
        customerDoc = customer.cuit_dni
        customerCondicionIva = customer.condicion_iva.replace(/_/g, ' ')
      }
    }

    const items = this.saleRepo.getItems(sale.id)
    const invoiceType = sale.invoiceType ?? 11
    const invoiceLabel = INVOICE_TYPE_LABELS[invoiceType] ?? `COMPROBANTE ${invoiceType}`

    const effectivePuntoVenta = sale.puntoVenta ?? config?.puntoVenta ?? defaultPuntoVenta
    const puntoVentaStr = String(effectivePuntoVenta).padStart(5, '0')
    const invoiceNumStr = String(sale.invoiceNumber ?? 0).padStart(8, '0')
    const invoiceNumber = `${puntoVentaStr}-${invoiceNumStr}`

    // Generate QR only if authorized and AFIP CUIT is available
    let qrBase64: string | undefined

    if (sale.status === 'AUTHORIZED' && sale.cae && sale.invoiceNumber && config) {
      const docType = DOC_TYPE_AFIP_CODE[customerDocType as keyof typeof DOC_TYPE_AFIP_CODE] ?? 99
      const docNro = parseInt(customerDoc.replace(/\D/g, ''), 10) || 0

      qrBase64 = await generateAfipQR(
        buildAfipQrPayload({
          fecha: sale.saleDate,
          cuit: config.cuit,
          puntoVenta: sale.puntoVenta ?? config.puntoVenta,
          tipoComprobante: invoiceType,
          nroComprobante: sale.invoiceNumber,
          importe: sale.total,
          tipoDocReceptor: docType,
          nroDocReceptor: docNro,
          cae: sale.cae,
        })
      )
    }

    return {
      companyName,
      companyCuit: config ? String(config.cuit) : (process.env.VITE_EMPRESA_CUIT ?? ''),
      companyAddress,
      condicionIva,
      puntoVenta: effectivePuntoVenta,
      invoiceType: invoiceLabel,
      invoiceNumber,
      date: sale.saleDate,
      customerName,
      customerDocType,
      customerDoc,
      customerCondicionIva,
      items: items.map(i => ({
        name: i.productName ?? `Producto ${i.productId}`,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        subtotal: i.subtotal,
        taxRate: i.taxRate,
      })),
      subtotal: sale.subtotal,
      taxAmount: sale.taxAmount,
      total: sale.total,
      cae: sale.cae ?? undefined,
      caeVto: sale.caeVto ?? undefined,
      qrBase64,
      isAuthorized: sale.status === 'AUTHORIZED',
      internalReceiptNumber: sale.status !== 'AUTHORIZED' ? sale.id : undefined,
    }
  }

  async printAuthorizedTicket(saleId: number): Promise<void> {
    const sale = this.saleRepo.findById(saleId)
    if (!sale) throw new Error(`Venta no encontrada: ${saleId}`)
    if (sale.status !== 'AUTHORIZED') {
      throw new Error(`La venta ${saleId} no está autorizada (estado: ${sale.status})`)
    }

    const ticketData = await this.buildTicketData(sale)
    await printTicket(ticketData)
  }

  async printInternalReceipt(saleId: number): Promise<void> {
    const sale = this.saleRepo.findById(saleId)
    if (!sale) throw new Error(`Venta no encontrada: ${saleId}`)

    const ticketData = await this.buildTicketData(sale)
    await printTicket(ticketData)
  }
}
