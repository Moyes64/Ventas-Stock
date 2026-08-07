import type {
  WebCategory,
  WebProduct,
  WebProductImage,
  SaveWebCategoryInput,
  SaveWebProductInput,
  UnpublishedProduct,
} from '../types/contract'

const TOKEN_HEADER = 'x-web-catalog-token'
const TOKEN_STORAGE_KEY = 'web-catalog-token'

// En producción esto se sirve desde el propio servidor LAN (mismo origen).
// En desarrollo (`pnpm dev` acá adentro, contra el Electron real corriendo
// aparte) se puede pisar con VITE_API_BASE, ej. http://192.168.1.5:4279
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

function readTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('token')
}

// El token llega una sola vez por la URL de pairing (?token=...) y de ahí en
// más se guarda en localStorage — así no queda pegado en el historial del
// navegador en cada recarga.
export function getToken(): string {
  const fromUrl = readTokenFromUrl()
  if (fromUrl) {
    localStorage.setItem(TOKEN_STORAGE_KEY, fromUrl)
    const url = new URL(window.location.href)
    url.searchParams.delete('token')
    window.history.replaceState({}, '', url.toString())
  }
  return localStorage.getItem(TOKEN_STORAGE_KEY) ?? ''
}

export function hasToken(): boolean {
  return getToken().length > 0
}

class ApiError extends Error {}

async function fetchWithTimeout(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Se agotó el tiempo de espera. Verificá que estés en la misma red que la notebook.')
    }
    throw new ApiError('No se pudo conectar con la notebook. Verificá la red y que el servidor esté activado.')
  } finally {
    clearTimeout(timer)
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; timeoutMs?: number } = {}
): Promise<T> {
  const res = await fetchWithTimeout(
    path,
    {
      method: options.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        [TOKEN_HEADER]: getToken(),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    },
    options.timeoutMs ?? 10_000
  )

  if (res.status === 401) throw new ApiError('Token inválido o vencido — pedí un nuevo enlace de acceso.')
  if (res.status === 404) throw new ApiError('No se encontró lo que se pedía (¿lo borraron desde la otra computadora?).')
  if (res.status === 503) throw new ApiError('El servidor todavía no tiene el cliente web compilado.')
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string })
    throw new ApiError(body.error ?? `Error inesperado (HTTP ${res.status})`)
  }
  return res.json() as Promise<T>
}

export const api = {
  listCategories: () => request<WebCategory[]>('/api/categories'),
  createCategory: (input: SaveWebCategoryInput) =>
    request<WebCategory>('/api/categories', { method: 'POST', body: input }),
  updateCategory: (id: number, input: SaveWebCategoryInput) =>
    request<WebCategory>(`/api/categories/${id}`, { method: 'PUT', body: input }),
  deleteCategory: (id: number) => request<{ ok: true }>(`/api/categories/${id}`, { method: 'DELETE' }),

  listProducts: () => request<WebProduct[]>('/api/products'),
  getProduct: (productId: number) => request<WebProduct>(`/api/products/${productId}`),
  saveProduct: (input: SaveWebProductInput) => request<WebProduct>('/api/products', { method: 'POST', body: input }),
  listUnpublished: () => request<UnpublishedProduct[]>('/api/products/unpublished'),
  getNextSortOrder: async (webCategoryId: number | null) => {
    const qs = webCategoryId !== null ? `?categoryId=${webCategoryId}` : ''
    const { value } = await request<{ value: number }>(`/api/products/next-sort-order${qs}`)
    return value
  },
  getNextFeaturedOrder: async () => {
    const { value } = await request<{ value: number }>('/api/products/next-featured-order')
    return value
  },

  uploadImage: (productId: number, sortOrder: number, base64: string) =>
    request<WebProductImage>(`/api/products/${productId}/images`, {
      method: 'POST',
      body: { sortOrder, base64 },
      timeoutMs: 30_000,
    }),
  deleteImage: (imageId: number) => request<{ ok: true }>(`/api/images/${imageId}`, { method: 'DELETE' }),
  reorderImages: (productId: number, orderedIds: number[]) =>
    request<{ ok: true }>(`/api/products/${productId}/images/reorder`, { method: 'POST', body: { orderedIds } }),

  // El token no puede ir en la URL de un <img src>, así que las imágenes se
  // piden autenticadas y se muestran como blob: URL.
  async getImageObjectUrl(filename: string): Promise<string> {
    const res = await fetchWithTimeout(
      `/api/images/${encodeURIComponent(filename)}`,
      { headers: { [TOKEN_HEADER]: getToken() } },
      10_000
    )
    if (!res.ok) throw new ApiError(`No se pudo cargar la imagen (HTTP ${res.status})`)
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  },
}

export { ApiError }
