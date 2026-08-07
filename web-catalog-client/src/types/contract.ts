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
  webPrice: number | null
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
  images: WebProductImage[]
}

export interface SaveWebProductInput {
  productId: number
  webCategoryId: number | null
  visible: boolean
  featured: boolean
  featuredOrder: number
  webPrice: number | null
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

export interface UnpublishedProduct {
  id: number
  name: string
  sku: string
  price: number
  stock: number
  supplierId: number | null
  supplierName: string | null
}
