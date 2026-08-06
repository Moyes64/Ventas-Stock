import http from 'http'
import crypto from 'crypto'
import type {
  StockCountProductForDownload,
  SubmitCountItemInput,
} from './types'

const TOKEN_HEADER = 'x-stock-count-token'

export interface StockCountServerHandlers {
  getToken: () => string
  /** null = no existe o ya no está 'open' (404 para el celular en ambos casos). */
  getSessionForDownload: (sessionId: number) => { label: string; products: StockCountProductForDownload[] } | null
  submitItems: (sessionId: number, items: SubmitCountItemInput[]) => { ok: true } | { ok: false; error: string }
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

function readBody(req: http.IncomingMessage, maxBytes = 2_000_000): Promise<string> {
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
 * Servidor HTTP local (LAN) para que la app Android de conteo de stock
 * descargue una sesión abierta y suba los conteos. No usa ningún framework
 * (Express, etc.) — son 3 rutas, node:http alcanza. Ver electron/modules/sync
 * para el único otro usuario de http/https en este repo (ahí es solo
 * cliente saliente; este es el primer listener del proceso).
 */
export function createStockCountServer(handlers: StockCountServerHandlers): http.Server {
  return http.createServer((req, res) => {
    void handleRequest(req, res, handlers).catch(() => {
      if (!res.headersSent) sendJson(res, 500, { error: 'Error interno' })
    })
  })
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  handlers: StockCountServerHandlers
): Promise<void> {
  // CORS abierto: la app nativa (fetch de React Native) no lo necesita, pero
  // permite probar este servidor desde `expo start --web` en un navegador
  // durante desarrollo. El token sigue siendo lo que realmente autoriza el
  // acceso — CORS acá es solo para no bloquear el preview web.
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', `Content-Type, ${TOKEN_HEADER}`)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname

  if (req.method === 'GET' && path === '/health') {
    sendJson(res, 200, { ok: true })
    return
  }

  const sessionMatch = path.match(/^\/sessions\/(\d+)(\/items)?$/)
  if (!sessionMatch) {
    sendJson(res, 404, { error: 'No encontrado' })
    return
  }

  const token = req.headers[TOKEN_HEADER]
  const tokenValue = Array.isArray(token) ? token[0] : token
  if (!tokenValue || !safeCompare(tokenValue, handlers.getToken())) {
    sendJson(res, 401, { error: 'Token inválido o faltante' })
    return
  }

  const sessionId = Number(sessionMatch[1])
  const isItemsRoute = !!sessionMatch[2]

  if (req.method === 'GET' && !isItemsRoute) {
    const session = handlers.getSessionForDownload(sessionId)
    if (!session) {
      sendJson(res, 404, { error: 'Sesión no encontrada o no está abierta' })
      return
    }
    sendJson(res, 200, { id: sessionId, label: session.label, products: session.products })
    return
  }

  if (req.method === 'POST' && isItemsRoute) {
    let body: unknown
    try {
      const raw = await readBody(req)
      body = JSON.parse(raw)
    } catch {
      sendJson(res, 400, { error: 'Body inválido (se esperaba JSON)' })
      return
    }

    const items = validateItems(body)
    if (!items) {
      sendJson(res, 400, { error: 'Formato inválido: se esperaba { items: [{ productId, countedQuantity, note? }] }' })
      return
    }

    const result = handlers.submitItems(sessionId, items)
    if (!result.ok) {
      sendJson(res, 400, { error: result.error })
      return
    }
    sendJson(res, 200, { ok: true })
    return
  }

  sendJson(res, 404, { error: 'No encontrado' })
}

function validateItems(body: unknown): SubmitCountItemInput[] | null {
  if (typeof body !== 'object' || body === null || !('items' in body)) return null
  const items = (body as { items: unknown }).items
  if (!Array.isArray(items)) return null

  const result: SubmitCountItemInput[] = []
  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null) return null
    const item = raw as Record<string, unknown>
    if (typeof item.productId !== 'number' || typeof item.countedQuantity !== 'number') return null
    if (item.note !== undefined && typeof item.note !== 'string') return null
    result.push({
      productId: item.productId,
      countedQuantity: item.countedQuantity,
      note: typeof item.note === 'string' ? item.note : undefined,
    })
  }
  return result
}
