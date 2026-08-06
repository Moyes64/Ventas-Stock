import { ipcMain } from 'electron'
import nodemailer from 'nodemailer'
import { SystemParamsService } from '../modules/system-params/service'
import { PrintingService } from '../modules/printing/service'
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

function buildInvoiceHtml(ticket: Awaited<ReturnType<PrintingService['buildTicketData']>>): string {
  if (!ticket) return ''

  const fmt = (n: number) =>
    '$ ' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.').replace('.', '#').replace(/\./g, '.').replace('#', ',')

  const itemRows = ticket.items.map(i => `
    <tr>
      <td style="padding:4px 8px">${i.name}</td>
      <td style="padding:4px 8px;text-align:center">${i.quantity}</td>
      <td style="padding:4px 8px;text-align:right">${fmt(i.unitPrice)}</td>
      <td style="padding:4px 8px;text-align:right">${fmt(i.subtotal)}</td>
    </tr>`).join('')

  const caeBlock = ticket.isAuthorized && ticket.cae ? `
    <p style="margin:4px 0"><strong>CAE:</strong> ${ticket.cae}</p>
    <p style="margin:4px 0"><strong>Vto. CAE:</strong> ${ticket.caeVto ?? ''}</p>` : ''

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;color:#222;max-width:600px;margin:0 auto;padding:24px">

  <div style="text-align:center;margin-bottom:16px">
    <h2 style="margin:0">${ticket.companyName}</h2>
    <p style="margin:4px 0;font-size:13px">CUIT: ${ticket.companyCuit} &nbsp;|&nbsp; ${ticket.companyAddress}</p>
    <p style="margin:4px 0;font-size:13px">IVA: ${ticket.condicionIva}</p>
  </div>

  <hr style="border:1px solid #ddd">

  <div style="text-align:center;margin:12px 0">
    <h3 style="margin:0">${ticket.isAuthorized ? ticket.invoiceType : 'COMPROBANTE INTERNO'} N° ${ticket.invoiceNumber}</h3>
    <p style="margin:4px 0;font-size:13px">Fecha: ${ticket.date}</p>
  </div>

  <hr style="border:1px solid #ddd">

  <p style="margin:4px 0"><strong>Cliente:</strong> ${ticket.customerName}</p>
  <p style="margin:4px 0"><strong>${ticket.customerDocType}:</strong> ${ticket.customerDoc}</p>

  <hr style="border:1px solid #ddd">

  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead style="background:#f5f5f5">
      <tr>
        <th style="padding:6px 8px;text-align:left">Descripción</th>
        <th style="padding:6px 8px;text-align:center">Cant.</th>
        <th style="padding:6px 8px;text-align:right">P.Unit</th>
        <th style="padding:6px 8px;text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <hr style="border:1px solid #ddd">

  <p style="text-align:right;font-size:18px;font-weight:bold;margin:8px 0">
    TOTAL: ${fmt(ticket.total)}
  </p>

  <hr style="border:1px solid #ddd">

  <div style="text-align:center;font-size:13px;color:#555;margin-top:12px">
    ${ticket.isAuthorized
      ? `<p style="margin:4px 0"><strong>COMPROBANTE AUTORIZADO AFIP</strong></p>${caeBlock}`
      : `<p style="margin:4px 0;color:#c00">Comprobante interno — no válido como factura fiscal</p>`
    }
  </div>

</body>
</html>`
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
