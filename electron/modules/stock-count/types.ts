export type StockCountSessionStatus = 'open' | 'uploaded' | 'reconciled' | 'cancelled'

export interface StockCountSession {
  id: number
  label: string
  categoryId: number | null
  categoryName: string | null
  status: StockCountSessionStatus
  itemCount: number
  createdAt: string
  uploadedAt: string | null
  reconciledAt: string | null
}

export interface StockCountItem {
  id: number
  sessionId: number
  productId: number
  countedQuantity: number
  note: string
  reconciled: boolean
  createdAt: string
}

/** Producto tal como lo descarga la app Android al abrir una sesión. */
export interface StockCountProductForDownload {
  id: number
  sku: string
  barcode: string | null
  name: string
  currentStock: number
}

export interface SubmitCountItemInput {
  productId: number
  countedQuantity: number
  note?: string
}

/** Fila de la pantalla de conciliación: contado vs. stock del sistema EN VIVO. */
export interface ReconciliationRow {
  itemId: number
  productId: number
  productName: string
  sku: string
  systemQuantity: number
  countedQuantity: number
  diff: number
  note: string
  reconciled: boolean
}

export interface ApplyReconciliationDecision {
  itemId: number
  apply: boolean
}

export interface StockCountServerConfig {
  enabled: boolean
  port: number
  token: string
}

export interface StockCountServerStatus {
  running: boolean
  enabled: boolean
  port: number
  lanIp: string | null
  token: string
  error: string | null
}

/** Payload que se codifica en el QR de pairing de una sesión puntual. */
export interface StockCountPairingPayload {
  v: 1
  host: string
  port: number
  token: string
  sessionId: number
}
