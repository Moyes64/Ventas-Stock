import http from 'http'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type {
  WebCategory,
  WebProduct,
  WebProductImage,
  SaveWebCategoryInput,
  SaveWebProductInput,
} from '../web-catalog/types'

const TOKEN_HEADER = 'x-web-catalog-token'
// Base64 infla ~33% el tamaño original; una foto de producto de unos ~10MB
// sin comprimir todavía tiene que entrar en el body del POST de subida.
const MAX_BODY_BYTES = 15_000_000

export interface UnpublishedProduct {
  id: number
  name: string
  sku: string
  price: number
  stock: number
  supplierId: number | null
  supplierName: string | null
}

/**
 * Callbacks que el server delega a la MISMA instancia de WebCatalogService
 * que ya usa la UI de esta notebook — no hay lógica de datos propia acá,
 * solo transporte HTTP. Ver electron/modules/web-catalog/service.ts.
 */
export interface WebCatalogServerHandlers {
  getToken: () => string
  listCategories: () => WebCategory[]
  saveCategory: (id: number | null, input: SaveWebCategoryInput) => WebCategory
  deleteCategory: (id: number) => void
  listProducts: () => WebProduct[]
  getProduct: (productId: number) => WebProduct | null
  saveProduct: (input: SaveWebProductInput) => WebProduct
  listUnpublished: () => UnpublishedProduct[]
  getNextSortOrder: (webCategoryId: number | null) => number
  getNextFeaturedOrder: () => number
  saveImage: (productId: number, sortOrder: number, base64: string) => WebProductImage
  deleteImage: (imageId: number) => void
  reorderImages: (productId: number, orderedIds: number[]) => void
  getImagePath: (filename: string) => string
  /** Carpeta con el build estático de web-catalog-client, o null si no está compilado (dev sin build previo). */
  staticDir: () => string | null
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(payload)
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

function readBody(req: http.IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error('Body demasiado grande'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
    req.on('error', reject)
  })
}

/**
 * Servidor HTTP local (LAN) para editar el catálogo web desde otra máquina
 * (p. ej. la Mac de Anabella) sin instalar nada ahí — sirve tanto la API
 * REST como el cliente web estático (ver web-catalog-client/). Mismo
 * criterio que electron/modules/stock-count/server.ts: sin framework, todo
 * con node:http.
 */
export function createWebCatalogServer(handlers: WebCatalogServerHandlers): http.Server {
  return http.createServer((req, res) => {
    void handleRequest(req, res, handlers).catch(() => {
      if (!res.headersSent) sendJson(res, 500, { error: 'Error interno' })
    })
  })
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  handlers: WebCatalogServerHandlers
): Promise<void> {
  // CORS abierto: el cliente web se sirve desde este mismo server así que no
  // debería hacer falta, pero se deja igual de abierto que en stock-count por
  // si se prueba el cliente con `vite dev` aparte durante el desarrollo. El
  // token es lo que realmente autoriza el acceso, no CORS.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', `Content-Type, ${TOKEN_HEADER}`)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', 'http://localhost')
  const pathname = url.pathname

  if (req.method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (pathname.startsWith('/api/')) {
    const token = req.headers[TOKEN_HEADER]
    const tokenValue = Array.isArray(token) ? token[0] : token
    if (!tokenValue || !safeCompare(tokenValue, handlers.getToken())) {
      sendJson(res, 401, { error: 'Token inválido o faltante' })
      return
    }
    await handleApi(req, res, pathname, url, handlers)
    return
  }

  serveStatic(res, pathname, handlers.staticDir())
}

async function handleApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  url: URL,
  handlers: WebCatalogServerHandlers
): Promise<void> {
  const method = req.method ?? 'GET'

  // ── Categorías ────────────────────────────────────────────────────────
  if (pathname === '/api/categories' && method === 'GET') {
    sendJson(res, 200, handlers.listCategories())
    return
  }
  if (pathname === '/api/categories' && method === 'POST') {
    const input = await readJsonBody<SaveWebCategoryInput>(req)
    if (!input) return sendJson(res, 400, { error: 'Body inválido' })
    sendJson(res, 200, handlers.saveCategory(null, input))
    return
  }
  const categoryMatch = pathname.match(/^\/api\/categories\/(\d+)$/)
  if (categoryMatch && method === 'PUT') {
    const input = await readJsonBody<SaveWebCategoryInput>(req)
    if (!input) return sendJson(res, 400, { error: 'Body inválido' })
    sendJson(res, 200, handlers.saveCategory(Number(categoryMatch[1]), input))
    return
  }
  if (categoryMatch && method === 'DELETE') {
    handlers.deleteCategory(Number(categoryMatch[1]))
    sendJson(res, 200, { ok: true })
    return
  }

  // ── Productos ─────────────────────────────────────────────────────────
  if (pathname === '/api/products' && method === 'GET') {
    sendJson(res, 200, handlers.listProducts())
    return
  }
  if (pathname === '/api/products' && method === 'POST') {
    const input = await readJsonBody<SaveWebProductInput>(req)
    if (!input) return sendJson(res, 400, { error: 'Body inválido' })
    sendJson(res, 200, handlers.saveProduct(input))
    return
  }
  if (pathname === '/api/products/unpublished' && method === 'GET') {
    sendJson(res, 200, handlers.listUnpublished())
    return
  }
  if (pathname === '/api/products/next-sort-order' && method === 'GET') {
    const raw = url.searchParams.get('categoryId')
    const categoryId = raw ? Number(raw) : null
    sendJson(res, 200, { value: handlers.getNextSortOrder(categoryId) })
    return
  }
  if (pathname === '/api/products/next-featured-order' && method === 'GET') {
    sendJson(res, 200, { value: handlers.getNextFeaturedOrder() })
    return
  }
  const imagesReorderMatch = pathname.match(/^\/api\/products\/(\d+)\/images\/reorder$/)
  if (imagesReorderMatch && method === 'POST') {
    const body = await readJsonBody<{ orderedIds: unknown }>(req)
    const orderedIds = body && Array.isArray(body.orderedIds) ? body.orderedIds : null
    if (!orderedIds || !orderedIds.every(id => typeof id === 'number')) {
      sendJson(res, 400, { error: 'Se esperaba { orderedIds: number[] }' })
      return
    }
    handlers.reorderImages(Number(imagesReorderMatch[1]), orderedIds as number[])
    sendJson(res, 200, { ok: true })
    return
  }
  const imagesUploadMatch = pathname.match(/^\/api\/products\/(\d+)\/images$/)
  if (imagesUploadMatch && method === 'POST') {
    const body = await readJsonBody<{ sortOrder: unknown; base64: unknown }>(req)
    if (!body || typeof body.sortOrder !== 'number' || typeof body.base64 !== 'string') {
      sendJson(res, 400, { error: 'Se esperaba { sortOrder, base64 }' })
      return
    }
    try {
      const image = handlers.saveImage(Number(imagesUploadMatch[1]), body.sortOrder, body.base64)
      sendJson(res, 200, image)
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) })
    }
    return
  }
  const productMatch = pathname.match(/^\/api\/products\/(\d+)$/)
  if (productMatch && method === 'GET') {
    const product = handlers.getProduct(Number(productMatch[1]))
    if (!product) return sendJson(res, 404, { error: 'No encontrado' })
    sendJson(res, 200, product)
    return
  }

  // ── Imágenes ──────────────────────────────────────────────────────────
  const imageDeleteMatch = pathname.match(/^\/api\/images\/(\d+)$/)
  if (imageDeleteMatch && method === 'DELETE') {
    handlers.deleteImage(Number(imageDeleteMatch[1]))
    sendJson(res, 200, { ok: true })
    return
  }
  const imageFileMatch = pathname.match(/^\/api\/images\/([^/]+)$/)
  if (imageFileMatch && method === 'GET') {
    serveImageFile(res, imageFileMatch[1], handlers)
    return
  }

  sendJson(res, 404, { error: 'No encontrado' })
}

async function readJsonBody<T>(req: http.IncomingMessage): Promise<T | null> {
  try {
    const raw = await readBody(req)
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function serveImageFile(res: http.ServerResponse, rawFilename: string, handlers: WebCatalogServerHandlers): void {
  const filename = decodeURIComponent(rawFilename)
  // El filename no puede contener separadores de path — evita salir de la
  // carpeta de imágenes (../../ventas.db, etc.)
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    sendJson(res, 400, { error: 'Nombre de archivo inválido' })
    return
  }
  const filePath = handlers.getImagePath(filename)
  if (!fs.existsSync(filePath)) {
    sendJson(res, 404, { error: 'No encontrado' })
    return
  }
  const ext = path.extname(filename).toLowerCase()
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
}

function serveStatic(res: http.ServerResponse, pathname: string, staticDir: string | null): void {
  if (!staticDir) {
    sendJson(res, 503, {
      error: 'El cliente web del catálogo todavía no fue compilado (falta el build de web-catalog-client).',
    })
    return
  }

  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const resolved = path.normalize(path.join(staticDir, relative))
  // Path traversal guard: el resultado tiene que seguir dentro de staticDir.
  const withinRoot = resolved === path.normalize(staticDir) || resolved.startsWith(path.normalize(staticDir) + path.sep)
  const target = withinRoot && fs.existsSync(resolved) && fs.statSync(resolved).isFile()
    ? resolved
    : path.join(staticDir, 'index.html') // fallback SPA para rutas de cliente

  if (!fs.existsSync(target)) {
    sendJson(res, 503, { error: 'El cliente web del catálogo todavía no fue compilado.' })
    return
  }

  const ext = path.extname(target).toLowerCase()
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' })
  fs.createReadStream(target).pipe(res)
}
