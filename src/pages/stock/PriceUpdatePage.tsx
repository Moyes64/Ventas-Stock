import { useState, useEffect } from 'react'
import { priceUpdate, catalog, suppliers } from '../../lib/ipc'
import { calcSalePrice, calcGainFromPrice } from '../../lib/pricing'
import type { ExcelPriceRow, ParseExcelResult, PriceUpdateItem, Product, TaxRate, Supplier } from '../../types/ipc'

type MatchSource = 'barcode' | 'sku' | 'name' | 'manual' | null

interface Row {
  productId: number
  sku: string
  barcode: string | null
  name: string
  currentPrice: number
  gainPercent: number     // % de ganancia guardado en el sistema (antes de esta actualización)
  ivaPct: number
  supplierCode: string    // código de proveedor guardado en el producto
  excelRowIndex: number | null
  matchSource: MatchSource
  finalPrice: string      // editable — se puede redondear a mano
  include: boolean
  saveSupplierCode: boolean
}

type Step = 'setup' | 'review' | 'done'

const SOURCE_LABELS: Record<Exclude<MatchSource, null>, { label: string; cls: string }> = {
  barcode: { label: '📊 Código barras', cls: 'badge--success' },
  sku:     { label: '🔗 Código proveedor', cls: 'badge--info' },
  name:    { label: '🔤 Nombre similar', cls: 'badge--warning' },
  manual:  { label: '✋ Manual', cls: 'badge--warning' },
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/**
 * Compara códigos (SKU/barras) tolerando diferencias cosméticas típicas entre
 * lo que guardó el usuario a mano y lo que trae la planilla: mayúsculas,
 * espacios, guiones/puntos separadores, y ceros a la izquierda perdidos por Excel
 * al tratar el código como número.
 */
function normalizeCode(s: string): string {
  return s.trim().toLowerCase().replace(/[\s.\-_/]/g, '').replace(/^0+(?=.)/, '')
}

function fuzzyNameMatch(productName: string, description: string): boolean {
  const a = normalizeText(productName)
  const b = normalizeText(description)
  if (a.length < 4 || b.length < 4) return false
  return a.includes(b.slice(0, Math.min(25, b.length))) || b.includes(a.slice(0, Math.min(25, a.length)))
}

export default function PriceUpdatePage() {
  const [step, setStep] = useState<Step>('setup')

  const [suppliersList, setSuppliersList] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [excelPath, setExcelPath] = useState<string | null>(null)

  const [comparing, setComparing] = useState(false)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [detectedColumns, setDetectedColumns] = useState<ParseExcelResult['detectedColumns'] | null>(null)

  const [excelRows, setExcelRows] = useState<ExcelPriceRow[]>([])
  const [rows, setRows] = useState<Row[]>([])

  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [appliedCount, setAppliedCount] = useState(0)

  useEffect(() => {
    void suppliers.list(true).then(setSuppliersList)
  }, [])

  const currency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  async function handleSelectExcel() {
    const p = await priceUpdate.selectExcel()
    if (p) { setExcelPath(p); setSetupError(null) }
  }

  async function handleCompare() {
    if (!supplierId || !excelPath) return
    setComparing(true)
    setSetupError(null)
    try {
      const parsed = await priceUpdate.parseExcel(excelPath)
      setDetectedColumns(parsed.detectedColumns)
      if (parsed.rows.length === 0) {
        setSetupError('No se pudo leer ninguna fila válida de la planilla. Revisá el formato (SKU, Código de barras, Descripción, Precio).')
        setWarnings(parsed.warnings)
        return
      }

      const [products, taxRates] = await Promise.all([
        catalog.listProducts(true),
        catalog.getTaxRates(),
      ])
      const supplierProducts = products.filter((p: Product) => p.supplierId === supplierId)
      if (supplierProducts.length === 0) {
        setSetupError('El proveedor seleccionado no tiene productos activos cargados en el sistema.')
        return
      }

      // Índices de la planilla para matching por código de barras / código de proveedor
      const byBarcode = new Map<string, number>()
      const bySku = new Map<string, number>()
      parsed.rows.forEach((r, i) => {
        if (r.barcode && !byBarcode.has(normalizeCode(r.barcode))) byBarcode.set(normalizeCode(r.barcode), i)
        if (r.sku && !bySku.has(normalizeCode(r.sku))) bySku.set(normalizeCode(r.sku), i)
      })
      const used = new Set<number>()

      const built: Row[] = supplierProducts.map((p: Product) => {
        const ivaPct = taxRates.find((t: TaxRate) => t.id === p.taxRateId)?.percentage ?? 0
        return {
          productId: p.id,
          sku: p.sku,
          barcode: p.barcode,
          name: p.name,
          currentPrice: p.price,
          gainPercent: p.gainPercent,
          ivaPct,
          supplierCode: p.supplierCode,
          excelRowIndex: null,
          matchSource: null as MatchSource,
          finalPrice: '',
          include: false,
          saveSupplierCode: false,
        }
      })

      // 1. Código de barras exacto
      built.forEach(row => {
        if (row.excelRowIndex !== null || !row.barcode) return
        const idx = byBarcode.get(normalizeCode(row.barcode))
        if (idx !== undefined && !used.has(idx)) { row.excelRowIndex = idx; row.matchSource = 'barcode'; used.add(idx) }
      })
      // 2. Código de proveedor (SKU en la planilla vs. supplier_code guardado)
      built.forEach(row => {
        if (row.excelRowIndex !== null || !row.supplierCode) return
        const idx = bySku.get(normalizeCode(row.supplierCode))
        if (idx !== undefined && !used.has(idx)) { row.excelRowIndex = idx; row.matchSource = 'sku'; used.add(idx) }
      })
      // 3. Nombre similar (fallback)
      built.forEach(row => {
        if (row.excelRowIndex !== null) return
        const idx = parsed.rows.findIndex((r, i) => !used.has(i) && fuzzyNameMatch(row.name, r.description))
        if (idx !== -1) { row.excelRowIndex = idx; row.matchSource = 'name'; used.add(idx) }
      })

      // Precio final propuesto para los que matchearon
      built.forEach(row => {
        if (row.excelRowIndex === null) return
        const excelPrice = parsed.rows[row.excelRowIndex].price
        row.finalPrice = String(round2(calcSalePrice(excelPrice, row.gainPercent, row.ivaPct)))
        row.include = true
      })

      setExcelRows(parsed.rows)
      setWarnings(parsed.warnings)
      setRows(built)
      setStep('review')
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : String(e))
    } finally {
      setComparing(false)
    }
  }

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }

  /** El usuario busca "a mano" en el excel el ítem correspondiente a un producto sin coincidencia */
  function handleManualMatch(idx: number, excelIdxRaw: string) {
    const excelIdx = excelIdxRaw === '' ? null : parseInt(excelIdxRaw)
    if (excelIdx === null) {
      updateRow(idx, { excelRowIndex: null, matchSource: null, finalPrice: '', include: false, saveSupplierCode: false })
      return
    }
    const row = rows[idx]
    const excelRow = excelRows[excelIdx]
    const finalPrice = String(round2(calcSalePrice(excelRow.price, row.gainPercent, row.ivaPct)))
    updateRow(idx, {
      excelRowIndex: excelIdx,
      matchSource: 'manual',
      finalPrice,
      include: true,
      saveSupplierCode: !!excelRow.sku && normalizeCode(excelRow.sku) !== normalizeCode(row.supplierCode),
    })
  }

  function toggleAllMatched(include: boolean) {
    setRows(prev => prev.map(r => r.excelRowIndex !== null ? { ...r, include } : r))
  }

  const matchedRows = rows.filter(r => r.excelRowIndex !== null)
  const unmatchedRows = rows.filter(r => r.excelRowIndex === null)
  const includedCount = rows.filter(r => r.include && r.excelRowIndex !== null && r.finalPrice !== '').length

  const bySourceCount = (src: Exclude<MatchSource, null>) =>
    rows.filter(r => r.matchSource === src).length

  async function handleApply() {
    const toApply = rows.filter(r => r.include && r.excelRowIndex !== null && r.finalPrice.trim() !== '')
    if (toApply.length === 0) return
    setApplying(true)
    setApplyError(null)
    try {
      const payload: PriceUpdateItem[] = toApply.map(r => {
        const excelRow = excelRows[r.excelRowIndex!]
        const finalPriceNum = parseFloat(r.finalPrice) || 0
        const gain = calcGainFromPrice(excelRow.price, finalPriceNum, r.ivaPct)
        const item: PriceUpdateItem = {
          productId: r.productId,
          cost: excelRow.price,
          price: finalPriceNum,
          gainPercent: gain,
        }
        if (r.matchSource === 'manual' && r.saveSupplierCode) {
          item.supplierCode = excelRow.sku
        }
        return item
      })
      const result = await priceUpdate.applyUpdates(payload)
      setAppliedCount(result.updated)
      setStep('done')
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e))
    } finally {
      setApplying(false)
    }
  }

  function reset() {
    setStep('setup'); setSupplierId(null); setExcelPath(null)
    setWarnings([]); setExcelRows([]); setRows([]); setDetectedColumns(null)
    setSetupError(null); setApplyError(null); setAppliedCount(0)
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">💲 Actualizar precios por proveedor</h1>
      </div>

      {/* ── PASO 1: Elegir proveedor y planilla ─────────────────────────── */}
      {step === 'setup' && (
        <div className="scanner-upload-section">
          <p className="page-subtitle">
            Subí la planilla de precios actualizada del proveedor para compararla contra
            los productos cargados en el sistema. La planilla debe tener columnas de{' '}
            <strong>SKU</strong>, <strong>Código de barras</strong>, <strong>Descripción</strong> y{' '}
            <strong>Precio</strong> (costo sin IVA).
          </p>

          <div className="form-group" style={{ marginTop: '1rem', maxWidth: 420 }}>
            <label className="label">Proveedor *</label>
            <select
              className="input"
              value={supplierId ?? ''}
              onChange={e => setSupplierId(e.target.value === '' ? null : parseInt(e.target.value))}
            >
              <option value="">— Seleccioná un proveedor —</option>
              {suppliersList.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div
            className={`scanner-dropzone ${excelPath ? 'scanner-dropzone--ready' : ''}`}
            style={{ marginTop: '1rem', maxWidth: 420 }}
            onClick={() => void handleSelectExcel()}
          >
            {excelPath ? (
              <>
                <div className="scanner-dropzone-icon">✅</div>
                <p className="scanner-dropzone-text">{excelPath.split(/[\\/]/).pop()}</p>
                <p className="scanner-dropzone-hint">Clic para cambiar</p>
              </>
            ) : (
              <>
                <div className="scanner-dropzone-icon">📄</div>
                <p className="scanner-dropzone-text">Clic para seleccionar la planilla</p>
                <p className="scanner-dropzone-hint">XLSX, XLS</p>
              </>
            )}
          </div>

          {setupError && <p className="error" style={{ marginTop: '1rem' }}>{setupError}</p>}
          {warnings.length > 0 && (
            <ul className="text-muted" style={{ fontSize: '0.85em', marginTop: '0.5rem' }}>
              {warnings.map((w, i) => <li key={i}>⚠️ {w}</li>)}
            </ul>
          )}

          <button
            className="btn btn-primary btn-lg"
            onClick={() => void handleCompare()}
            disabled={!supplierId || !excelPath || comparing}
            style={{ marginTop: '1.5rem' }}
          >
            {comparing ? '⏳ Comparando...' : '🔍 Comparar precios'}
          </button>
        </div>
      )}

      {/* ── PASO 2: Revisar y confirmar ──────────────────────────────────── */}
      {step === 'review' && (
        <div className="scanner-review-section">
          <div className="scanner-header-card">
            <h3 className="scanner-header-title">📋 Resultado de la comparación</h3>
            <div className="scanner-match-summary">
              <span className="badge badge--success">📊 {bySourceCount('barcode')} por código de barras</span>
              <span className="badge badge--info">🔗 {bySourceCount('sku')} por código de proveedor</span>
              <span className="badge badge--warning">🔤 {bySourceCount('name')} por nombre similar</span>
              {unmatchedRows.length > 0 && (
                <span className="badge badge--danger">❌ {unmatchedRows.length} sin coincidencia — buscá el producto a mano en la planilla</span>
              )}
            </div>
            {detectedColumns && (
              <p className="text-muted" style={{ fontSize: '0.8em', marginTop: 8 }}>
                Columnas detectadas en la planilla — SKU: <strong>{detectedColumns.sku ?? '❌ no encontrada'}</strong>
                {' · '}Código de barras: <strong>{detectedColumns.barcode ?? '❌ no encontrada'}</strong>
                {' · '}Descripción: <strong>{detectedColumns.description ?? '❌ no encontrada'}</strong>
                {' · '}Precio: <strong>{detectedColumns.price ?? '❌ no encontrada'}</strong>
                . Si alguna dice "no encontrada" o apunta a la columna equivocada, revisá el encabezado de esa columna en el excel.
              </p>
            )}
          </div>

          {warnings.length > 0 && (
            <ul className="text-muted" style={{ fontSize: '0.85em' }}>
              {warnings.map((w, i) => <li key={i}>⚠️ {w}</li>)}
            </ul>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" style={{ fontSize: '0.8em' }} onClick={() => toggleAllMatched(true)}>
              ✓ Incluir todos los coincidentes
            </button>
            <button className="btn btn-secondary" style={{ fontSize: '0.8em' }} onClick={() => toggleAllMatched(false)}>
              ✗ Excluir todos
            </button>
          </div>

          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>✓</th>
                  <th>SKU interno</th>
                  <th>Cód. proveedor</th>
                  <th>Cód. Barras</th>
                  <th>Producto</th>
                  <th>Precio actual</th>
                  <th>Precio excel (costo)</th>
                  <th>% Ganancia</th>
                  <th>Precio final</th>
                  <th>Var. %</th>
                  <th>Fuente</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const excelRow = row.excelRowIndex !== null ? excelRows[row.excelRowIndex] : null
                  const finalPriceNum = parseFloat(row.finalPrice)
                  const variation = excelRow && row.currentPrice > 0 && !Number.isNaN(finalPriceNum)
                    ? ((finalPriceNum - row.currentPrice) / row.currentPrice) * 100
                    : null
                  return (
                    <tr key={row.productId} className={!excelRow ? 'row--warning' : !row.include ? 'row--disabled' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={row.include && !!excelRow}
                          disabled={!excelRow}
                          onChange={e => updateRow(idx, { include: e.target.checked })}
                        />
                      </td>
                      <td className="text-muted" style={{ fontSize: '0.85em' }}>{row.sku}</td>
                      <td className={!excelRow ? '' : 'text-muted'} style={{ fontSize: '0.85em' }}>{row.supplierCode || '—'}</td>
                      <td className="text-muted" style={{ fontSize: '0.8em' }}>{row.barcode || '—'}</td>
                      <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.name}>
                        {row.name}
                        {!excelRow && (
                          <div style={{ marginTop: 4 }}>
                            <select
                              className="input input--select-sm"
                              value=""
                              onChange={e => handleManualMatch(idx, e.target.value)}
                            >
                              <option value="">✋ Buscar en la planilla…</option>
                              {excelRows.map((r, i) => (
                                <option key={i} value={i}>
                                  {(r.sku || r.barcode || '(sin código)')} — {r.description} — {currency(r.price)}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {row.matchSource === 'manual' && excelRow && (
                          <div style={{ marginTop: 4, fontSize: '0.75em' }}>
                            <label>
                              <input
                                type="checkbox"
                                checked={row.saveSupplierCode}
                                onChange={e => updateRow(idx, { saveSupplierCode: e.target.checked })}
                              />{' '}
                              Guardar código de proveedor "{excelRow.sku}" para próximas actualizaciones
                            </label>
                          </div>
                        )}
                      </td>
                      <td>{currency(row.currentPrice)}</td>
                      <td>{excelRow ? currency(excelRow.price) : '—'}</td>
                      <td className="text-muted">{row.gainPercent.toFixed(1)}%</td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          className="input input--qty"
                          style={{ width: 100 }}
                          value={row.finalPrice}
                          disabled={!excelRow}
                          onChange={e => updateRow(idx, { finalPrice: e.target.value })}
                        />
                      </td>
                      <td>
                        {variation !== null ? (
                          <span className={`badge ${variation < 0 ? 'badge--danger' : Math.abs(variation) > 25 ? 'badge--warning' : 'badge--success'}`}>
                            {variation > 0 ? '+' : ''}{variation.toFixed(1)}%
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        {row.matchSource ? (
                          <span className={`badge ${SOURCE_LABELS[row.matchSource].cls}`} style={{ fontSize: '0.75em' }}>
                            {SOURCE_LABELS[row.matchSource].label}
                          </span>
                        ) : (
                          <span className="badge badge--danger" style={{ fontSize: '0.75em' }}>❌ Sin coincidencia</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {matchedRows.length < rows.length && (
            <p className="scanner-hint">
              💡 Para los productos sin coincidencia, usá el desplegable "Buscar en la planilla…" para
              indicar manualmente cuál es el artículo correspondiente (útil si el SKU o el código de barras
              tienen algún error).
            </p>
          )}

          {applyError && <p className="error">{applyError}</p>}

          <div className="scanner-actions">
            <button className="btn btn-secondary" onClick={reset} disabled={applying}>← Volver</button>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => void handleApply()}
              disabled={applying || includedCount === 0}
            >
              {applying ? '⏳ Actualizando...' : `✅ Actualizar precios (${includedCount} productos)`}
            </button>
          </div>
        </div>
      )}

      {/* ── PASO 3: Éxito ────────────────────────────────────────────────── */}
      {step === 'done' && (
        <div className="scanner-done-card">
          <div className="scanner-done-icon">✅</div>
          <h2 className="scanner-done-title">¡Precios actualizados correctamente!</h2>
          <p className="scanner-done-sub">
            Se actualizaron <strong>{appliedCount} productos</strong>.
          </p>
          <div className="scanner-actions">
            <button className="btn btn-secondary" onClick={reset}>💲 Actualizar otro proveedor</button>
          </div>
        </div>
      )}
    </div>
  )
}
