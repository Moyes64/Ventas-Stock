import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { Database } from 'better-sqlite3'
import { SaleRepository } from '../sales/repository'
import { tryLoadAfipConfig } from '../invoicing-afip/config'
import { generateAfipQR, buildAfipQrPayload } from './qr-generator'
import { printTicket } from './thermal-printer'
import type { Sale } from '../sales/types'
import type { TicketData } from './types'
import { DOC_TYPE_AFIP_CODE } from '../customers/types'
import type { SystemParams } from '../system-params/types'
import { DEFAULT_SYSTEM_PARAMS } from '../system-params/types'

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

  private loadSysParams(): SystemParams {
    try {
      const p = path.join(app.getPath('userData'), 'system-params.json')
      if (fs.existsSync(p)) {
        return { ...DEFAULT_SYSTEM_PARAMS, ...(JSON.parse(fs.readFileSync(p, 'utf-8')) as Partial<SystemParams>) }
      }
    } catch { /* ignore */ }
    return { ...DEFAULT_SYSTEM_PARAMS }
  }

  async buildTicketData(sale: Sale): Promise<TicketData> {
    const config = tryLoadAfipConfig()
    const sys = this.loadSysParams()
    const defaultPuntoVenta = parseInt(process.env.VITE_EMPRESA_PUNTO_VENTA ?? '1', 10) || 1

    const companyName = sys.denominacion || process.env.VITE_EMPRESA_RAZON_SOCIAL || 'Mi Empresa'
    const companyAddress = [sys.calle, sys.numero, sys.codigoPostal].filter(Boolean).join(', ') || process.env.VITE_EMPRESA_DOMICILIO || ''
    const condicionIva = sys.categoriaIva || process.env.VITE_EMPRESA_CONDICION_IVA || 'Monotributo'

    // Inicio de actividades: formatear de YYYY-MM-DD a DD/MM/AAAA
    let inicioActividades: string | undefined
    if (sys.inicioActividades) {
      const [y, m, d] = sys.inicioActividades.split('-')
      if (y && m && d) inicioActividades = `${d}/${m}/${y}`
    }

    // Condición IIBB
    const condicionIIBB = sys.condicionIIBB === 'Inscripto' && sys.nroIIBB
      ? `Inscripto Nº ${sys.nroIIBB}`
      : sys.condicionIIBB || 'Exento'

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
    let qrPayload: import('./qr-generator').AfipQrPayload | undefined

    if (sale.status === 'AUTHORIZED' && sale.cae && sale.invoiceNumber && config) {
      const docType = DOC_TYPE_AFIP_CODE[customerDocType as keyof typeof DOC_TYPE_AFIP_CODE] ?? 99
      const docNro = parseInt(customerDoc.replace(/\D/g, ''), 10) || 0

      qrPayload = buildAfipQrPayload({
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

      qrBase64 = await generateAfipQR(qrPayload)
    }

    // Calculate gross subtotal (before parameter adjustments) from item lines, including IVA
    const grossSubtotal = items.reduce((sum, item) => sum + item.subtotal, 0)

    // Build discount/surcharge lines from persisted sale_parameters.
    // Discounts (tipo='-') se muestran como líneas propias con signo negativo.
    // Recargos (tipo='+') — ej. recargo por tarjeta de crédito — también deben
    // aparecer: ya están sumados en `sale.total`, y sin una línea que los explique
    // el total impreso no coincide con la suma de los ítems. Se agrupan más abajo
    // en `otherCharges` (misma línea que ya usan las ventas web).
    const appliedParams = this.saleRepo.getAppliedParameters(sale.id)
    const discountLines: TicketData['discountLines'] = []
    const surchargeLines: Array<{ descripcion: string; porcentaje: number; amount: number }> = []
    let runningBase = grossSubtotal
    for (const param of appliedParams) {
      const amount = runningBase * (param.porcentaje / 100)
      if (param.tipo === '-') {
        discountLines.push({ descripcion: param.descripcion, porcentaje: param.porcentaje, amount })
        runningBase *= 1 - param.porcentaje / 100
      } else {
        surchargeLines.push({ descripcion: param.descripcion, porcentaje: param.porcentaje, amount })
        runningBase *= 1 + param.porcentaje / 100
      }
    }

    // Cargo adicional a mostrar como línea propia (ya incluido en `sale.total`):
    //   - Ventas web: viene en sale.otherChargesAmount / sale.otherChargesLabel.
    //   - Ventas de mostrador: se arma con los recargos por parámetro (tipo='+').
    // Ambos casos son mutuamente excluyentes en la práctica.
    let otherCharges: TicketData['otherCharges']
    if (sale.otherChargesAmount > 0) {
      otherCharges = { label: sale.otherChargesLabel || 'Otros cargos', amount: sale.otherChargesAmount }
    } else if (surchargeLines.length > 0) {
      otherCharges = {
        label: surchargeLines.map(s => `${s.descripcion} (${s.porcentaje}%)`).join(' + '),
        amount: surchargeLines.reduce((sum, s) => sum + s.amount, 0),
      }
    }

    return {
      companyName,
      companyCuit: config ? String(config.cuit) : (sys.cuitCuil || process.env.VITE_EMPRESA_CUIT || ''),
      companyAddress,
      condicionIva,
      inicioActividades,
      condicionIIBB,
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
      grossSubtotal,
      discountLines,
      otherCharges,
      subtotal: sale.subtotal,
      taxAmount: sale.taxAmount,
      total: sale.total,
      cae: sale.cae ?? undefined,
      caeVto: sale.caeVto ?? undefined,
      qrBase64,
      qrPayload,
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
    printTicket(ticketData)
  }

  async printInternalReceipt(saleId: number): Promise<void> {
    const sale = this.saleRepo.findById(saleId)
    if (!sale) throw new Error(`Venta no encontrada: ${saleId}`)

    const ticketData = await this.buildTicketData(sale)
    printTicket(ticketData)
  }
}
