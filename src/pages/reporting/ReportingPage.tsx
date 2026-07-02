import { useEffect, useState } from 'react'
import { reporting } from '../../lib/ipc'
import { localToday, localFirstOfMonth, localCurrentMonth } from '../../lib/date'
import type { DailySummaryReport, RankingItem } from '../../types/ipc'
import { useHiddenOptions } from '../../context/HiddenOptionsContext'

// ── SVG Pie Chart ──────────────────────────────────────────────────────────────
const COLORS = [
  '#4f8ef7','#f7874f','#4fd38e','#f74f7e','#d4e04f',
  '#7c4ff7','#4fcff7','#f7c74f','#9bf74f','#f74fc4',
]

interface PieSlice { label: string; value: number; color: string }

function PieChart({ items, label }: { items: RankingItem[]; label: string }) {
  const total = items.reduce((s, i) => s + i.value, 0)
  if (total === 0 || items.length === 0) {
    return <div className="pie-empty">Sin datos</div>
  }

  const SIZE = 200
  const CX = SIZE / 2
  const CY = SIZE / 2
  const R = 80

  const slices: PieSlice[] = items.map((it, idx) => ({
    label: it.productName,
    value: it.value,
    color: COLORS[idx % COLORS.length],
  }))

  // Build arc paths
  let startAngle = -Math.PI / 2
  const paths = slices.map((s, idx) => {
    const angle = (s.value / total) * 2 * Math.PI
    const endAngle = startAngle + angle
    const x1 = CX + R * Math.cos(startAngle)
    const y1 = CY + R * Math.sin(startAngle)
    const x2 = CX + R * Math.cos(endAngle)
    const y2 = CY + R * Math.sin(endAngle)
    const largeArc = angle > Math.PI ? 1 : 0
    const d = `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`
    startAngle = endAngle
    return <path key={idx} d={d} fill={s.color} stroke="#fff" strokeWidth={1} />
  })

  return (
    <div className="pie-wrapper">
      <h3 className="pie-title">{label}</h3>
      <div className="pie-body">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {paths}
        </svg>
        <div className="pie-legend">
          {slices.map((s, idx) => (
            <div key={idx} className="pie-legend-item">
              <span className="pie-legend-dot" style={{ background: s.color }} />
              <span className="pie-legend-name" title={s.label}>
                {s.label.length > 22 ? s.label.slice(0, 20) + '…' : s.label}
              </span>
              <span className="pie-legend-value">
                {((s.value / total) * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ReportingPage() {
  const [summary, setSummary] = useState<DailySummaryReport[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { isHiddenOptionsVisible } = useHiddenOptions()
  const [dateFrom, setDateFrom] = useState(localFirstOfMonth)
  const [dateTo, setDateTo] = useState(localToday)
  const [activeReport, setActiveReport] = useState<'daily' | 'products' | 'lowstock'>('daily')

  // Ranking dashboard state
  const [rankDateFrom, setRankDateFrom] = useState(localFirstOfMonth)
  const [rankDateTo, setRankDateTo] = useState(localToday)
  const [rankMonth, setRankMonth] = useState(localCurrentMonth)
  const [rankFilterMode, setRankFilterMode] = useState<'range' | 'month'>('month')
  const [rankingQty, setRankingQty] = useState<RankingItem[]>([])
  const [rankingProfit, setRankingProfit] = useState<RankingItem[]>([])
  const [rankLoading, setRankLoading] = useState(false)
  const [rankError, setRankError] = useState<string | null>(null)

  async function loadRanking(overrides?: { dateFrom?: string; dateTo?: string }) {
    let from = overrides?.dateFrom ?? rankDateFrom
    let to = overrides?.dateTo ?? rankDateTo
    if (rankFilterMode === 'month') {
      const [y, m] = rankMonth.split('-').map(Number)
      const last = new Date(y, m, 0).getDate()
      from = `${rankMonth}-01`
      to = `${rankMonth}-${String(last).padStart(2, '0')}`
    }
    setRankLoading(true)
    setRankError(null)
    try {
      const [qty, profit] = await Promise.all([
        reporting.rankingPorCantidad({ dateFrom: from, dateTo: to }),
        reporting.rankingPorGanancia({ dateFrom: from, dateTo: to }),
      ])
      setRankingQty(qty)
      setRankingProfit(profit)
    } catch (err) {
      setRankError(err instanceof Error ? err.message : 'Error al cargar ranking')
    } finally {
      setRankLoading(false)
    }
  }

  useEffect(() => {
    if (activeReport === 'products') void loadRanking()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReport])

  async function loadReport() {
    setLoading(true)
    setError(null)
    try {
      const data = await reporting.dailySummary({ dateFrom, dateTo })
      setSummary(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar reportes')
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadReport() }, [])

  const currency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  const totalSales = summary.reduce((s, r) => s + r.salesCount, 0)
  const totalGross = summary.reduce((s, r) => s + r.totalGross, 0)
  const totalTax = summary.reduce((s, r) => s + r.totalTax, 0)

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Reportes</h1>
      </div>

      <div className="tab-bar">
        {(['daily', 'products', 'lowstock'] as const).map(t => (
          <button
            key={t}
            className={`tab ${activeReport === t ? 'tab--active' : ''}`}
            onClick={() => setActiveReport(t)}
          >
            {t === 'daily' ? 'Resumen Diario' : t === 'products' ? 'Productos' : 'Stock Bajo'}
          </button>
        ))}
      </div>

      {activeReport === 'daily' && (
        <>
          <div className="filter-bar">
            <label>
              Desde:
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input" />
            </label>
            <label>
              Hasta:
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input" />
            </label>
            <button onClick={() => { void loadReport() }} className="btn btn-secondary">Generar</button>
          </div>

          {loading && <p>Cargando...</p>}
          {error && <p className="error">{error}</p>}

          {!loading && summary.length > 0 && (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-value">{totalSales}</div>
                  <div className="stat-label">Total Ventas</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{currency(totalGross)}</div>
                  <div className="stat-label">Total Bruto</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{currency(totalTax)}</div>
                  <div className="stat-label">Total IVA</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{currency(totalGross - totalTax)}</div>
                  <div className="stat-label">Total Neto</div>
                </div>
              </div>

              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Ventas</th>
                      <th>Facturas AFIP</th>
                      <th>Comp. Internos</th>
                      <th>Total Bruto</th>
                      <th>IVA</th>
                      <th>Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map(row => (
                      <tr key={row.date}>
                        <td>{row.date}</td>
                        <td>{row.salesCount}</td>
                        <td>{row.authorizedInvoices}</td>
                        <td>{row.internalReceipts}</td>
                        <td>{currency(row.totalGross)}</td>
                        <td>{currency(row.totalTax)}</td>
                        <td>{currency(row.totalNet)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!loading && summary.length === 0 && (
            <p className="empty-row">Sin datos para el período seleccionado</p>
          )}
        </>
      )}

      {activeReport === 'products' && (
        <div className="ranking-dashboard">
          {/* Filtros */}
          <div className="filter-bar filter-bar--wrap">
            <label>
              Filtrar por:
              <select
                value={rankFilterMode}
                onChange={e => setRankFilterMode(e.target.value as 'range' | 'month')}
                className="select"
              >
                <option value="month">Mes</option>
                <option value="range">Rango de fechas</option>
              </select>
            </label>
            {rankFilterMode === 'month' ? (
              <label>
                Mes:
                <input
                  type="month"
                  value={rankMonth}
                  onChange={e => setRankMonth(e.target.value)}
                  className="input"
                />
              </label>
            ) : (
              <>
                <label>
                  Desde:
                  <input type="date" value={rankDateFrom} onChange={e => setRankDateFrom(e.target.value)} className="input" />
                </label>
                <label>
                  Hasta:
                  <input type="date" value={rankDateTo} onChange={e => setRankDateTo(e.target.value)} className="input" />
                </label>
              </>
            )}
            <button onClick={() => { void loadRanking() }} className="btn btn-secondary">
              🔍 Actualizar
            </button>
          </div>

          {rankLoading && <p>Cargando ranking...</p>}
          {rankError && <p className="error">{rankError}</p>}

          {!rankLoading && (
            <div className="ranking-charts">
              <PieChart items={rankingQty} label="🏆 Top 10 — Cantidad vendida" />
              <PieChart items={rankingProfit} label="💰 Top 10 — Ganancia neta" />
            </div>
          )}

          {!rankLoading && (rankingQty.length > 0 || rankingProfit.length > 0) && (
            <div className="ranking-tables">
              {/* Tabla cantidad */}
              <div className="ranking-table-block">
                <h3 className="ranking-table-title">Cantidad vendida</h3>
                <table className="table">
                  <thead>
                    <tr><th>#</th><th>Producto</th><th>SKU</th><th>Unidades</th></tr>
                  </thead>
                  <tbody>
                    {rankingQty.map((r, idx) => (
                      <tr key={r.productId}>
                        <td>
                          <span className="ranking-badge" style={{ background: COLORS[idx % COLORS.length] }}>
                            {idx + 1}
                          </span>
                        </td>
                        <td>{r.productName}</td>
                        <td>{r.sku}</td>
                        <td>{r.value.toLocaleString('es-AR')}</td>
                      </tr>
                    ))}
                    {rankingQty.length === 0 && (
                      <tr><td colSpan={4} className="empty-row">Sin datos</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Tabla ganancia */}
              <div className="ranking-table-block">
                <h3 className="ranking-table-title">Ganancia neta</h3>
                <table className="table">
                  <thead>
                    <tr><th>#</th><th>Producto</th><th>SKU</th><th>Ganancia</th></tr>
                  </thead>
                  <tbody>
                    {rankingProfit.map((r, idx) => (
                      <tr key={r.productId}>
                        <td>
                          <span className="ranking-badge" style={{ background: COLORS[idx % COLORS.length] }}>
                            {idx + 1}
                          </span>
                        </td>
                        <td>{r.productName}</td>
                        <td>{r.sku}</td>
                        <td>{new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(r.value)}</td>
                      </tr>
                    ))}
                    {rankingProfit.length === 0 && (
                      <tr><td colSpan={4} className="empty-row">Sin datos</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      {activeReport === 'lowstock' && <p className="page-subtitle">Próximamente: Reporte de stock bajo</p>}

      {isHiddenOptionsVisible && (
        <div className="hidden-options-section">
          <h3 className="hidden-options-section__title">🅽 Opciones N (ventas sin IVA)</h3>
          <p className="page-subtitle">Reportes de ventas en negro — próximamente disponibles.</p>
        </div>
      )}
    </div>
  )
}
