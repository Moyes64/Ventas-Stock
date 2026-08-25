import { useEffect, useState } from 'react'
import { reporting, searchAnalytics, suppliers, stock } from '../../lib/ipc'
import { localToday, localFirstOfMonth, localCurrentMonth } from '../../lib/date'
import type { DailySummaryReport, RankingItem, PurchasesReport, IncompleteEntry, Supplier, SalesSummary, SearchAnalyticsReport } from '../../types/ipc'
import { useHiddenOptions } from '../../context/HiddenOptionsContext'
import { PieChart, PIE_COLORS as COLORS } from '../../components/charts/PieChart'
import { LineChart, type LineChartSeries } from '../../components/charts/LineChart'
import { BarList } from '../../components/charts/BarList'

/**
 * Piso del reporte "Ventas por día": antes de esta fecha hay un agujero real
 * de datos (10/may/2026 al 23/jun/2026 sin ventas cargadas en producción, entre
 * un backup viejo con solo 5 ventas de principios de mayo y el reinicio del
 * 24/jun). Se decidió con el usuario arrancar acá para no mostrar un hueco
 * confuso en el gráfico.
 */
const EVOLUTION_START_DATE = '2026-06-24'

function daysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const label = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

interface EntryDraft {
  voucherType: string
  voucherNumber: string
  voucherDate: string
  supplierId: number | ''
}

function IncompleteEntriesTable({
  entries,
  suppliersList,
  onSaved,
}: {
  entries: IncompleteEntry[]
  suppliersList: Supplier[]
  onSaved: () => void
}) {
  const [drafts, setDrafts] = useState<Record<number, EntryDraft>>({})
  const [savingId, setSavingId] = useState<number | null>(null)
  const [rowError, setRowError] = useState<Record<number, string>>({})

  useEffect(() => {
    const initial: Record<number, EntryDraft> = {}
    for (const e of entries) {
      initial[e.movementId] = {
        voucherType: e.voucherType ?? 'Remito',
        voucherNumber: e.voucherNumber ?? '',
        voucherDate: e.voucherDate ?? '',
        supplierId: e.supplierId ?? '',
      }
    }
    setDrafts(initial)
  }, [entries])

  function updateDraft(id: number, patch: Partial<EntryDraft>) {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  async function handleSave(id: number) {
    const d = drafts[id]
    if (!d) return
    setSavingId(id)
    setRowError(prev => ({ ...prev, [id]: '' }))
    try {
      await stock.updateMovement(id, {
        voucherType: d.voucherType || null,
        voucherNumber: d.voucherNumber || null,
        voucherDate: d.voucherDate || null,
        supplierId: d.supplierId === '' ? null : d.supplierId,
      })
      onSaved()
    } catch (err) {
      setRowError(prev => ({ ...prev, [id]: err instanceof Error ? err.message : 'Error al guardar' }))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="table-container">
      <table className="table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Producto</th>
            <th>Cant.</th>
            <th>Proveedor</th>
            <th>Tipo</th>
            <th>Número</th>
            <th>Fecha comprobante</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {entries.map(e => {
            const d = drafts[e.movementId]
            if (!d) return null
            return (
              <tr key={e.movementId}>
                <td className="text-muted" style={{ fontSize: '0.85em' }}>{e.createdAt.slice(0, 10)}</td>
                <td>{e.productName}</td>
                <td>{e.quantity}</td>
                <td>
                  <select
                    className="input input--select-sm"
                    value={d.supplierId}
                    onChange={ev => updateDraft(e.movementId, { supplierId: ev.target.value === '' ? '' : parseInt(ev.target.value) })}
                  >
                    <option value="">— Sin proveedor —</option>
                    {suppliersList.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className="input input--select-sm"
                    value={d.voucherType}
                    onChange={ev => updateDraft(e.movementId, { voucherType: ev.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="input input--select-sm"
                    value={d.voucherNumber}
                    onChange={ev => updateDraft(e.movementId, { voucherNumber: ev.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    className="input input--select-sm"
                    value={d.voucherDate}
                    onChange={ev => updateDraft(e.movementId, { voucherDate: ev.target.value })}
                  />
                </td>
                <td>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.8em', padding: '2px 8px' }}
                    onClick={() => void handleSave(e.movementId)}
                    disabled={savingId === e.movementId}
                  >
                    {savingId === e.movementId ? '⏳' : '💾 Guardar'}
                  </button>
                  {rowError[e.movementId] && (
                    <div className="error" style={{ fontSize: '0.75em' }}>{rowError[e.movementId]}</div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
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
  const [activeReport, setActiveReport] = useState<'daily' | 'evolution' | 'products' | 'purchases' | 'lowstock' | 'searches'>('daily')

  // Ventas por día (evolución mes a mes) state
  const [evolutionData, setEvolutionData] = useState<SalesSummary[]>([])
  const [evolutionLoading, setEvolutionLoading] = useState(false)
  const [evolutionError, setEvolutionError] = useState<string | null>(null)
  const [evolutionMonth, setEvolutionMonth] = useState(localCurrentMonth)

  // Búsquedas de clientes (buscador rápido de pandorabox-web) state
  const [searchDateFrom, setSearchDateFrom] = useState(localFirstOfMonth)
  const [searchDateTo, setSearchDateTo] = useState(localToday)
  const [includeInternalSearches, setIncludeInternalSearches] = useState(false)
  const [searchReport, setSearchReport] = useState<SearchAnalyticsReport | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  // Purchases (compras por proveedor) state
  const [purchaseDateFrom, setPurchaseDateFrom] = useState(localFirstOfMonth)
  const [purchaseDateTo, setPurchaseDateTo] = useState(localToday)
  const [purchaseSupplierId, setPurchaseSupplierId] = useState<number | ''>('')
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([])
  const [purchasesReport, setPurchasesReport] = useState<PurchasesReport | null>(null)
  const [purchasesLoading, setPurchasesLoading] = useState(false)
  const [purchasesError, setPurchasesError] = useState<string | null>(null)
  const [incompleteEntries, setIncompleteEntries] = useState<IncompleteEntry[]>([])

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

  async function loadPurchases() {
    setPurchasesLoading(true)
    setPurchasesError(null)
    try {
      const [report, incomplete] = await Promise.all([
        reporting.purchasesBySupplier({
          dateFrom: purchaseDateFrom,
          dateTo: purchaseDateTo,
          supplierId: purchaseSupplierId === '' ? undefined : purchaseSupplierId,
        }),
        reporting.incompleteEntries({ dateFrom: purchaseDateFrom, dateTo: purchaseDateTo }),
      ])
      setPurchasesReport(report)
      setIncompleteEntries(incomplete)
    } catch (err) {
      setPurchasesError(err instanceof Error ? err.message : 'Error al cargar el reporte de compras')
    } finally {
      setPurchasesLoading(false)
    }
  }

  useEffect(() => {
    void suppliers.list(true).then(setSuppliersList)
  }, [])

  useEffect(() => {
    if (activeReport === 'purchases') void loadPurchases()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReport])

  async function loadEvolution() {
    setEvolutionLoading(true)
    setEvolutionError(null)
    try {
      const data = await reporting.salesByDateRange({ dateFrom: EVOLUTION_START_DATE, dateTo: localToday() })
      setEvolutionData(data)
    } catch (err) {
      setEvolutionError(err instanceof Error ? err.message : 'Error al cargar la evolución de ventas')
    } finally {
      setEvolutionLoading(false)
    }
  }

  useEffect(() => {
    if (activeReport === 'evolution' && evolutionData.length === 0 && !evolutionLoading) void loadEvolution()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReport])

  // Agrupa las filas diarias por mes (YYYY-MM) para armar las series de los gráficos
  const evolutionByMonth = new Map<string, LineChartSeries['points']>()
  for (const row of evolutionData) {
    const [, , dayStr] = row.date.split('-')
    const key = row.date.slice(0, 7)
    if (!evolutionByMonth.has(key)) evolutionByMonth.set(key, [])
    evolutionByMonth.get(key)!.push({ x: Number(dayStr), y: row.totalAmount })
  }
  const evolutionMonths = Array.from(evolutionByMonth.keys()).sort()

  const evolutionAllMonthsSeries: LineChartSeries[] = evolutionMonths.map((key, idx) => ({
    label: monthLabel(key),
    color: COLORS[idx % COLORS.length],
    points: evolutionByMonth.get(key) ?? [],
  }))

  const evolutionSelectedSeries: LineChartSeries[] = [{
    label: monthLabel(evolutionMonth),
    color: COLORS[evolutionMonths.indexOf(evolutionMonth) % COLORS.length] ?? COLORS[0],
    points: evolutionByMonth.get(evolutionMonth) ?? [],
  }]

  async function loadSearchReport() {
    setSearchLoading(true)
    setSearchError(null)
    try {
      const data = await searchAnalytics.getReport({
        dateFrom: searchDateFrom,
        dateTo: searchDateTo,
        includeInternal: includeInternalSearches,
      })
      setSearchReport(data)
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Error al cargar las búsquedas de clientes')
    } finally {
      setSearchLoading(false)
    }
  }

  useEffect(() => {
    if (activeReport === 'searches' && !searchReport && !searchLoading) void loadSearchReport()
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
        {(['daily', 'evolution', 'products', 'purchases', 'lowstock', 'searches'] as const).map(t => (
          <button
            key={t}
            className={`tab ${activeReport === t ? 'tab--active' : ''}`}
            onClick={() => setActiveReport(t)}
          >
            {t === 'daily' ? 'Resumen Diario'
              : t === 'evolution' ? '📈 Ventas por día'
              : t === 'products' ? 'Productos'
              : t === 'purchases' ? '🛒 Compras'
              : t === 'searches' ? '🔎 Búsquedas web'
              : 'Stock Bajo'}
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

      {activeReport === 'evolution' && (
        <div className="evolution-report">
          <p className="page-subtitle">
            Total facturado por día (ventas autorizadas, comprobantes internos y pedidos web despachados),
            desde el {EVOLUTION_START_DATE.split('-').reverse().join('/')} hasta hoy.
          </p>

          {evolutionLoading && <p>Cargando...</p>}
          {evolutionError && <p className="error">{evolutionError}</p>}

          {!evolutionLoading && !evolutionError && (
            <>
              <div className="linechart-section">
                <h3 className="linechart-section-title">Todos los meses juntos</h3>
                <LineChart series={evolutionAllMonthsSeries} maxDay={31} />
              </div>

              <div className="linechart-section">
                <div className="linechart-section-header">
                  <h3 className="linechart-section-title">Detalle de un mes</h3>
                  <label>
                    Mes:
                    <select
                      className="input"
                      value={evolutionMonth}
                      onChange={e => setEvolutionMonth(e.target.value)}
                    >
                      {Array.from(new Set([...evolutionMonths, localCurrentMonth()])).sort().map(key => (
                        <option key={key} value={key}>{monthLabel(key)}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <LineChart series={evolutionSelectedSeries} maxDay={daysInMonth(evolutionMonth)} />
              </div>
            </>
          )}
        </div>
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
              <PieChart items={rankingQty.map(r => ({ label: r.productName, value: r.value }))} label="🏆 Top 10 — Cantidad vendida" />
              <PieChart items={rankingProfit.map(r => ({ label: r.productName, value: r.value }))} label="💰 Top 10 — Ganancia neta" />
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
      {activeReport === 'purchases' && (
        <div className="purchases-report">
          <div className="filter-bar filter-bar--wrap">
            <label>
              Desde:
              <input type="date" value={purchaseDateFrom} onChange={e => setPurchaseDateFrom(e.target.value)} className="input" />
            </label>
            <label>
              Hasta:
              <input type="date" value={purchaseDateTo} onChange={e => setPurchaseDateTo(e.target.value)} className="input" />
            </label>
            <label>
              Proveedor:
              <select
                className="input"
                value={purchaseSupplierId}
                onChange={e => setPurchaseSupplierId(e.target.value === '' ? '' : parseInt(e.target.value))}
              >
                <option value="">Todos</option>
                {suppliersList.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <button onClick={() => { void loadPurchases() }} className="btn btn-secondary">🔍 Generar</button>
          </div>

          {purchasesLoading && <p>Cargando...</p>}
          {purchasesError && <p className="error">{purchasesError}</p>}

          {!purchasesLoading && purchasesReport && (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-value">{currency(purchasesReport.grandTotalCost)}</div>
                  <div className="stat-label">Total a costo (lo que cobra el proveedor)</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{currency(purchasesReport.grandTotalPrice)}</div>
                  <div className="stat-label">Total valorizado a precio de venta</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{currency(purchasesReport.grandTotalPrice - purchasesReport.grandTotalCost)}</div>
                  <div className="stat-label">Margen potencial</div>
                </div>
                {purchasesReport.incompleteCount > 0 && (
                  <div className="stat-card stat-card--warning">
                    <div className="stat-value">{purchasesReport.incompleteCount}</div>
                    <div className="stat-label">Ingresos con datos faltantes</div>
                  </div>
                )}
              </div>

              {purchasesReport.suppliers.length === 0 && (
                <p className="empty-row">Sin ingresos de mercadería para el período seleccionado</p>
              )}

              {purchasesReport.suppliers.map(sg => (
                <details
                  key={sg.supplierId ?? 'none'}
                  className="purchases-supplier-block"
                  open={purchasesReport.suppliers.length <= 3}
                >
                  <summary className="purchases-supplier-summary">
                    <span className="purchases-supplier-name">{sg.supplierName}</span>
                    <span className="purchases-supplier-totals">
                      Costo: <strong>{currency(sg.totalCost)}</strong> · Precio venta: <strong>{currency(sg.totalPrice)}</strong>
                    </span>
                  </summary>
                  {sg.vouchers.map((vg, vidx) => (
                    <div key={vidx} className="purchases-voucher-block">
                      <div className="purchases-voucher-header">
                        <span>{vg.voucherType || 'Comprobante'} {vg.voucherNumber || '(sin número)'} {vg.voucherDate ? `— ${vg.voucherDate}` : ''}</span>
                        <span className="purchases-voucher-totals">
                          Costo: {currency(vg.totalCost)} · Precio: {currency(vg.totalPrice)}
                        </span>
                      </div>
                      <div className="table-container">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Producto</th>
                              <th>SKU</th>
                              <th>Cant.</th>
                              <th>Costo unit.</th>
                              <th>Subtotal costo</th>
                              <th>Precio unit.</th>
                              <th>Subtotal precio</th>
                            </tr>
                          </thead>
                          <tbody>
                            {vg.items.map(it => (
                              <tr key={it.movementId}>
                                <td>{it.productName}</td>
                                <td>{it.sku}</td>
                                <td>{it.quantity}</td>
                                <td>{currency(it.unitCost)}</td>
                                <td>{currency(it.subtotalCost)}</td>
                                <td>{currency(it.unitPrice)}</td>
                                <td>{currency(it.subtotalPrice)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </details>
              ))}
            </>
          )}

          {!purchasesLoading && incompleteEntries.length > 0 && (
            <div className="purchases-incomplete-section">
              <h3 className="purchases-incomplete-section__title">⚠️ Ingresos con datos faltantes — completar información</h3>
              <p className="page-subtitle">
                A estos ingresos de stock les falta el número de remito/factura y/o el proveedor.
                Mientras no tengan proveedor asignado, van a aparecer agrupados como &ldquo;Sin proveedor&rdquo;
                en el reporte de arriba en vez de sumarse al proveedor correspondiente. Completá los
                datos para corregirlo.
              </p>
              <IncompleteEntriesTable
                entries={incompleteEntries}
                suppliersList={suppliersList}
                onSaved={() => { void loadPurchases() }}
              />
            </div>
          )}
        </div>
      )}

      {activeReport === 'lowstock' && <p className="page-subtitle">Próximamente: Reporte de stock bajo</p>}

      {activeReport === 'searches' && (
        <div className="search-analytics-report">
          <p className="page-subtitle">
            Búsquedas hechas con el buscador rápido de pandorabox-web (&quot;Encontrá el regalo
            perfecto&quot;) — para tener una idea de qué rango de precio busca la clientela
            potencial. Requiere tener configurado &quot;Sync Web&quot; y haber subido
            search-logs.php al hosting.
          </p>

          <div className="filter-bar filter-bar--wrap">
            <label>
              Desde:
              <input type="date" value={searchDateFrom} onChange={e => setSearchDateFrom(e.target.value)} className="input" />
            </label>
            <label>
              Hasta:
              <input type="date" value={searchDateTo} onChange={e => setSearchDateTo(e.target.value)} className="input" />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={includeInternalSearches}
                onChange={e => setIncludeInternalSearches(e.target.checked)}
              />
              Incluir pruebas internas
            </label>
            <button onClick={() => { void loadSearchReport() }} className="btn btn-secondary">🔍 Generar</button>
          </div>

          {searchLoading && <p>Cargando...</p>}
          {searchError && <p className="error">{searchError}</p>}

          {!searchLoading && !searchError && searchReport && (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-value">{searchReport.totalSearches}</div>
                  <div className="stat-label">
                    Búsquedas {includeInternalSearches ? '(incluye pruebas internas)' : 'de clientes reales'}
                  </div>
                </div>
              </div>

              {searchReport.totalSearches === 0 ? (
                <p className="empty-row">Sin búsquedas para el período seleccionado</p>
              ) : (
                <div className="pie-wrapper">
                  <h3 className="pie-title">💲 Precio</h3>
                  <BarList items={searchReport.priceBuckets} color="#4f8ef7" />
                </div>
              )}
            </>
          )}
        </div>
      )}

      {isHiddenOptionsVisible && (
        <div className="hidden-options-section">
          <h3 className="hidden-options-section__title">🅽 Opciones N (ventas sin IVA)</h3>
          <p className="page-subtitle">Reportes de ventas en negro — próximamente disponibles.</p>
        </div>
      )}
    </div>
  )
}
