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
  /**
   * Oferta con vencimiento: precio de oferta y vigencia (YYYY-MM-DD, null = sin
   * límite). Fuera de vigencia la web vuelve sola al precio normal y sin tachado
   * (lo decide Hostinger, ver applyOffer() en hostinger/api/db.php).
   */
  offerPrice: number | null
  offerFrom: string | null
  offerTo: string | null
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
  /** undefined = no tocar la oferta que ya tiene */
  offer?: { price: number | null; from: string | null; to: string | null }
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
  linkProductOfferPrice: number | null
  linkProductCompareAtPrice: number | null
  /** Primera imagen web del producto vinculado: la que usa el banner si no tiene una propia */
  linkProductImageFilename: string | null
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
   * Solo con linkType 'product': precio de oferta y precio anterior tachado del
   * producto vinculado. La oferta toma la vigencia del banner (dateFrom/dateTo).
   * undefined = no tocar el producto.
   */
  productOffer?: { offerPrice: number | null; compareAtPrice: number | null }
}

export interface WebBannersConfig {
  /** Interruptor general: apagado no se publica ningún banner en la web */
  enabled: boolean
}
