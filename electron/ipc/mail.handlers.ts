import { ipcMain } from 'electron'
import nodemailer from 'nodemailer'
import { SystemParamsService } from '../modules/system-params/service'
import { PrintingService } from '../modules/printing/service'
import { buildInvoiceHtml } from '../modules/printing/invoice-html'
import { SaleRepository } from '../modules/sales/repository'
import type { Database } from 'better-sqlite3'

export interface MailConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  fromName: string
}

export interface SendInvoiceResult {
  success: boolean
  error?: string
}

export interface SaleEmailLogEntry {
  id: number
  saleId: number
  toEmail: string
  bccEmail: string | null
  subject: string
  status: 'sent' | 'error'
  error: string | null
  sentAt: string
}

interface SaleEmailLogRow {
  id: number
  sale_id: number
  to_email: string
  bcc_email: string | null
  subject: string
  status: string
  error: string | null
  sent_at: string
}

export function registerMailHandlers(db: Database): void {
  const sysParamsSvc = new SystemParamsService()
  const printingSvc  = new PrintingService(db)
  const saleRepo     = new SaleRepository(db)

  // El envío es SMTP directo (nodemailer), no pasa por el cliente de correo
  // del usuario -- por eso no queda copia en ninguna carpeta "Enviados" (eso
  // lo hace el cliente de correo vía IMAP APPEND, no el protocolo SMTP). Este
  // log es el único registro de qué se mandó, a quién y si falló.
  const insertLog = db.prepare(`
    INSERT INTO sale_email_log (sale_id, to_email, bcc_email, subject, status, error)
    VALUES (@saleId, @toEmail, @bccEmail, @subject, @status, @error)
  `)

  function logSend(entry: {
    saleId: number; toEmail: string; bccEmail: string | null; subject: string
    status: 'sent' | 'error'; error: string | null
  }): void {
    try {
      insertLog.run(entry)
    } catch (err) {
      console.error('[mail] Error registrando el log de envío:', err)
    }
  }

  ipcMain.handle('mail:sendInvoice', async (_e, saleId: number, toEmail: string): Promise<SendInvoiceResult> => {
    try {
      const sys = sysParamsSvc.get()

      if (!sys.smtpHost || !sys.smtpUser || !sys.smtpPass) {
        return { success: false, error: 'Configuración SMTP incompleta. Completá los datos en Parámetros del Sistema.' }
      }
      if (!toEmail || !toEmail.includes('@')) {
        return { success: false, error: 'Email del cliente inválido o no informado.' }
      }

      const sale = saleRepo.findById(saleId)
      if (!sale) return { success: false, error: `No se encontró la venta N° ${saleId}.` }

      const ticket = await printingSvc.buildTicketData(sale)
      if (!ticket) return { success: false, error: `No se pudo construir el comprobante N° ${saleId}.` }

      const transport = nodemailer.createTransport({
        host: sys.smtpHost,
        port: sys.smtpPort ?? 465,
        secure: (sys.smtpPort ?? 465) === 465,
        auth: { user: sys.smtpUser, pass: sys.smtpPass },
        tls: { rejectUnauthorized: false },
      })

      const docLabel = ticket.isAuthorized
        ? `${ticket.invoiceType} N° ${ticket.invoiceNumber}`
        : `Comprobante Interno N° ${saleId}`
      const subject = `${docLabel} — ${sys.denominacion || 'Ventas-Stock'}`
      const bccEmail = sys.smtpBcc?.trim() || null

      try {
        await transport.sendMail({
          from: `"${sys.smtpFromName || sys.denominacion || 'Ventas-Stock'}" <${sys.smtpUser}>`,
          to: toEmail,
          bcc: bccEmail ?? undefined,
          subject,
          html: buildInvoiceHtml(ticket),
        })
      } catch (sendErr) {
        const errorMsg = sendErr instanceof Error ? sendErr.message : String(sendErr)
        logSend({ saleId, toEmail, bccEmail, subject, status: 'error', error: errorMsg })
        return { success: false, error: errorMsg }
      }

      logSend({ saleId, toEmail, bccEmail, subject, status: 'sent', error: null })
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Historial de envíos de un comprobante (todos los intentos, no solo el último)
  ipcMain.handle('mail:getLog', (_e, saleId: number): SaleEmailLogEntry[] => {
    const rows = db.prepare(`
      SELECT id, sale_id, to_email, bcc_email, subject, status, error, sent_at
      FROM sale_email_log
      WHERE sale_id = ?
      ORDER BY sent_at DESC, id DESC
    `).all(saleId) as SaleEmailLogRow[]

    return rows.map(r => ({
      id: r.id,
      saleId: r.sale_id,
      toEmail: r.to_email,
      bccEmail: r.bcc_email,
      subject: r.subject,
      status: r.status as 'sent' | 'error',
      error: r.error,
      sentAt: r.sent_at,
    }))
  })
}
