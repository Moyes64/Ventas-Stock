/**
 * Genera un buffer ESC/POS con el listado de precios: producto, costo,
 * porcentaje de ganancia y precio al público, pensado para consulta rápida
 * en el mostrador.
 */

import { cmdReset, cmdAlign, cmdBold, lf, cmdCut, txt } from '../printer-config/service'
import type { Product } from '../catalog/types'

// Font B (ESC M 1): ~56 caracteres por línea
const W = 56

function fontB(): Buffer { return Buffer.from([0x1b, 0x4d, 0x01]) }

function sep(char = '-'): Buffer {
  return Buffer.concat([txt(char.repeat(W)), lf(1)])
}

function money(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function buildPriceReportBuffer(products: Product[], supplierName?: string): Buffer {
  const parts: Buffer[] = []
  const p = (...bufs: Buffer[]) => parts.push(...bufs)

  const now = new Date()
  const fecha = now.toLocaleDateString('es-AR')
  const hora = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  p(cmdReset(), fontB())

  p(cmdAlign('center'), cmdBold(true))
  p(txt('LISTADO DE PRECIOS'), lf(1))
  p(cmdBold(false))
  if (supplierName) {
    p(cmdBold(true))
    p(txt(`Proveedor: ${supplierName}`), lf(1))
    p(cmdBold(false))
  }
  p(txt(`Fecha: ${fecha} ${hora}`), lf(1))
  p(txt(`Total articulos: ${products.length}`), lf(1))
  p(sep())

  // Columnas: Producto(24) Costo(10) Gan.%(7) P.Publico(15)
  const CNAME = 24, CCOST = 10, CGAIN = 7, CPRICE = 15
  p(cmdAlign('left'))
  p(txt(
    'Producto'.padEnd(CNAME) +
    'Costo'.padStart(CCOST) +
    'Gan.%'.padStart(CGAIN) +
    'P.Publico'.padStart(CPRICE)
  ), lf(1))
  p(sep())

  const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name, 'es'))

  for (const product of sorted) {
    const cost = money(product.cost).padStart(CCOST)
    const gain = `${product.gainPercent.toFixed(1)}%`.padStart(CGAIN)
    const price = money(product.price).padStart(CPRICE)
    const nameFirst = product.name.length <= CNAME
      ? product.name.padEnd(CNAME)
      : product.name.slice(0, CNAME)

    p(txt(nameFirst + cost + gain + price), lf(1))
    if (product.name.length > CNAME) {
      const rest = product.name.slice(CNAME)
      p(txt(rest.slice(0, CNAME)), lf(1))
    }
  }

  p(sep())
  p(cmdAlign('center'))
  p(txt(`Fin del listado -- ${sorted.length} articulos`), lf(3))
  p(cmdCut(true))

  return Buffer.concat(parts)
}
