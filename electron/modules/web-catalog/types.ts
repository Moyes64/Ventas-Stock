export interface WebCategory {
  id: number
  name: string
  slug: string
  description: string
  sortOrder: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface WebProductImage {
  id: number
  productId: number
  filename: string
  sortOrder: number
  createdAt: string
}

export interface WebProduct {
  id: number
  productId: number
  webCategoryId: number | null
  visible: boolean
  featured: boolean
  featuredOrder: number
  /** Slugs de las categorías de regalo (ver giftCategories.ts) */
  giftCategories: string[]
  webPrice: number | null
  /** Precio "antes", tachado en la web (solo si es mayor al precio web efectivo) */
  compareAtPrice: number | null
  shortDescription: string
  longDescription: string
  ageMin: number | null
  playersMin: number | null
  playersMax: number | null
  playTimeMin: number | null
  difficulty: number | null
  videoUrl: string
  tags: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  // joined from products
  productName: string
  productPrice: number
  productStock: number
  productSku: string
  supplierName: string | null
  // joined images
  images: WebProductImage[]
}

export interface SaveWebProductInput {
  productId: number
  webCategoryId: number | null
  visible: boolean
  featured: boolean
  featuredOrder: number
  /** undefined = no tocar las que ya tiene el producto */
  giftCategories?: string[]
  webPrice: number | null
  /** undefined = no tocar el que ya tiene (el cliente LAN no lo envía) */
  compareAtPrice?: number | null
  shortDescription: string
  longDescription: string
  ageMin: number | null
  playersMin: number | null
  playersMax: number | null
  playTimeMin: number | null
  difficulty: number | null
  videoUrl: string
  tags: string
  sortOrder: number
}

export interface SaveWebCategoryInput {
  name: string
  description: string
  sortOrder: number
  active: boolean
}

// ── Banners web (home de la tienda, debajo del Hero) ─────────────────────────

export type WebBannerTheme = 'gold' | 'navy'
export type WebBannerLinkType = 'none' | 'product' | 'category' | 'url'

export interface WebBanner {
  id: number
  title: string
  subtitle: string
  /** Etiqueta chica arriba del título (ej. "OFERTA", "CUOTAS SIN INTERÉS") */
  badge: string
  /** Letra chica / condiciones (ej. "Válido con tarjetas bancarias seleccionadas") */
  finePrint: string
  theme: WebBannerTheme
  imageFilename: string | null
  linkType: WebBannerLinkType
  linkProductId: number | null
  linkCategoryId: number | null
  linkUrl: string
  /** Vacío con link = toda la tarjeta es clickeable, sin botón */
  buttonText: string
  dateFrom: string | null
  dateTo: string | null
  active: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
  // joined
  linkProductName: string | null
  /** El producto vinculado no está publicado/visible en la web: el banner no se muestra */
  linkProductUnavailable: boolean
  /** Precios del producto vinculado (para editar la oferta desde el mismo banner) */
  linkProductPrice: number | null
  linkProductWebPrice: number | null
  linkProductCompareAtPrice: number | null
  linkCategoryName: string | null
}

export interface SaveWebBannerInput {
  title: string
  subtitle: string
  badge: string
  finePrint: string
  theme: WebBannerTheme
  linkType: WebBannerLinkType
  linkProductId: number | null
  linkCategoryId: number | null
  linkUrl: string
  buttonText: string
  dateFrom: string | null
  dateTo: string | null
  active: boolean
  sortOrder: number
  /**
   * Solo con linkType 'product': precio web (null = el del catálogo) y precio
   * anterior tachado del producto vinculado. undefined = no tocar el producto.
   */
  productOffer?: { webPrice: number | null; compareAtPrice: number | null }
}

export interface WebBannersConfig {
  /** Interruptor general: apagado no se publica ningún banner en la web */
  enabled: boolean
}
