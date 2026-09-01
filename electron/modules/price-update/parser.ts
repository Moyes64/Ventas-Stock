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

export function parsePriceExcel(filePath: string): ParseExcelResult {
  const warnings: string[] = []
  const emptyColumns = { sku: null, barcode: null, description: null, price: null }
  const workbook = XLSX.readFile(filePath)
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return { rows: [], warnings: ['El archivo no tiene hojas.'], detectedColumns: emptyColumns }

  const sheet = workbook.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
  if (raw.length === 0) return { rows: [], warnings: ['La hoja está vacía.'], detectedColumns: emptyColumns }

  const rawHeaders = raw[0].map(h => String(h ?? '').trim())
  const headers = raw[0].map(normalizeHeader)
  const skuCol = findColumn(headers, ['sku', 'codigo de proveedor', 'codigo prov', 'articulo', 'codigo'])
  const barcodeCol = findColumn(headers, ['codigo de barras', 'cod. barras', 'barras', 'ean'])
  const descCol = findColumn(headers, ['descripcion', 'descripción', 'nombre', 'producto', 'detalle'])
  const priceCol = findColumn(headers, ['precio', 'costo'])

  // Evitar que "codigo de barras" también matchee como columna de código genérico
  const finalSkuCol = skuCol === barcodeCol ? -1 : skuCol

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
