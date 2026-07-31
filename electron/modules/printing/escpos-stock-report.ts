/**
 * Genera un buffer ESC/POS con el listado completo de stock (SKU, producto y
 * cantidad según el sistema), pensado para control físico manual: cada línea
 * deja un casillero en blanco para anotar el conteo real durante la auditoría.
 */

import { cmdReset, cmdAlign, cmdBold, lf, cmdCut, txt } from '../printer-config/service'
import type { StockItem } from '../stock/types'

// Font B (ESC M 1): ~56 caracteres por línea
const W = 56

function fontB(): Buffer { return Buffer.from([0x1b, 0x4d, 0x01]) }

function sep(char = '-'): Buffer {
  return Buffer.concat([txt(char.repeat(W)), lf(1)])
}

export function buildStockReportBuffer(items: StockItem[]): Buffer {
  const parts: Buffer[] = []
  const p = (...bufs: Buffer[]) => parts.push(...bufs)

  const now = new Date()
  const fecha = now.toLocaleDateString('es-AR')
  const hora = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  p(cmdReset(), fontB())

  p(cmdAlign('center'), cmdBold(true))
  p(txt('LISTADO DE STOCK'), lf(1))
  p(cmdBold(false))
  p(txt(`Fecha: ${fecha} ${hora}`), lf(1))
  p(txt(`Total articulos: ${items.length}`), lf(1))
  p(sep())

  // Columnas: SKU(7) Producto(31) Sistema(6) Real(9, casillero en blanco)
  const CSKU = 7, CNAME = 31, CSYS = 6
  p(cmdAlign('left'))
  p(txt('SKU'.padEnd(CSKU) + 'Producto'.padEnd(CNAME) + 'Sist.'.padStart(CSYS) + '  Real'), lf(1))
  p(sep())

  const sorted = [...items].sort((a, b) => a.productName.localeCompare(b.productName, 'es'))

  for (const item of sorted) {
    const sku = item.sku.slice(0, CSKU - 1).padEnd(CSKU)
    const sys = String(item.currentStock).padStart(CSYS)
    const nameLines = item.productName.length <= CNAME
      ? [item.productName.padEnd(CNAME)]
      : [item.productName.slice(0, CNAME)]

    p(txt(sku + nameLines[0] + sys + '  ____'), lf(1))
    if (item.productName.length > CNAME) {
      const rest = item.productName.slice(CNAME)
      p(txt(' '.repeat(CSKU) + rest.slice(0, CNAME)), lf(1))
    }
  }

  p(sep())
  p(cmdAlign('center'))
  p(txt(`Fin del listado -- ${sorted.length} articulos`), lf(3))
  p(cmdCut(true))

  return Buffer.concat(parts)
}
