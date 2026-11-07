import nodemailer from 'nodemailer'
import type { Database } from 'better-sqlite3'
import { SystemParamsService } from '../system-params/service'
import { SaleRepository } from '../sales/repository'
import { InvoicingService } from '../invoicing-afip/service'
import { PrintingService } from '../printing/service'
import { renderInvoicePdf, invoicePdfFileName } from '../printing/pdf'
import { localNow } from '../../lib/date'
import { WEB_ORDERS_BCC, buildNotifyHtml, shortOrderRef, type NotifyKind } from './templates'

export type { NotifyKind }

/**
 * Circuito de mails al cliente de la tienda web:
 *  1. "Recibimos tu compra" — lo manda Hostinger (webhook.php) al aprobarse el pago.
 *  2. "Listo para retirar" / "Despachado" — este módulo, desde Órdenes Web:
 *     factura el pedido en AFIP (si todavía no lo estaba) y manda el aviso con
 *     la factura en PDF adjunta.
 *  3. "Entregado" — solo control interno, sin mail.
 * Todos los mails salen con copia oculta a ventas@.
 */

export interface NotifyResult {
  success: boolean
  error?: string
  /** true si la factura se emitió en este intento (aunque después falle el mail). */
  invoiced?: boolean
}

interface WebOrderRow {
  sale_id: number
  external_id: string
  delivery_type: string | null
  delivery_address: string | null
  fulfillment_status: string
  customer_name: string | null
  customer_email: string | null
}

export class WebOrderNotifyService {
  private readonly saleRepo: SaleRepository
  private readonly invoicing: InvoicingService
  private readonly printing: PrintingService
  private readonly sysParams = new SystemParamsService()

  constructor(private readonly db: Database) {
    this.saleRepo = new SaleRepository(db)
    this.invoicing = new InvoicingService(db)
    this.printing = new PrintingService(db)
  }

  private getOrder(externalId: string): WebOrderRow | undefined {
    return this.db.prepare(`
      SELECT w.sale_id, w.external_id, w.delivery_type, w.delivery_address, w.fulfillment_status,
             c.name AS customer_name, c.email AS customer_email
      FROM web_orders_processed w
      JOIN sales s ON s.id = w.sale_id
      LEFT JOIN customers c ON c.id = s.customer_id
      WHERE w.external_id = ?
    `).get(externalId) as WebOrderRow | undefined
  }

  async notify(externalId: string, kind: NotifyKind, note: string): Promise<NotifyResult> {
    const order = this.getOrder(externalId)
    if (!order) return { success: false, error: 'Pedido no encontrado.' }
    if (order.fulfillment_status !== 'pending') {
      return { success: false, error: 'Este pedido ya fue avisado al cliente.' }
    }
    const toEmail = order.customer_email?.trim() ?? ''
    if (!toEmail.includes('@')) return { success: false, error: 'El pedido no tiene un email de cliente válido.' }

    const sys = this.sysParams.get()
    if (!sys.smtpHost || !sys.smtpUser || !sys.smtpPass) {
      return { success: false, error: 'Configuración SMTP incompleta. Completá los datos en Parámetros del Sistema.' }
    }

    let sale = this.saleRepo.findById(order.sale_id)
    if (!sale) return { success: false, error: `No se encontró la venta N° ${order.sale_id}.` }

    // 1. Factura: toda venta web se factura. Si ya tiene CAE (p. ej. se facturó
    // en un intento anterior en el que falló el mail) no se vuelve a pedir.
    let invoiced = false
    if (sale.status !== 'AUTHORIZED') {
      if (sale.isBlackSale) return { success: false, error: 'La venta está marcada en negro: no se puede facturar.' }
      const cae = await this.invoicing.solicitarCAE(sale)
      if (!cae.success || !cae.cae) {
        return { success: false, error: `No se pudo facturar: ${cae.error ?? 'error desconocido'}. No se mandó el aviso.` }
      }
      this.saleRepo.updateStatus(sale.id, 'AUTHORIZED', {
        cae: cae.cae,
        caeVto: cae.caeVto ?? '',
        invoiceNumber: cae.invoiceNumber ?? 0,
        puntoVenta: cae.puntoVenta ?? 0,
      })
      invoiced = true
      sale = this.saleRepo.findById(order.sale_id)!
    }

    // 2. Mail con la factura adjunta
    const ticket = await this.printing.buildTicketData(sale)
    const subject = kind === 'ready'
      ? 'Tu pedido está listo para retirar — Pandora Box'
      : 'Tu pedido está en camino — Pandora Box'
    const extraBcc = sys.smtpBcc?.trim()
    const bcc = [WEB_ORDERS_BCC, extraBcc]
      .filter((e): e is string => !!e && e.toLowerCase() !== toEmail.toLowerCase())
      .filter((e, i, arr) => arr.findIndex(x => x.toLowerCase() === e.toLowerCase()) === i)
    const bccLog = bcc.join(', ') || null

    try {
      const pdf = await renderInvoicePdf(ticket)
      const transport = nodemailer.createTransport({
        host: sys.smtpHost,
        port: sys.smtpPort ?? 465,
        secure: (sys.smtpPort ?? 465) === 465,
        auth: { user: sys.smtpUser, pass: sys.smtpPass },
        tls: { rejectUnauthorized: false },
      })
      await transport.sendMail({
        from: `"${sys.smtpFromName || 'Pandora Box - Juegos de Ingenio'}" <${sys.smtpUser}>`,
        to: toEmail,
        bcc: bcc.length ? bcc : undefined,
        replyTo: WEB_ORDERS_BCC,
        subject,
        html: buildNotifyHtml(kind, {
          customerName: order.customer_name ?? '',
          ref: shortOrderRef(order.external_id),
          address: order.delivery_address ?? '',
          note: note.trim(),
        }),
        attachments: [{ filename: invoicePdfFileName(ticket), content: pdf, contentType: 'application/pdf' }],
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logEmail(order.sale_id, toEmail, bccLog, subject, 'error', msg)
      return {
        success: false,
        invoiced,
        error: (invoiced ? 'La factura se emitió, pero no se pudo mandar el mail: ' : 'No se pudo mandar el mail: ') +
          msg + '. Podés reintentar: no se vuelve a facturar.',
      }
    }

    this.logEmail(order.sale_id, toEmail, bccLog, subject, 'sent', null)
    this.db.prepare(`
      UPDATE web_orders_processed SET fulfillment_status = ?, notified_at = ? WHERE external_id = ?
    `).run(kind, localNow(), externalId)
    return { success: true, invoiced }
  }

  markDelivered(externalId: string): void {
    const res = this.db.prepare(`
      UPDATE web_orders_processed SET fulfillment_status = 'delivered', delivered_at = ?
      WHERE external_id = ? AND fulfillment_status IN ('ready', 'shipped')
    `).run(localNow(), externalId)
    if (res.changes === 0) throw new Error('El pedido todavía no fue avisado al cliente, o ya estaba entregado.')
  }

  private logEmail(saleId: number, toEmail: string, bccEmail: string | null, subject: string,
    status: 'sent' | 'error', error: string | null): void {
    try {
      this.db.prepare(`
        INSERT INTO sale_email_log (sale_id, to_email, bcc_email, subject, status, error, sent_at)
        VALUES (?,?,?,?,?,?,?)
      `).run(saleId, toEmail, bccEmail, subject, status, error, localNow())
    } catch (err) {
      console.error('[web-orders] Error registrando el log de envío:', err)
    }
  }
}
