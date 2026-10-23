/**
 * Mirror manual del contrato HTTP expuesto por
 * electron/modules/web-catalog-server (fuente de verdad:
 * electron/modules/web-catalog/types.ts). No hay paquete compartido entre
 * este proyecto y Ventas-Stock — si el contrato del lado Electron cambia,
 * hay que actualizar esto a mano (mismo criterio que mobile/src/types/contract.ts
 * para el conteo de stock).
 */

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
  productName: string
  productPrice: number
  productStock: number
  productSku: string
  supplierName: string | null
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
  /** undefined = no tocar el que ya tiene */
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

export type WebBannerTheme = 'gold' | 'navy'
export type WebBannerLinkType = 'none' | 'product' | 'category' | 'url'

export interface WebBanner {
  id: number
  title: string
  subtitle: string
  badge: string
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
  linkProductName: string | null
  linkProductUnavailable: boolean
  linkProductPrice: number | null
  linkProductWebPrice: number | null
  linkProductCompareAtPrice: number | null
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
  /** Solo con linkType 'product': precios del producto vinculado */
  productOffer?: { webPrice: number | null; compareAtPrice: number | null }
}

export interface WebBannersConfig {
  enabled: boolean
}

export interface UnpublishedProduct {
  id: number
  name: string
  sku: string
  price: number
  stock: number
  supplierId: number | null
  supplierName: string | null
}
