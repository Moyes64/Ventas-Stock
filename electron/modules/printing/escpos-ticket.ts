/**
 * Genera un buffer ESC/POS para el ticket de venta.
 * Usa Font B (ESC M 1, ~56 chars/línea) para replicar la densidad de información
 * del ticket HTML original, con la calidad de impresión del canal ESC/POS RAW.
 *
 * Layout basado en el ticket HTML (system-printer.ts):
 *   - Encabezado: nombre centrado grande; CUIT|dir en misma línea; IVA|InicAct; IIBB
 *   - Título de documento: separado con líneas, centrado y negrita
 *   - Bloque cliente
 *   - Tabla de artículos: Descripcion | Cant | P.Unit | Total en una sola línea
 *   - Totales con descuentos si los hay
 *   - Pie: estado (autorizado/interno), CAE si aplica
 */

import {
  cmdReset,
  cmdAlign,
  cmdBold,
  lf,
  cmdCut,
  txt,
} from '../printer-config/service'
import type { TicketData } from './types'
import { generateQrEscPos } from './qr-generator'

// Font A (ESC M 0): ~42 chars/línea — usado solo para el nombre de empresa y TOTAL
// Font B (ESC M 1): ~56 chars/línea — todo el resto del ticket
const W_A = 42
const W_B = 56

function fontA(): Buffer { return Buffer.from([0x1b, 0x4d, 0x00]) }
function fontB(): Buffer { return Buffer.from([0x1b, 0x4d, 0x01]) }

function center(s: string, w: number): string {
  if (s.length >= w) return s.slice(0, w)
  const pad = Math.floor((w - s.length) / 2)
  return ' '.repeat(pad) + s
}

/** Dos columnas en una línea: izquierda y derecha dentro del ancho w */
function twoCol(left: string, right: string, w: number): string {
  const gap = w - left.length - right.length
  if (gap <= 1) {
    // No entra: poner solo izquierda truncada
    return left.slice(0, w)
  }
  return left + ' '.repeat(gap) + right
}

function sep(w: number, char = '-'): Buffer {
  return Buffer.concat([txt(char.repeat(w)), lf(1)])
}

function formatArs(n: number): string {
  const [int, dec] = n.toFixed(2).split('.')
  const intFmt = int!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `$ ${intFmt},${dec}`
}

export function buildEscPosTicket(ticketData: TicketData, _darkness: number): Buffer {
  const parts: Buffer[] = []
  const p = (...bufs: Buffer[]) => parts.push(...bufs)

  p(cmdReset())

  // ── Nombre de empresa — Font A, centrado, negrita ────────────────────────────
  p(fontA(), cmdAlign('center'), cmdBold(true))
  p(txt(ticketData.companyName.slice(0, W_A)), lf(1))
  p(cmdBold(false))

  // ── Datos empresa — Font B, dos columnas ─────────────────────────────────────
  p(fontB(), cmdAlign('left'))

  // Línea 1: CUIT (izq) | Dirección (der)
  const cuitLeft = `CUIT: ${ticketData.companyCuit}`
  const addrRight = ticketData.companyAddress ?? ''
  if (addrRight) {
    p(txt(twoCol(cuitLeft, addrRight, W_B)), lf(1))
  } else {
    p(txt(center(cuitLeft, W_B)), lf(1))
  }

  // Línea 2: IVA (izq) | Inic.Act (der)
  const ivaLeft  = `IVA: ${ticketData.condicionIva}`
  const inicRight = ticketData.inicioActividades ? `Inic.Act: ${ticketData.inicioActividades}` : ''
  if (inicRight) {
    p(txt(twoCol(ivaLeft, inicRight, W_B)), lf(1))
  } else {
    p(txt(ivaLeft), lf(1))
  }

  // Línea 3: IIBB (solo si existe)
  if (ticketData.condicionIIBB) {
    p(txt(`IIBB: ${ticketData.condicionIIBB}`), lf(1))
  }

  p(sep(W_B))

  // ── Título del documento ─────────────────────────────────────────────────────
  const docTitle = ticketData.internalReceiptNumber && !ticketData.isAuthorized
    ? `REMITO INTERNO N. ${ticketData.internalReceiptNumber}`
    : `${ticketData.invoiceType} N. ${ticketData.invoiceNumber}`

  p(cmdAlign('center'), cmdBold(true))
  p(txt(docTitle.slice(0, W_B)), lf(1))
  p(cmdBold(false))
  p(cmdAlign('right'), txt(`Fecha: ${ticketData.date}`), lf(1))
  p(sep(W_B))

  // ── Bloque cliente ───────────────────────────────────────────────────────────
  p(cmdAlign('left'))
  p(txt(`Cliente: ${ticketData.customerName}`.slice(0, W_B)), lf(1))
  p(txt(`${ticketData.customerDocType}: ${ticketData.customerDoc}`.slice(0, W_B)), lf(1))
  p(txt(`Cond. IVA: ${ticketData.customerCondicionIva}`.slice(0, W_B)), lf(1))
  p(sep(W_B))

  // ── Tabla de artículos ───────────────────────────────────────────────────────
  // Anchos de columna para W_B=56: Desc=24, Cant=5, P.Unit=13, Total=14
  const CD = 24, CQ = 5, CP = 13, CS = 14

  const hdrDesc  = 'Descripcion'.padEnd(CD)
  const hdrCant  = 'Cant'.padStart(CQ)
  const hdrPrice = 'P.Unit'.padStart(CP)
  const hdrTotal = 'Total'.padStart(CS)
  p(txt(hdrDesc + hdrCant + hdrPrice + hdrTotal), lf(1))
  p(sep(W_B))

  for (const item of ticketData.items) {
    const qtyStr   = String(item.quantity).padStart(CQ)
    const priceStr = formatArs(item.unitPrice).padStart(CP)
    const subStr   = formatArs(item.subtotal).padStart(CS)

    if (item.name.length <= CD) {
      // Todo en una línea (igual que el ticket HTML original)
      p(txt(item.name.padEnd(CD) + qtyStr + priceStr + subStr), lf(1))
    } else {
      // Nombre largo: nombre en línea 1, datos en línea 2 indentados
      p(txt(item.name.slice(0, W_B)), lf(1))
      p(txt(' '.repeat(CD) + qtyStr + priceStr + subStr), lf(1))
    }
  }

  p(sep(W_B))

  // ── Totales ──────────────────────────────────────────────────────────────────
  p(cmdAlign('left'))
  if (ticketData.discountLines.length > 0) {
    const stAmt = formatArs(ticketData.grossSubtotal)
    p(txt('Subtotal:'.padEnd(W_B - stAmt.length) + stAmt), lf(1))
    for (const d of ticketData.discountLines) {
      const label = `Dto. ${d.descripcion} (${d.porcentaje}%):`
      const amt   = `-${formatArs(d.amount)}`
      p(txt(label.slice(0, W_B - amt.length).padEnd(W_B - amt.length) + amt), lf(1))
    }
  }

  // TOTAL en Font A (más grande y prominente)
  const totalAmt = formatArs(ticketData.total)
  p(fontA(), cmdBold(true))
  p(txt('TOTAL:'.padEnd(W_A - totalAmt.length) + totalAmt), lf(1))
  p(cmdBold(false))
  p(fontB())
  p(sep(W_B))

  // ── Estado ───────────────────────────────────────────────────────────────────
  p(cmdAlign('center'))
  if (ticketData.isAuthorized && ticketData.cae) {
    p(txt('COMPROBANTE AUTORIZADO AFIP'), lf(1))
    p(txt(`CAE: ${ticketData.cae}`), lf(1))
    p(txt(`Vto. CAE: ${ticketData.caeVto ?? ''}`), lf(1))
    if (ticketData.qrPayload) {
      p(lf(1))
      p(generateQrEscPos(ticketData.qrPayload))
      p(lf(1))
    }
  } else {
    p(txt('COMPROBANTE INTERNO'), lf(1))
    p(txt('No valido como factura fiscal'), lf(1))
  }

  p(sep(W_B))
  p(txt('Gracias por su compra -- Ventas-Stock'), lf(5))
  p(cmdCut(true))

  return Buffer.concat(parts)
}
