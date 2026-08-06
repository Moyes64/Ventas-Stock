/**
 * Mirror manual del contrato HTTP expuesto por el servidor local de
 * Ventas-Stock (ver electron/modules/stock-count/{server,types}.ts en la
 * raíz del repo). No hay paquete compartido entre los dos proyectos —
 * si el contrato del lado Electron cambia, hay que actualizar esto a mano.
 */

/** Payload codificado en el QR de pairing que se escanea desde Ventas-Stock. */
export interface StockCountPairingPayload {
  v: 1
  host: string
  port: number
  token: string
  sessionId: number
}

/** Producto tal como lo entrega GET /sessions/:id. */
export interface StockCountProductForDownload {
  id: number
  sku: string
  barcode: string | null
  name: string
  /**
   * Viaja en la respuesta pero a propósito NO se muestra en la UI mientras
   * se cuenta (conteo a ciegas) — solo se usa del lado Electron al conciliar.
   */
  currentStock: number
}

export interface SessionDownloadResponse {
  id: number
  label: string
  products: StockCountProductForDownload[]
}

/** Item enviado en POST /sessions/:id/items. */
export interface SubmitCountItemInput {
  productId: number
  countedQuantity: number
  note?: string
}
