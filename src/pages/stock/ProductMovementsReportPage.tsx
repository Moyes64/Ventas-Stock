import { useState } from 'react'
import { stock as stockApi, catalog } from '../../lib/ipc'
import type { Product, StockMovement } from '../../types/ipc'
import { formatDateTime } from '../../lib/date'

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  ENTRY: '📥 Entrada',
  EXIT: '📤 Salida',
  ADJUSTMENT: '🔧 Ajuste',
  SALE: '🛒 Venta',
  PURCHASE_RETURN: '↩️ Dev. Compra',
}

/** Mismo criterio que StockRepository.movementEffectiveDelta: efecto real sobre el stock */
function effectiveDelta(type: string, quantity: number): number {
  if (type === 'EXIT' || type === 'SALE') return -Math.abs(quantity)
  if (type === 'ADJUSTMENT') return quantity
  return Math.abs(quantity)
}

/** yyyy-mm-dd en hora local, para comparar contra los inputs de fecha */
function localDateKey(value: string): string {
  const d = new Date(value)
  if (isNaN(d.getTime())) return value.slice(0, 10)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface ReportRow {
  movement: StockMovement
  ingreso: number
  egreso: number
  saldo: number
}

export default function ProductMovementsReportPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [product, setProduct] = useState<Product | null>(null)
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSearch(value: string) {
    setQuery(value)
    setProduct(null)
    setMovements([])
    if (value.trim().length < 2) { setResults([]); return }
    try {
      const byBarcode = await catalog.getByBarcode(value.trim())
      if (byBarcode) { void selectProduct(byBarcode); return }
      setResults(await catalog.searchProducts(value.trim()))
    } catch { /* non-critical */ }
  }

  async function selectProduct(p: Product) {
    setProduct(p)
    setQuery(p.name)
    setResults([])
    setLoading(true)
    setError(null)
    try {
      // Se traen todos los movimientos del producto para poder calcular el saldo acumulado
      const [mvts, current] = await Promise.all([
        stockApi.getMovements({ productId: p.id, limit: 100000 }),
        stockApi.getCurrent(p.id),
      ])
      setMovements(mvts)
      setProduct({ ...p, stockQuantity: current })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar movimientos')
    } finally {
      setLoading(false)
    }
  }

  function clearProduct() {
    setProduct(null)
    setQuery('')
    setResults([])
    setMovements([])
  }

  // Orden cronológico; el saldo inicial se deduce del stock actual menos la suma de todos los movimientos
  const chronological = [...movements].sort((a, b) =>
    a.createdAt === b.createdAt ? a.id - b.id : a.createdAt < b.createdAt ? -1 : 1
  )
  const totalDelta = chronological.reduce((s, m) => s + effectiveDelta(m.type, m.quantity), 0)
  const openingAll = (product?.stockQuantity ?? 0) - totalDelta

  let running = openingAll
  const allRows: ReportRow[] = chronological.map(m => {
    const delta = effectiveDelta(m.type, m.quantity)
    running += delta
    return { movement: m, ingreso: delta > 0 ? delta : 0, egreso: delta < 0 ? -delta : 0, saldo: running }
  })

  const rows = allRows.filter(r => {
    const key = localDateKey(r.movement.createdAt)
    if (dateFrom && key < dateFrom) return false
    if (dateTo && key > dateTo) return false
    return true
  })
  const firstIdx = rows.length ? allRows.indexOf(rows[0]) : -1
  const openingBalance = firstIdx > 0 ? allRows[firstIdx - 1].saldo : openingAll
  const totalIngresos = rows.reduce((s, r) => s + r.ingreso, 0)
  const totalEgresos = rows.reduce((s, r) => s + r.egreso, 0)
  const closingBalance = rows.length ? rows[rows.length - 1].saldo : openingBalance

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">🔎 Movimientos por producto</h1>
      </div>

      <div className="filter-bar">
        <div className="filter-bar__group" style={{ position: 'relative', minWidth: 320 }}>
          <label className="label">Producto</label>
          <input
            type="text"
            className="input"
            placeholder="SKU, código de barras o denominación..."
            value={query}
            onChange={e => { void handleSearch(e.target.value) }}
            autoComplete="off"
            autoFocus
          />
          {product && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ position: 'absolute', right: 2, top: 26, fontSize: '0.8em', padding: '2px 6px' }}
              onClick={clearProduct}
              title="Quitar producto"
            >
              ✕
            </button>
          )}
          {results.length > 0 && (
            <ul className="product-results" style={{ position: 'absolute', top: '100%', zIndex: 100, width: '100%', marginTop: 2 }}>
              {results.map(p => (
                <li key={p.id}>
                  <button type="button" className="product-result-item" onClick={() => { void selectProduct(p) }}>
                    <span className="product-result-name">{p.name}</span>
                    <span className="product-result-sku">{p.sku}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="filter-bar__group">
          <label className="label">Desde</label>
          <input type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="filter-bar__group">
          <label className="label">Hasta</label>
          <input type="date" className="input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <div className="filter-bar__actions">
          <button className="btn btn-ghost" onClick={() => { setDateFrom(''); setDateTo('') }} disabled={!dateFrom && !dateTo}>
            ✕ Limpiar fechas
          </button>
        </div>
      </div>

      {error && <div className="alert alert--error">{error}</div>}
      {loading && <p>Cargando movimientos...</p>}

      {!product && !loading && (
        <p className="empty-row">Ingresá un producto para ver sus ingresos y egresos.</p>
      )}

      {product && !loading && (
        <>
          <div className="alert" style={{ marginBottom: 16, background: 'var(--color-surface, #fff)', border: '1px solid var(--color-border, #e5e7eb)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'baseline' }}>
              <div>
                <strong>{product.name}</strong><br />
                <small>SKU: {product.sku || '—'} · Cód. barras: {product.barcode || '—'}</small>
              </div>
              <div>Saldo inicial: <strong>{openingBalance}</strong></div>
              <div className="qty-positive">Ingresos: <strong>+{totalIngresos}</strong></div>
              <div className="qty-negative">Egresos: <strong>-{totalEgresos}</strong></div>
              <div>Saldo final: <strong>{closingBalance}</strong></div>
              <div>Stock actual: <strong>{product.stockQuantity}</strong></div>
            </div>
          </div>

          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Comprobante / Ref.</th>
                  <th>Proveedor</th>
                  <th style={{ textAlign: 'right' }}>Ingreso</th>
                  <th style={{ textAlign: 'right' }}>Egreso</th>
                  <th style={{ textAlign: 'right' }}>Saldo</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ movement: m, ingreso, egreso, saldo }) => (
                  <tr key={m.id}>
                    <td>{formatDateTime(m.createdAt)}</td>
                    <td>{MOVEMENT_TYPE_LABELS[m.type] ?? m.type}</td>
                    <td>
                      {m.voucherType && m.voucherNumber
                        ? `${m.voucherType} ${m.voucherNumber}`
                        : m.referenceType
                          ? `${m.referenceType}${m.referenceId ? ` #${m.referenceId}` : ''}`
                          : '—'}
                    </td>
                    <td>{m.supplierName ?? '—'}</td>
                    <td className="qty-positive" style={{ textAlign: 'right' }}>{ingreso ? `+${ingreso}` : ''}</td>
                    <td className="qty-negative" style={{ textAlign: 'right' }}>{egreso ? `-${egreso}` : ''}</td>
                    <td style={{ textAlign: 'right' }}><strong>{saldo}</strong></td>
                    <td>{m.notes || '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={8} className="empty-row">Sin movimientos en el período</td></tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={4}><strong>Totales</strong></td>
                    <td className="qty-positive" style={{ textAlign: 'right' }}><strong>+{totalIngresos}</strong></td>
                    <td className="qty-negative" style={{ textAlign: 'right' }}><strong>-{totalEgresos}</strong></td>
                    <td style={{ textAlign: 'right' }}><strong>{closingBalance}</strong></td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  )
}
