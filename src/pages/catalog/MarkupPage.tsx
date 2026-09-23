import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { priceUpdate, catalog, suppliers } from '../../lib/ipc'
import { calcSalePrice, calcGainFromPrice, roundUpToStep } from '../../lib/pricing'
import { useConfirm } from '../../hooks/useConfirm'
import type { PriceUpdateItem, Product, TaxRate, Supplier } from '../../types/ipc'

interface Row {
  productId: number
  name: string
  cost: number            // costo actual (sin IVA) — no se modifica
  currentPrice: number    // PVP actual (con IVA)
  currentGain: number     // % de markup vigente
  ivaPct: number
  gainPercent: string     // nuevo % — editable, sincronizado con Nuevo PVP
  finalPrice: string      // nuevo PVP — editable, sincronizado con % Markup
  include: boolean
}

type Step = 'setup' | 'review' | 'done'

/** Posición desde la que se redondea el precio final (siempre hacia arriba) */
const ROUNDING_OPTIONS: { step: number; label: string }[] = [
  { step: 0,      label: 'Sin redondeo (centavos)' },
  { step: 1,      label: 'Unidad ($1)' },
  { step: 10,     label: 'Decena ($10)' },
  { step: 100,    label: 'Centena ($100)' },
  { step: 1000,   label: 'Unidad de mil ($1.000)' },
  { step: 10000,  label: 'Decena de mil ($10.000)' },
  { step: 100000, label: 'Centena de mil ($100.000)' },
]

const round2 = (n: number) => Math.round(n * 100) / 100

const currency = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

export default function MarkupPage() {
  const navigate = useNavigate()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const [step, setStep] = useState<Step>('setup')
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [markup, setMarkup] = useState('')
  const [roundingStep, setRoundingStep] = useState(10)
  const [rows, setRows] = useState<Row[]>([])
  const [skippedNoCost, setSkippedNoCost] = useState(0)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appliedCount, setAppliedCount] = useState(0)

  useEffect(() => {
    void suppliers.list(true).then(setSuppliersList)
  }, [])

  const markupNum = parseFloat(markup)
  const markupValid = Number.isFinite(markupNum) && markupNum >= 0

  /** Precio con el markup objetivo, redondeado hacia arriba a la posición elegida */
  function proposedPrice(cost: number, ivaPct: number): number {
    return roundUpToStep(calcSalePrice(cost, markupNum, ivaPct), roundingStep)
  }

  async function handleCalculate() {
    if (!supplierId || !markupValid) return
    setLoading(true)
    setError(null)
    try {
      const [products, taxRates] = await Promise.all([
        catalog.listProducts(true),
        catalog.getTaxRates(),
      ])
      const supplierProducts = products.filter((p: Product) => p.supplierId === supplierId)
      if (supplierProducts.length === 0) {
        setError('El proveedor seleccionado no tiene productos activos cargados en el sistema.')
        return
      }
      // Sin costo no hay markup posible: se dejan afuera y se avisa cuántos son
      const withCost = supplierProducts.filter((p: Product) => p.cost > 0)
      setSkippedNoCost(supplierProducts.length - withCost.length)
      if (withCost.length === 0) {
        setError('Ningún producto activo del proveedor tiene costo cargado.')
        return
      }

      const built: Row[] = withCost
        .map((p: Product) => {
          const ivaPct = taxRates.find((t: TaxRate) => t.id === p.taxRateId)?.percentage ?? 0
          const price = proposedPrice(p.cost, ivaPct)
          return {
            productId: p.id,
            name: p.name,
            cost: p.cost,
            currentPrice: p.price,
            currentGain: p.gainPercent,
            ivaPct,
            gainPercent: String(calcGainFromPrice(p.cost, price, ivaPct)),
            finalPrice: String(round2(price)),
            include: true,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      setRows(built)
      setStep('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  /** Vuelve a aplicar markup + redondeo a todas las filas (descarta ajustes manuales) */
  function handleRecalculate() {
    if (!markupValid) return
    setRows(prev => prev.map(r => {
      const price = proposedPrice(r.cost, r.ivaPct)
      return {
        ...r,
        gainPercent: String(calcGainFromPrice(r.cost, price, r.ivaPct)),
        finalPrice: String(round2(price)),
      }
    }))
  }

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }

  /** Editar el % recalcula el PVP exacto (sin redondeo) */
  function handleGainChange(idx: number, value: string) {
    const row = rows[idx]
    const gainNum = parseFloat(value)
    const finalPrice = Number.isFinite(gainNum)
      ? String(round2(calcSalePrice(row.cost, gainNum, row.ivaPct)))
      : row.finalPrice
    updateRow(idx, { gainPercent: value, finalPrice })
  }

  /** Editar el PVP recalcula el % resultante */
  function handleFinalPriceChange(idx: number, value: string) {
    const row = rows[idx]
    const priceNum = parseFloat(value)
    const gainPercent = Number.isFinite(priceNum)
      ? String(calcGainFromPrice(row.cost, priceNum, row.ivaPct))
      : row.gainPercent
    updateRow(idx, { finalPrice: value, gainPercent })
  }

  function toggleAll(include: boolean) {
    setRows(prev => prev.map(r => ({ ...r, include })))
  }

  const isApplicable = (r: Row) => r.include && (parseFloat(r.finalPrice) || 0) > 0
  const includedCount = rows.filter(isApplicable).length
  const belowTargetCount = rows.filter(r => r.include && (parseFloat(r.gainPercent) || 0) < markupNum).length

  async function handleApply() {
    const toApply = rows.filter(isApplicable)
    if (toApply.length === 0) return
    const warn = belowTargetCount > 0
      ? `\n\nAtención: ${belowTargetCount} producto(s) quedan por debajo del ${markupNum}% objetivo.`
      : ''
    if (!(await confirm(`¿Actualizar el precio de ${toApply.length} productos?${warn}`))) return
    setApplying(true)
    setError(null)
    try {
      const payload: PriceUpdateItem[] = toApply.map(r => {
        const price = parseFloat(r.finalPrice) || 0
        return {
          productId: r.productId,
          cost: r.cost,
          price,
          gainPercent: calcGainFromPrice(r.cost, price, r.ivaPct),
        }
      })
      const result = await priceUpdate.applyUpdates(payload)
      setAppliedCount(result.updated)
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setApplying(false)
    }
  }

  function reset() {
    setStep('setup'); setRows([]); setSkippedNoCost(0)
    setError(null); setAppliedCount(0)
  }

  const supplierName = suppliersList.find(s => s.id === supplierId)?.name ?? ''

  return (
    <div className="page">
      {confirmDialog}
      <div className="page-header">
        <h1 className="page-title">📈 Gestión de %Markup</h1>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => navigate('/catalog')}>← Volver al catálogo</button>
        </div>
      </div>

      {/* ── Parámetros ───────────────────────────────────────────────────── */}
      {step !== 'done' && (
        <div className="scanner-upload-section">
          <p className="page-subtitle">
            Aplicá un único % de markup a todos los productos de un proveedor, <strong>reemplazando</strong> el
            vigente. El precio final (con IVA) se redondea siempre hacia arriba a la posición elegida,
            así el markup real nunca queda por debajo del objetivo.
          </p>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginTop: '1rem' }}>
            <div className="form-group" style={{ minWidth: 260 }}>
              <label className="label">Proveedor *</label>
              <select
                className="input"
                value={supplierId ?? ''}
                disabled={step === 'review'}
                onChange={e => setSupplierId(e.target.value === '' ? null : parseInt(e.target.value))}
              >
                <option value="">— Seleccioná un proveedor —</option>
                {suppliersList.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ width: 140 }}>
              <label className="label">% Markup *</label>
              <input
                type="number"
                step="0.1"
                min="0"
                className="input"
                value={markup}
                onChange={e => setMarkup(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ minWidth: 220 }}>
              <label className="label">Redondear a</label>
              <select
                className="input"
                value={roundingStep}
                onChange={e => setRoundingStep(parseInt(e.target.value))}
              >
                {ROUNDING_OPTIONS.map(o => (
                  <option key={o.step} value={o.step}>{o.label}</option>
                ))}
              </select>
            </div>
            {step === 'setup' ? (
              <button
                className="btn btn-primary"
                onClick={() => void handleCalculate()}
                disabled={!supplierId || !markupValid || loading}
              >
                {loading ? '⏳ Calculando...' : '🔍 Calcular'}
              </button>
            ) : (
              <>
                <button className="btn btn-primary" onClick={handleRecalculate} disabled={!markupValid || applying}
                  title="Vuelve a aplicar % y redondeo a todas las filas (descarta los ajustes manuales)">
                  🔄 Recalcular todo
                </button>
                <button className="btn btn-secondary" onClick={reset} disabled={applying}>Cambiar proveedor</button>
              </>
            )}
          </div>

          {step === 'setup' && error && <p className="error" style={{ marginTop: '1rem' }}>{error}</p>}
        </div>
      )}

      {/* ── Revisión ─────────────────────────────────────────────────────── */}
      {step === 'review' && (
        <div className="scanner-review-section">
          <div className="scanner-header-card">
            <h3 className="scanner-header-title">📋 {supplierName} — {rows.length} productos</h3>
            <div className="scanner-match-summary">
              <span className="badge badge--info">✓ {includedCount} a actualizar</span>
              {belowTargetCount > 0 && (
                <span className="badge badge--danger">⚠️ {belowTargetCount} por debajo del {markupNum}% objetivo</span>
              )}
              {skippedNoCost > 0 && (
                <span className="badge badge--warning">{skippedNoCost} sin costo cargado (no incluidos)</span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" style={{ fontSize: '0.8em' }} onClick={() => toggleAll(true)}>
              ✓ Incluir todos
            </button>
            <button className="btn btn-secondary" style={{ fontSize: '0.8em' }} onClick={() => toggleAll(false)}>
              ✗ Excluir todos
            </button>
          </div>

          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>✓</th>
                  <th>Producto</th>
                  <th>Costo</th>
                  <th>IVA</th>
                  <th>% Actual</th>
                  <th>PVP Actual</th>
                  <th>Nuevo %</th>
                  <th>Nuevo PVP</th>
                  <th>Dif. PVP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const newPrice = parseFloat(row.finalPrice) || 0
                  const below = (parseFloat(row.gainPercent) || 0) < markupNum
                  const diffPct = row.currentPrice > 0 ? ((newPrice - row.currentPrice) / row.currentPrice) * 100 : null
                  return (
                    <tr key={row.productId} className={!row.include ? 'row--disabled' : below ? 'row--warning' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={row.include}
                          onChange={e => updateRow(idx, { include: e.target.checked })}
                        />
                      </td>
                      <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.name}>
                        {row.name}
                      </td>
                      <td>{currency(row.cost)}</td>
                      <td>{row.ivaPct}%</td>
                      <td>{row.currentGain}%</td>
                      <td>{currency(row.currentPrice)}</td>
                      <td>
                        <input
                          type="number"
                          step="0.1"
                          className="input input--qty"
                          style={{ width: 80, ...(below ? { borderColor: 'var(--color-danger, #dc2626)' } : {}) }}
                          title={below ? `Por debajo del ${markupNum}% objetivo` : undefined}
                          value={row.gainPercent}
                          onChange={e => handleGainChange(idx, e.target.value)}
                        />%
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.01"
                          className="input input--qty"
                          style={{ width: 110 }}
                          value={row.finalPrice}
                          onChange={e => handleFinalPriceChange(idx, e.target.value)}
                        />
                      </td>
                      <td>
                        {diffPct !== null ? (
                          <span className={`badge ${diffPct < 0 ? 'badge--danger' : Math.abs(diffPct) > 25 ? 'badge--warning' : 'badge--success'}`}>
                            {diffPct > 0 ? '+' : ''}{diffPct.toFixed(1)}%
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="scanner-hint">
            💡 Podés ajustar a mano el % o el precio de cada fila: uno recalcula el otro (sin redondeo).
            "Recalcular todo" vuelve a aplicar el % y el redondeo elegidos a todas las filas y descarta esos ajustes.
          </p>

          {error && <p className="error">{error}</p>}

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

      {/* ── Éxito ────────────────────────────────────────────────────────── */}
      {step === 'done' && (
        <div className="scanner-done-card">
          <div className="scanner-done-icon">✅</div>
          <h2 className="scanner-done-title">¡Precios actualizados correctamente!</h2>
          <p className="scanner-done-sub">
            Se actualizaron <strong>{appliedCount} productos</strong> de {supplierName}.
          </p>
          <div className="scanner-actions">
            <button className="btn btn-secondary" onClick={reset}>📈 Aplicar a otro proveedor</button>
            <button className="btn btn-primary" onClick={() => navigate('/catalog')}>Volver al catálogo</button>
          </div>
        </div>
      )}
    </div>
  )
}
