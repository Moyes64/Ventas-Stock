import { BrowserWindow } from 'electron'
import os from 'os'
import path from 'path'
import fs from 'fs'
import type { TicketData } from './types'

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function generateTicketHTML(ticketData: TicketData, documentType: 'invoice' | 'delivery'): string {
  const isDelivery = documentType === 'delivery'

  const docTitle = isDelivery
    ? `REMITO INTERNO Nº ${ticketData.internalReceiptNumber ?? ticketData.invoiceNumber}`
    : `${escapeHtml(ticketData.invoiceType)}<br>Nº ${escapeHtml(ticketData.invoiceNumber)}`

  const itemsRows = ticketData.items
    .map(
      item => `
    <tr>
      <td class="item-name">${escapeHtml(item.name)}</td>
      <td class="item-qty">${item.quantity}</td>
      <td class="item-price">${formatCurrency(item.unitPrice)}</td>
      <td class="item-sub">${formatCurrency(item.subtotal)}</td>
    </tr>`,
    )
    .join('')

  const qrSection =
    ticketData.qrBase64
      ? `<div class="qr"><img src="${ticketData.qrBase64}" alt="QR AFIP" /></div>`
      : ''

  const statusSection = ticketData.isAuthorized && ticketData.cae
    ? `<div class="separator"></div>
    <div class="cae-info">
      <div>CAE: ${escapeHtml(ticketData.cae)}</div>
      <div>Vto. CAE: ${escapeHtml(ticketData.caeVto ?? '')}</div>
    </div>
    ${qrSection}
    <div class="authorized-badge">COMPROBANTE AUTORIZADO AFIP</div>`
    : `<div class="internal-badge">COMPROBANTE INTERNO<br>No válido como factura fiscal</div>`

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Impresión</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 3mm 4mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 72mm;
      font-family: 'Courier New', Courier, monospace;
      font-size: 10px;
      line-height: 1.4;
      color: #000;
      background: #fff;
    }
    .center { text-align: center; }
    .right  { text-align: right; }
    .bold   { font-weight: bold; }
    .header { text-align: center; margin-bottom: 6px; }
    .company-name { font-size: 13px; font-weight: bold; }
    .company-info { font-size: 9px; margin-top: 1px; }
    .doc-title {
      border: 1px solid #000;
      padding: 4px 6px;
      text-align: center;
      font-size: 11px;
      font-weight: bold;
      margin: 5px 0;
    }
    .date-line { font-size: 9.5px; text-align: right; margin-bottom: 4px; }
    .separator { border-top: 1px dashed #000; margin: 5px 0; }
    .customer-block { font-size: 9.5px; margin-bottom: 4px; }
    .customer-block div { margin-bottom: 1px; }
    table { width: 100%; border-collapse: collapse; }
    thead th {
      font-size: 9px;
      text-align: left;
      border-bottom: 1px solid #000;
      padding-bottom: 2px;
    }
    thead .r { text-align: right; }
    tbody td { padding: 1px 0; vertical-align: top; font-size: 9.5px; }
    .item-name  { word-break: break-word; }
    .item-qty   { width: 8mm;  text-align: right; }
    .item-price { width: 18mm; text-align: right; }
    .item-sub   { width: 18mm; text-align: right; font-weight: bold; }
    .totals { margin-top: 5px; }
    .total-row {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      padding: 1px 0;
    }
    .total-row--final {
      font-weight: bold;
      font-size: 13px;
      border-top: 1px solid #000;
      padding-top: 4px;
      margin-top: 2px;
    }
    .cae-info { font-size: 9px; word-break: break-all; margin: 3px 0; }
    .qr { text-align: center; margin: 5px 0; }
    .qr img { width: 55px; height: 55px; }
    .authorized-badge {
      text-align: center;
      font-size: 9px;
      font-weight: bold;
      background: #000;
      color: #fff;
      padding: 3px;
      margin: 4px 0;
    }
    .internal-badge {
      text-align: center;
      font-size: 9px;
      padding: 3px;
      border: 1px dashed #000;
      margin: 4px 0;
    }
    .footer { text-align: center; font-size: 8px; margin-top: 8px; color: #555; }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">${escapeHtml(ticketData.companyName)}</div>
    <div class="company-info">CUIT: ${escapeHtml(ticketData.companyCuit)}</div>
    ${ticketData.companyAddress ? `<div class="company-info">${escapeHtml(ticketData.companyAddress)}</div>` : ''}
    <div class="company-info">Cond. IVA: ${escapeHtml(ticketData.condicionIva)}</div>
  </div>

  <div class="separator"></div>

  <div class="doc-title">${docTitle}</div>
  <div class="date-line">Fecha: ${escapeHtml(ticketData.date)}</div>

  <div class="separator"></div>

  <div class="customer-block">
    <div>Cliente: ${escapeHtml(ticketData.customerName)}</div>
    <div>${escapeHtml(ticketData.customerDocType)}: ${escapeHtml(ticketData.customerDoc)}</div>
    <div>Cond. IVA: ${escapeHtml(ticketData.customerCondicionIva)}</div>
  </div>

  <div class="separator"></div>

  <table>
    <thead>
      <tr>
        <th>Descripción</th>
        <th class="r">Qty</th>
        <th class="r">P.Unit</th>
        <th class="r">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemsRows}
    </tbody>
  </table>

  <div class="separator"></div>

  <div class="totals">
    <div class="total-row">
      <span>Subtotal (s/IVA):</span>
      <span>${formatCurrency(ticketData.subtotal)}</span>
    </div>
    <div class="total-row">
      <span>IVA:</span>
      <span>${formatCurrency(ticketData.taxAmount)}</span>
    </div>
    <div class="total-row total-row--final">
      <span>TOTAL:</span>
      <span>${formatCurrency(ticketData.total)}</span>
    </div>
  </div>

  <div class="separator"></div>

  ${statusSection}

  <div class="footer">Gracias por su compra — Ventas-Stock</div>
</body>
</html>`
}

/**
 * Opens a hidden BrowserWindow, loads the 80mm ticket HTML, and shows the
 * system print dialog so the user can choose any installed printer.
 *
 * @param ticketData  Data built by PrintingService.buildTicketData()
 * @param documentType  'invoice' = Factura / 'delivery' = Remito interno
 */
export async function printSystemTicket(
  ticketData: TicketData,
  documentType: 'invoice' | 'delivery' = 'invoice',
): Promise<void> {
  const html = generateTicketHTML(ticketData, documentType)

  // Write to a temp file so large base64 QR images don't overflow data: URIs
  const tmpFile = path.join(os.tmpdir(), `ventas-ticket-${Date.now()}.html`)
  fs.writeFileSync(tmpFile, html, 'utf-8')

  const win = new BrowserWindow({
    width: 400,
    height: 600,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      javascript: false,
    },
  })

  try {
    await win.loadFile(tmpFile)

    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        { silent: false, printBackground: true },
        (success: boolean, errorType: string) => {
          // 'cancelled' means the user closed the dialog — treat as success
          if (success || errorType === 'cancelled') {
            resolve()
          } else {
            reject(new Error(`Error de impresión: ${errorType}`))
          }
        },
      )
    })
  } finally {
    win.close()
    try {
      fs.unlinkSync(tmpFile)
    } catch {
      // ignore cleanup errors
    }
  }
}
