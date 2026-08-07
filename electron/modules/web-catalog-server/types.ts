export interface WebCatalogServerConfig {
  enabled: boolean
  port: number
  token: string
}

export interface WebCatalogServerStatus {
  running: boolean
  enabled: boolean
  port: number
  lanIp: string | null
  token: string
  error: string | null
}

/** URL de pairing + su QR, para que Anabella la abra desde la Mac sin tipear nada a mano. */
export interface WebCatalogPairingInfo {
  url: string | null
  qrDataUrl: string | null
}
