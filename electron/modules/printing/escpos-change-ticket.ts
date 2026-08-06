/**
 * Genera el buffer ESC/POS para el ticket de cambio.
 * Un ticket por item de la venta, cada uno con QR escaneable en Cambios/Devoluciones.
 *
 * QR payload (JSON): { v:1, saleId, productId, customerId, qty, amount, date }
 */

import {
  cmdReset,
  cmdAlign,
  cmdBold,
  lf,
  cmdCut,
  txt,
} from '../printer-config/service'
import { generateQrEscPosFromText } from './qr-generator'

const W = 42   // Font A, 80mm paper

function fontA(): Buffer { return Buffer.from([0x1b, 0x4d, 0x00]) }

function center(s: string): string {
  if (s.length >= W) return s.slice(0, W)
  const pad = Math.floor((W - s.length) / 2)
  return ' '.repeat(pad) + s
}

function twoCol(left: string, right: string): string {
  const gap = W - left.length - right.length
  if (gap < 1) return left.slice(0, W)
  return left + ' '.repeat(gap) + right
}

function sep(char = '-'): Buffer {
  return Buffer.concat([txt(char.repeat(W)), lf(1)])
}

function formatArs(n: number): string {
  const [int, dec] = n.toFixed(2).split('.')
  const intFmt = int!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `$ ${intFmt},${dec}`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export interface ChangeTicketItem {
  productId: number
  productName: string
  quantity: number
  unitPrice: number
}

export interface ChangeTicketData {
  saleId: number
  saleDate: string       // YYYY-MM-DD
  companyName: string
  customerId: number | null
  customerName: string
  items: ChangeTicketItem[]
  diasCambio: number
}

export function buildChangeTicketBuffer(data: ChangeTicketData): Buffer {
  const parts: Buffer[] = []
  const p = (...bufs: Buffer[]) => parts.push(...bufs)

  for (const item of data.items) {
    p(cmdReset(), fontA())

    // Header
    p(cmdAlign('center'), cmdBold(true))
    p(txt(data.companyName.slice(0, W)), lf(1))
    p(cmdBold(false))
    p(sep('='))
    p(txt('TICKET DE CAMBIO'), lf(1))
    p(sep('='))

    // Datos de venta
    p(cmdAlign('left'))
    p(txt(twoCol(`Venta N°: ${data.saleId}`, fmtDate(data.saleDate))), lf(1))
    p(txt(`Cliente: ${data.customerName.slice(0, W - 9)}`), lf(1))
    p(sep())

    // Producto
    p(cmdAlign('left'), cmdBold(true))
    p(txt(item.productName.slice(0, W)), lf(1))
    if (item.productName.length > W) p(txt(item.productName.slice(W, W * 2)), lf(1))
    p(cmdBold(false))
    p(txt(`Cantidad: ${item.quantity}`), lf(1))
    p(sep())

    // Validez
    const vencimiento = addDays(data.saleDate, data.diasCambio)
    p(cmdAlign('center'))
    p(txt(`Valido para cambio hasta:`), lf(1))
    p(cmdBold(true))
    p(txt(vencimiento), lf(1))
    p(cmdBold(false))
    p(txt(`(${data.diasCambio} dias desde la fecha de venta)`), lf(1))
    p(sep())

    // QR
    const qrPayload = JSON.stringify({
      v: 1,
      saleId: data.saleId,
      productId: item.productId,
      customerId: data.customerId ?? 0,
      qty: item.quantity,
      amount: item.unitPrice * item.quantity,
      date: data.saleDate,
    })
    p(cmdAlign('center'))
    p(generateQrEscPosFromText(qrPayload, 3))
    p(lf(2))
    p(cmdAlign('left'))
    p(txt('El producto sera aceptado para su cambio'), lf(1))
    p(txt('o devolucion solo en el caso de estar en'), lf(1))
    p(txt('las mismas condiciones en que fue retirado'), lf(1))
    p(txt('del local.'), lf(1))
    p(lf(1))
    p(cmdAlign('center'))
    p(txt('Presentar este ticket para cambio'), lf(1))
    p(txt('o devolucion del producto'), lf(1))
    p(lf(6))

    p(cmdCut())
  }

  return Buffer.concat(parts)
}
