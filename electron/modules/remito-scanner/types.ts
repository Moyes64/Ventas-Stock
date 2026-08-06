export interface RemitoItem {
  articulo: string        // código del proveedor
  descripcion: string
  cantidad: number
  codigoBarras: string | null
}

export interface RemitoExtracted {
  numeroRemito: string
  fecha: string           // YYYY-MM-DD
  proveedor: string
  items: RemitoItem[]
}

export interface RemitoScanResult {
  success: boolean
  data?: RemitoExtracted
  error?: string
}
