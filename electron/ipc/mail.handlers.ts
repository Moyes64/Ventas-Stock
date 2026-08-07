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

export function registerMailHandlers(db: Database): void {
  const sysParamsSvc = new SystemParamsService()
  const printingSvc  = new PrintingService(db)
  const saleRepo     = new SaleRepository(db)

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

      await transport.sendMail({
        from: `"${sys.smtpFromName || sys.denominacion || 'Ventas-Stock'}" <${sys.smtpUser}>`,
        to: toEmail,
        subject: `${docLabel} — ${sys.denominacion || 'Ventas-Stock'}`,
        html: buildInvoiceHtml(ticket),
      })

      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
