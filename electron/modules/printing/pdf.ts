import { BrowserWindow, dialog, shell } from 'electron'
import os from 'os'
import path from 'path'
import fs from 'fs'
import type { TicketData } from './types'
import { buildInvoiceHtml } from './invoice-html'

export interface ExportPdfResult {
  success: boolean
  filePath?: string
  canceled?: boolean
  error?: string
}

function defaultFileName(ticket: TicketData): string {
  const label = ticket.isAuthorized
    ? `${ticket.invoiceType} ${ticket.invoiceNumber}`
    : `Comprobante Interno ${ticket.internalReceiptNumber ?? ticket.invoiceNumber}`
  // Nombre de archivo: sin caracteres inválidos en Windows.
  return `${label.replace(/[\\/:*?"<>|]/g, '-')}.pdf`
}

/**
 * Exporta el comprobante a PDF con el mismo HTML "documento" que ya usa el
 * email (buildInvoiceHtml) — no el ticket térmico de 80mm. Mismo patrón que
 * printSystemTicket (system-printer.ts): BrowserWindow oculto + HTML en un
 * archivo temporal, pero acá se llama printToPDF() en vez de abrir el
 * diálogo de impresión del sistema.
 */
export async function exportInvoicePdf(ticket: TicketData): Promise<ExportPdfResult> {
  const html = buildInvoiceHtml(ticket)
  const tmpFile = path.join(os.tmpdir(), `ventas-invoice-${Date.now()}.html`)
  fs.writeFileSync(tmpFile, html, 'utf-8')

  const win = new BrowserWindow({
    width: 800,
    height: 1000,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  try {
    await win.loadFile(tmpFile)
    const pdfBuffer = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })

    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Guardar comprobante en PDF',
      defaultPath: defaultFileName(ticket),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (canceled || !filePath) return { success: false, canceled: true }

    fs.writeFileSync(filePath, pdfBuffer)
    // Best-effort: shell.openPath no rechaza en error, resuelve con un string
    // de error — si falla, el archivo ya quedó guardado igual, no bloquea el resultado.
    void shell.openPath(filePath)
    return { success: true, filePath }
  } finally {
    win.close()
    try {
      fs.unlinkSync(tmpFile)
    } catch {
      // ignore cleanup errors
    }
  }
}
