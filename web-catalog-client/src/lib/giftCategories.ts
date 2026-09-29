/**
 * Categorías de regalo del buscador "Encontrá el regalo perfecto" de la web.
 * Copia de src/lib/giftCategories.ts de Ventas-Stock (no hay código
 * compartido) — si se agrega o renombra una, actualizar ambas.
 */
export interface GiftCategory {
  slug: string
  label: string
  emoji: string
  /** Solo aplicable a productos de Pandora Box */
  pandoraOnly?: boolean
}

export const GIFT_CATEGORIES: GiftCategory[] = [
  { slug: 'menores-6', label: 'Menores de 6 años', emoji: '🧸' },
  { slug: 'ninos', label: 'Niños y niñas', emoji: '🪁' },
  { slug: 'adolescentes', label: 'Adolescentes', emoji: '🎧' },
  { slug: 'jovenes', label: 'Jóvenes y más', emoji: '🎲' },
  { slug: 'familia', label: 'Familia', emoji: '👨‍👩‍👧' },
  { slug: 'escape', label: 'Cajas de Escape', emoji: '🔐', pandoraOnly: true },
]

export function isPandoraSupplier(supplierName: string | null): boolean {
  return (supplierName ?? '').toLowerCase().includes('pandora')
}

/** Categorías que se pueden asignar a un producto según su proveedor. */
export function giftCategoriesFor(supplierName: string | null): GiftCategory[] {
  return GIFT_CATEGORIES.filter(c => !c.pandoraOnly || isPandoraSupplier(supplierName))
}
