export interface AfipConfig {
  ambiente: 'homologacion' | 'produccion'
  cuit: number
  certPath: string
  keyPath: string
  passphrase: string
  puntoVenta: number
}

/** Token de Acceso (TA) returned by WSAA */
export interface TokenAuth {
  token: string
  sign: string
  /** ISO datetime string */
  expiresAt: string
}

/** Single invoice detail for FECAESolicitar */
export interface FacturaDetalle {
  tipoComprobante: number    // 11 = FC, 1 = FA, 6 = FB
  puntoVenta: number
  nroDesde: number
  nroHasta: number
  concepto: number           // 1 = Productos, 2 = Servicios, 3 = Ambos
  docTipo: number            // 80 = CUIT, 96 = DNI, 99 = Sin identificar
  docNro: number             // CUIT/DNI del receptor
  importeTotal: number
  importeNoGravado: number
  importeExento: number
  importeIVA: number
  importeTributos: number
  moneda: string             // 'PES' para pesos argentinos
  monedaCtz: number          // 1 para pesos
  fechaServDesde?: string
  fechaServHasta?: string
  fechaVtoPago?: string
  iva?: IvaAlicuota[]
}

export interface IvaAlicuota {
  id: number          // 3 = 0%, 4 = 10.5%, 5 = 21%, 6 = 27%
  baseImp: number
  importe: number
}

export interface CAERequest {
  tipoComprobante: number
  puntoVenta: number
  facturas: FacturaDetalle[]
}

export interface CAEResponse {
  success: boolean
  cae?: string
  caeVto?: string         // AAAAMMDD
  invoiceNumber?: number
  puntoVenta?: number
  error?: string
  observations?: string[]
}

/** Raw SOAP response from WSFEv1 FECAESolicitar */
export interface FECAESolicitarResult {
  FeDetResp: {
    FECAEDetResponse: {
      Resultado: string   // 'A' = Aprobado, 'R' = Rechazado, 'P' = Parcial
      CAE: string
      CAEFchVto: string
      CbteDesde: string
      CbteHasta: string
      Observaciones?: {
        Obs?: { Msg: string } | Array<{ Msg: string }>
      }
    }
  }
  Errors?: {
    Err: { Msg: string } | Array<{ Msg: string }>
  }
}
