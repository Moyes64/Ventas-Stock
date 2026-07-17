/** Calculates sale price: costo * (1 + ganancia/100) * (1 + iva/100) */
export function calcSalePrice(cost: number, gainPct: number, ivaPct: number): number {
  return cost * (1 + gainPct / 100) * (1 + ivaPct / 100)
}

/** Derives gain% from a manually entered sale price */
export function calcGainFromPrice(cost: number, price: number, ivaPct: number): number {
  if (cost <= 0) return 0
  return Math.round((price / (cost * (1 + ivaPct / 100)) - 1) * 10000) / 100
}
