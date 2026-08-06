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
  // joined from products
  productName: string
  productPrice: number
  productStock: number
  productSku: string
  // joined images
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
