/**
 * Categorías de regalo del buscador "Encontrá el regalo perfecto" de la web.
 *
 * Lista fija: los mismos slugs están duplicados (no hay código compartido)
 * en src/lib/giftCategories.ts (UI de la app), web-catalog-client,
 * hostinger/api/search-logs.php y pandorabox-web/lib/filters.ts — si se
 * agrega o renombra una, actualizar todos.
 */
export const GIFT_CATEGORY_SLUGS = ['menores-6', 'ninos', 'adolescentes', 'jovenes', 'familia', 'escape'] as const

/** Solo los productos de este proveedor pueden ser "Cajas de Escape". */
export const ESCAPE_SLUG = 'escape'
export function isPandoraSupplier(supplierName: string | null): boolean {
  return (supplierName ?? '').toLowerCase().includes('pandora')
}

export function parseGiftCategories(raw: string | null | undefined): string[] {
  return (raw ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

/** Normaliza lo que llega del front: solo slugs conocidos, sin repetidos, en orden canónico. */
export function serializeGiftCategories(slugs: string[], supplierName: string | null): string {
  return GIFT_CATEGORY_SLUGS
    .filter(s => slugs.includes(s))
    .filter(s => s !== ESCAPE_SLUG || isPandoraSupplier(supplierName))
    .join(',')
}
