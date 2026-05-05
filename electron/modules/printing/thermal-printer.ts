import type { TicketData } from './types'

/**
 * Thermal Printer - ESC/POS stub
 *
 * PRODUCTION IMPLEMENTATION:
 * ===========================
 * Use 'thermal-printer-encoder' or 'escpos' npm package.
 *
 * ESC/POS Commands Reference:
 * - ESC @ (0x1B 0x40)     - Initialize printer
 * - ESC E n (0x1B 0x45)   - Bold: n=1 on, n=0 off
 * - ESC a n (0x1B 0x61)   - Alignment: 0=left, 1=center, 2=right
 * - GS ! n (0x1D 0x21)    - Text size multiplier
 * - LF (0x0A)              - Print and line feed
 * - GS V (0x1D 0x56)      - Cut paper: 0=full cut, 1=partial cut
 *
 * Example with thermal-printer-encoder:
 * ```ts
 * import ThermalPrinterEncoder from 'thermal-printer-encoder'
 * const encoder = new ThermalPrinterEncoder({ language: 'esc-pos' })
 * const result = encoder
 *   .initialize()
 *   .align('center')
 *   .bold(true)
 *   .line(companyName)
 *   .bold(false)
 *   .line(companyCuit)
 *   .newline()
 *   // ... more lines ...
 *   .cut()
 *   .encode()
 *
 * // Send to printer via USB/Serial/Network
 * // USB example:
 * import { exec } from 'child_process'
 * const fs = require('fs')
 * fs.writeFileSync('/dev/usb/lp0', result)
 * // Or: exec(`lp -d PRINTER_NAME /path/to/file`)
 * ```
 *
 * For Windows, use electron shell to open a PDF or use a system printer.
 * For cross-platform, consider generating a PDF with 'pdfkit' and printing that.
 */

export function printTicket(ticketData: TicketData): void {
  // STUB: Log ticket to console for development
  console.log('\n' + '='.repeat(48))
  console.log(centerText(ticketData.companyName, 48))
  console.log(centerText(`CUIT: ${ticketData.companyCuit}`, 48))
  console.log(centerText(ticketData.companyAddress, 48))
  console.log(centerText(ticketData.condicionIva, 48))
  console.log('-'.repeat(48))
  console.log(centerText(`${ticketData.invoiceType} Nº ${ticketData.invoiceNumber}`, 48))
  console.log(centerText(`Fecha: ${ticketData.date}`, 48))
  console.log('-'.repeat(48))
  console.log(`Cliente: ${ticketData.customerName}`)
  console.log(`${ticketData.customerDocType}: ${ticketData.customerDoc}`)
  console.log(`Cond. IVA: ${ticketData.customerCondicionIva}`)
  console.log('-'.repeat(48))
  console.log('CANT  DESCRIPCIÓN                   SUBTOTAL')
  console.log('-'.repeat(48))

  for (const item of ticketData.items) {
    const desc = item.name.slice(0, 25).padEnd(25)
    const qty = String(item.quantity).padStart(4)
    const sub = `$${item.subtotal.toFixed(2)}`.padStart(10)
    console.log(`${qty}  ${desc} ${sub}`)
  }

  console.log('-'.repeat(48))
  console.log(`${'Subtotal:'.padEnd(36)}$${ticketData.subtotal.toFixed(2).padStart(10)}`)
  console.log(`${'IVA:'.padEnd(36)}$${ticketData.taxAmount.toFixed(2).padStart(10)}`)
  console.log(`${'TOTAL:'.padEnd(36)}$${ticketData.total.toFixed(2).padStart(10)}`)
  console.log('-'.repeat(48))

  if (ticketData.isAuthorized && ticketData.cae) {
    console.log(centerText('COMPROBANTE AUTORIZADO', 48))
    console.log(`CAE: ${ticketData.cae}`)
    console.log(`Vto. CAE: ${ticketData.caeVto}`)
    console.log('[QR AFIP aquí]')
  } else {
    console.log(centerText('COMPROBANTE INTERNO', 48))
    console.log(centerText('No válido como factura fiscal', 48))
    if (ticketData.internalReceiptNumber) {
      console.log(centerText(`Remito Nº ${ticketData.internalReceiptNumber}`, 48))
    }
  }

  console.log('='.repeat(48) + '\n')
}

function centerText(text: string, width: number): string {
  const padding = Math.max(0, Math.floor((width - text.length) / 2))
  return ' '.repeat(padding) + text
}
