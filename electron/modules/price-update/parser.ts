import * as XLSX from 'xlsx'

/**
 * Fila de precios extraída de la planilla del proveedor.
 * Formato esperado (definido por el usuario): SKU | Código de barras | Descripción | Precio
 */
export interface ExcelPriceRow {
  sku: string
  barcode: string
  description: string
  price: number
  /** Número de fila en el excel original (1-based, incluye header) — útil para mensajes de error */
  rowNumber: number
}

export interface ParseExcelResult {
  rows: ExcelPriceRow[]
  warnings: string[]
  /** Encabezado original (tal cual está en el excel) detectado para cada columna, o null si no se encontró */
  detectedColumns: {
    sku: string | null
    barcode: string | null
    description: string | null
    price: string | null
  }
}

/** Quita acentos y pasa a minúsculas para comparar encabezados de columnas */
function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function findColumn(headers: string[], keywords: string[]): number {
  return headers.findIndex(h => keywords.some(k => h.includes(k)))
}

/**
 * Interpreta un precio que puede venir como número o como texto con
 * formato argentino ("1.234,56") o anglosajón ("1234.56").
 */
function parsePrice(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw !== 'string') return null
  const cleaned = raw.trim().replace(/\$/g, '').replace(/\s/g, '')
  if (!cleaned) return null
  let normalized = cleaned
  if (/,\d{1,2}$/.test(cleaned)) {
    // Formato AR: punto = miles, coma = decimal
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    normalized = cleaned.replace(/,/g, '')
  }
  const n = parseFloat(normalized)
  return Number.isFinite(n) ? n : null
}

function detectColumns(headerRow: unknown[]) {
  const headers = headerRow.map(normalizeHeader)

  // Código de barras primero, con palabras clave específicas (no ambiguas con "código" a secas)
  const barcodeCol = findColumn(headers, ['codigo de barras', 'cod. barras', 'barras', 'ean'])

  // SKU / código de proveedor: se busca primero con palabras clave específicas en TODAS las
  // columnas; solo si ninguna columna matchea eso se recurre al comodín genérico "codigo",
  // y siempre evitando la columna ya asignada a código de barras. Si el comodín genérico se
  // probara junto con "sku" en una sola pasada, una columna "Código de barras" que aparezca
  // antes que la de "SKU" en la planilla "robaría" el match por contener la palabra "código".
  let skuCol = findColumn(headers, ['sku', 'codigo de proveedor', 'codigo prov', 'articulo'])
  if (skuCol === -1) {
    skuCol = headers.findIndex((h, i) => i !== barcodeCol && h.includes('codigo'))
  }

  const descCol = findColumn(headers, ['descripcion', 'descripción', 'nombre', 'producto', 'detalle'])
  const priceCol = findColumn(headers, ['precio', 'costo'])

  return { skuCol, barcodeCol, descCol, priceCol }
}

export function parsePriceExcel(filePath: string): ParseExcelResult {
  const warnings: string[] = []
  const emptyColumns = { sku: null, barcode: null, description: null, price: null }
  const workbook = XLSX.readFile(filePath)
  if (workbook.SheetNames.length === 0) return { rows: [], warnings: ['El archivo no tiene hojas.'], detectedColumns: emptyColumns }

  // Se usa la primera hoja cuyo encabezado (fila 1) tenga SKU/Código de barras y Precio.
  // Los proveedores suelen mandar su lista original en la primera hoja y la planilla con el
  // formato esperado queda en otra; si ninguna matchea se cae a la primera para reportar avisos.
  const sheets = workbook.SheetNames.map(name => {
    const raw = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: '' })
    return { raw, cols: detectColumns(raw[0] ?? []) }
  })
  const { raw, cols } = sheets.find(s => (s.cols.skuCol >= 0 || s.cols.barcodeCol >= 0) && s.cols.priceCol >= 0) ?? sheets[0]
  if (raw.length === 0) return { rows: [], warnings: ['La hoja está vacía.'], detectedColumns: emptyColumns }

  const rawHeaders = raw[0].map(h => String(h ?? '').trim())
  const { skuCol: finalSkuCol, barcodeCol, descCol, priceCol } = cols

  const detectedColumns = {
    sku: finalSkuCol >= 0 ? rawHeaders[finalSkuCol] : null,
    barcode: barcodeCol >= 0 ? rawHeaders[barcodeCol] : null,
    description: descCol >= 0 ? rawHeaders[descCol] : null,
    price: priceCol >= 0 ? rawHeaders[priceCol] : null,
  }

  if (finalSkuCol === -1 && barcodeCol === -1) {
    warnings.push('No se encontró columna de SKU ni de Código de barras. El archivo debe tener al menos una.')
  }
  if (priceCol === -1) {
    warnings.push('No se encontró columna de Precio.')
  }

  const rows: ExcelPriceRow[] = []
  for (let i = 1; i < raw.length; i++) {
    const r = raw[i]
    if (!r || r.every(c => c === '' || c === undefined || c === null)) continue

    const sku = finalSkuCol >= 0 ? String(r[finalSkuCol] ?? '').trim() : ''
    const barcode = barcodeCol >= 0 ? String(r[barcodeCol] ?? '').trim() : ''
    const description = descCol >= 0 ? String(r[descCol] ?? '').trim() : ''
    const priceRaw = priceCol >= 0 ? r[priceCol] : undefined

    if (!sku && !barcode && !description) continue

    const price = parsePrice(priceRaw)
    if (price === null) {
      warnings.push(`Fila ${i + 1}: precio inválido ("${String(priceRaw ?? '')}") — se ignoró.`)
      continue
    }

    rows.push({ sku, barcode, description, price, rowNumber: i + 1 })
  }

  return { rows, warnings, detectedColumns }
}
