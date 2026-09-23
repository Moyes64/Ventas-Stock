/** Calculates sale price: costo * (1 + ganancia/100) * (1 + iva/100) */
export function calcSalePrice(cost: number, gainPct: number, ivaPct: number): number {
  return cost * (1 + gainPct / 100) * (1 + ivaPct / 100)
}

/** Derives gain% from a manually entered sale price */
export function calcGainFromPrice(cost: number, price: number, ivaPct: number): number {
  if (cost <= 0) return 0
  return Math.round((price / (cost * (1 + ivaPct / 100)) - 1) * 10000) / 100
}

/**
 * Precio ideal (con IVA) a partir del costo y tres porcentajes a descontar
 * del precio de venta: comisión financiera, costo fijo prorrateado y margen
 * neto objetivo. A diferencia de calcSalePrice (markup sobre costo), acá el
 * margen se define sobre el precio de venta final.
 */
export function calcIdealPrice(
  cost: number,
  comisionPct: number,
  costoFijoPct: number,
  margenObjetivoPct: number,
  ivaPct: number
): number {
  const denomPct = 100 - (comisionPct + costoFijoPct + margenObjetivoPct)
  const denom = Math.max(denomPct, 1) / 100
  return (cost / denom) * (1 + ivaPct / 100)
}

/**
 * Inversa de calcIdealPrice: a partir de un precio elegido a mano para UN
 * producto, infiere qué margen objetivo (sobre precio) haría falta para que
 * la fórmula devuelva ese mismo precio — sirve para "calibrar" el margen de
 * todo un segmento a partir de un solo ejemplo con precio de mercado conocido.
 */
export function calcImpliedMargin(
  cost: number,
  price: number,
  comisionPct: number,
  costoFijoPct: number,
  ivaPct: number
): number {
  if (cost <= 0 || price <= 0) return 0
  const priceSinIva = price / (1 + ivaPct / 100)
  const denomPct = (cost / priceSinIva) * 100
  return 100 - comisionPct - costoFijoPct - denomPct
}

/**
 * Redondea un precio HACIA ARRIBA al múltiplo de `step` (1, 10, 100, 1000…).
 * Siempre hacia arriba para que el % de markup resultante nunca quede por
 * debajo del objetivo. step <= 0 redondea hacia arriba al centavo. El épsilon
 * evita saltar al múltiplo siguiente por errores de punto flotante cuando el
 * precio ya es un múltiplo exacto.
 */
export function roundUpToStep(value: number, step: number): number {
  if (step <= 0) return Math.ceil(value * 100 - 1e-6) / 100
  return Math.ceil(value / step - 1e-9) * step
}
