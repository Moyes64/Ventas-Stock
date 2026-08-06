import type { StockCountPairingPayload, SessionDownloadResponse, SubmitCountItemInput } from '../types/contract'

const TOKEN_HEADER = 'X-Stock-Count-Token'
const DEFAULT_TIMEOUT_MS = 8000

function baseUrl(pairing: StockCountPairingPayload): string {
  return `http://${pairing.host}:${pairing.port}`
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Chequeo rápido de conectividad antes de intentar descargar la sesión. */
export async function healthCheck(pairing: StockCountPairingPayload): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${baseUrl(pairing)}/health`, {}, 5000)
    if (!res.ok) return false
    const data = (await res.json()) as { ok?: boolean }
    return data.ok === true
  } catch {
    return false
  }
}

export async function downloadSession(pairing: StockCountPairingPayload): Promise<SessionDownloadResponse> {
  const res = await fetchWithTimeout(`${baseUrl(pairing)}/sessions/${pairing.sessionId}`, {
    headers: { [TOKEN_HEADER]: pairing.token },
  })
  if (res.status === 401) throw new Error('Token inválido — volvé a escanear el QR desde la PC.')
  if (res.status === 404) throw new Error('La sesión ya no está abierta. Pedí un QR nuevo en la PC.')
  if (!res.ok) throw new Error(`Error del servidor (${res.status})`)
  return (await res.json()) as SessionDownloadResponse
}

export async function uploadItems(pairing: StockCountPairingPayload, items: SubmitCountItemInput[]): Promise<void> {
  const res = await fetchWithTimeout(
    `${baseUrl(pairing)}/sessions/${pairing.sessionId}/items`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [TOKEN_HEADER]: pairing.token },
      body: JSON.stringify({ items }),
    },
    15000
  )
  if (!res.ok) {
    let message = `Error al subir el conteo (${res.status})`
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) message = data.error
    } catch {
      // respuesta no era JSON — nos quedamos con el mensaje genérico
    }
    throw new Error(message)
  }
}
