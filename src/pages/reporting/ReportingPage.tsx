import { useEffect, useState } from 'react'
import { reporting, searchAnalytics, suppliers, stock } from '../../lib/ipc'
import { localToday, localFirstOfMonth, localCurrentMonth, formatDate } from '../../lib/date'
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

/** Meses YYYY-MM desde `from` hasta `to`, ambos inclusive. */
function monthRange(from: string, to: string): string[] {
  const months: string[] = []
  let [y, m] = from.split('-').map(Number)
  const [toY, toM] = to.split('-').map(Number)
  while (y < toY || (y === toY && m <= toM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

/** Tramos del mes para el resumen de patrón (inicio / mitad / fin). */
const MONTH_SEGMENTS = [
  { label: 'Inicio de mes', from: 1, to: 10 },
  { label: 'Mitad de mes', from: 11, to: 20 },
  { label: 'Fin de mes', from: 21, to: 31 },
]

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
    // Conserva lo que el usuario ya editó (sin guardar) en las filas que siguen en la lista
    setDrafts(prev => {
      const initial: Record<number, EntryDraft> = {}
      for (const e of entries) {
        initial[e.movementId] = prev[e.movementId] ?? {
          voucherType: e.voucherType ?? 'Remito',
          voucherNumber: e.voucherNumber ?? '',
          voucherDate: e.voucherDate ?? '',
          supplierId: e.supplierId ?? '',
        }
      }
      return initial
    })
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
  const [evolutionFrom, setEvolutionFrom] = useState(EVOLUTION_START_DATE.slice(0, 7))
  const [evolutionTo, setEvolutionTo] = useState(localCurrentMonth)
  const [evolutionOnlyAverage, setEvolutionOnlyAverage] = useState(false)

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
  const [rankingQty, setRankingQty] = useState<RankingItem[]>([])
  const [rankingProfit, setRankingProfit] = useState<RankingItem[]>([])
  const [rankLoading, setRankLoading] = useState(false)
  const [rankError, setRankError] = useState<string | null>(null)
  const [rankExporting, setRankExporting] = useState(false)
  const [rankExportMsg, setRankExportMsg] = useState<string | null>(null)

  async function loadRanking() {
    setRankLoading(true)
    setRankError(null)
    try {
      const [qty, profit] = await Promise.all([
        reporting.rankingPorCantidad({ dateFrom: rankDateFrom, dateTo: rankDateTo }),
        reporting.rankingPorGanancia({ dateFrom: rankDateFrom, dateTo: rankDateTo }),
      ])
      setRankingQty(qty)
      setRankingProfit(profit)
    } catch (err) {
      setRankError(err instanceof Error ? err.message : 'Error al cargar ranking')
    } finally {
      setRankLoading(false)
    }
  }

  async function exportRanking() {
    setRankExporting(true)
    setRankError(null)
    setRankExportMsg(null)
    try {
      const result = await reporting.exportProductsReport({ dateFrom: rankDateFrom, dateTo: rankDateTo })
      if (result.canceled) return
      if (result.success) {
        setRankExportMsg(`Exportado (${result.count ?? 0} productos): ${result.filePath ?? ''}`)
      } else {
        setRankError(result.error ?? 'Error al exportar')
      }
    } catch (err) {
      setRankError(err instanceof Error ? err.message : 'Error al exportar')
    } finally {
      setRankExporting(false)
    }
  }

  useEffect(() => {
    if (activeReport === 'products') void loadRanking()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReport])

  // silent: refresca sin mostrar "Cargando..." (que desmonta el contenido y
  // hace que la página salte arriba de todo), para usar después de guardar una fila
  async function loadPurchases(silent = false) {
    if (!silent) setPurchasesLoading(true)
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

  // Total por fecha (YYYY-MM-DD). La consulta solo trae días con ventas: un día
  // sin ventas dentro del período registrado cuenta como $0 (no como "sin dato").
  const evolutionByDate = new Map(evolutionData.map(row => [row.date, row.totalAmount]))
  const evolutionToday = localToday()
  const evolutionAvailableMonths = monthRange(EVOLUTION_START_DATE.slice(0, 7), localCurrentMonth())
  const evolutionSelectedMonths = evolutionFrom <= evolutionTo
    ? monthRange(evolutionFrom, evolutionTo)
    : monthRange(evolutionTo, evolutionFrom)
  const evolutionSingleMonth = evolutionSelectedMonths.length === 1

  // Por cada mes del rango, los días que caen dentro del período registrado
  // (no antes del piso ni después de hoy) con su total
  const evolutionMonthDays = evolutionSelectedMonths.map(key => {
    const days: { day: number; amount: number }[] = []
    for (let day = 1; day <= daysInMonth(key); day++) {
      const date = `${key}-${String(day).padStart(2, '0')}`
      if (date < EVOLUTION_START_DATE || date > evolutionToday) continue
      days.push({ day, amount: evolutionByDate.get(date) ?? 0 })
    }
    return { key, days }
  })

  // Promedio por día del mes: para el día N, promedio entre los meses del rango que tienen ese día registrado
  const evolutionAveragePoints: LineChartSeries['points'] = []
  for (let day = 1; day <= 31; day++) {
    const values = evolutionMonthDays.flatMap(m => m.days.filter(d => d.day === day).map(d => d.amount))
    if (values.length > 0) evolutionAveragePoints.push({ x: day, y: values.reduce((a, b) => a + b, 0) / values.length })
  }

  const evolutionSeries: LineChartSeries[] = [
    ...(evolutionOnlyAverage && !evolutionSingleMonth ? [] : evolutionMonthDays.map(m => ({
      label: monthLabel(m.key),
      color: COLORS[evolutionAvailableMonths.indexOf(m.key) % COLORS.length] ?? COLORS[0],
      points: m.days.map(d => ({ x: d.day, y: d.amount })),
    }))),
    ...(evolutionSingleMonth ? [] : [{
      label: 'Promedio del rango',
      color: 'var(--color-text)',
      points: evolutionAveragePoints,
      dashed: true,
      strokeWidth: 3,
    }]),
  ]

  // Resumen por tramo: promedio diario de cada tramo vs. el promedio diario general del rango
  const evolutionAllDays = evolutionMonthDays.flatMap(m => m.days)
  const evolutionRangeTotal = evolutionAllDays.reduce((a, d) => a + d.amount, 0)
  const evolutionOverallDailyAvg = evolutionAllDays.length > 0 ? evolutionRangeTotal / evolutionAllDays.length : 0
  const evolutionSegments = MONTH_SEGMENTS.map(seg => {
    const days = evolutionAllDays.filter(d => d.day >= seg.from && d.day <= seg.to)
    const total = days.reduce((a, d) => a + d.amount, 0)
    const dailyAvg = days.length > 0 ? total / days.length : 0
    return {
      ...seg,
      dailyAvg,
      share: evolutionRangeTotal > 0 ? total / evolutionRangeTotal : 0,
      vsAverage: evolutionOverallDailyAvg > 0 && days.length > 0 ? dailyAvg / evolutionOverallDailyAvg - 1 : null,
    }
  })

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
                        <td>{formatDate(row.date)}</td>
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
                <div className="linechart-section-header">
                  <h3 className="linechart-section-title">
                    {evolutionSingleMonth
                      ? monthLabel(evolutionSelectedMonths[0])
                      : `${monthLabel(evolutionSelectedMonths[0])} a ${monthLabel(evolutionSelectedMonths[evolutionSelectedMonths.length - 1])}`}
                  </h3>
                  <div className="evolution-controls">
                    <label>
                      Desde:
                      <select className="input" value={evolutionFrom} onChange={e => setEvolutionFrom(e.target.value)}>
                        {evolutionAvailableMonths.map(key => (
                          <option key={key} value={key}>{monthLabel(key)}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Hasta:
                      <select className="input" value={evolutionTo} onChange={e => setEvolutionTo(e.target.value)}>
                        {evolutionAvailableMonths.map(key => (
                          <option key={key} value={key}>{monthLabel(key)}</option>
                        ))}
                      </select>
                    </label>
                    {!evolutionSingleMonth && (
                      <label className="evolution-checkbox">
                        <input
                          type="checkbox"
                          checked={evolutionOnlyAverage}
                          onChange={e => setEvolutionOnlyAverage(e.target.checked)}
                        />
                        Ver solo el promedio
                      </label>
                    )}
                  </div>
                </div>
                <LineChart
                  series={evolutionSeries}
                  maxDay={evolutionSingleMonth ? daysInMonth(evolutionSelectedMonths[0]) : 31}
                />
                {!evolutionSingleMonth && (
                  <p className="evolution-hint">
                    La línea punteada es el promedio de cada día del mes entre los meses elegidos
                    (los días sin ventas cuentan como $0).
                  </p>
                )}
              </div>

              <div className="linechart-section">
                <h3 className="linechart-section-title">Comportamiento según el momento del mes</h3>
                <div className="stats-grid">
                  {evolutionSegments.map(seg => (
                    <div key={seg.label} className="stat-card">
                      <div className="stat-label">{seg.label} (días {seg.from}–{seg.to === 31 ? 'fin' : seg.to})</div>
                      <div className="stat-value">{currency(seg.dailyAvg)}</div>
                      <div className="stat-sub">promedio por día · {(seg.share * 100).toFixed(0)}% del total</div>
                      {seg.vsAverage !== null && (
                        <div className={`stat-sub evolution-vs ${seg.vsAverage >= 0 ? 'evolution-vs--up' : 'evolution-vs--down'}`}>
                          {seg.vsAverage >= 0 ? '▲' : '▼'} {Math.abs(seg.vsAverage * 100).toFixed(0)}% vs. el promedio diario
                        </div>
                      )}
                    </div>
                  ))}
                </div>
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
              Desde:
              <input type="date" value={rankDateFrom} onChange={e => setRankDateFrom(e.target.value)} className="input" />
            </label>
            <label>
              Hasta:
              <input type="date" value={rankDateTo} onChange={e => setRankDateTo(e.target.value)} className="input" />
            </label>
            <button onClick={() => { void loadRanking() }} className="btn btn-secondary">
              🔍 Actualizar
            </button>
            <button
              onClick={() => { void exportRanking() }}
              className="btn btn-secondary"
              disabled={rankExporting}
              title="Exportar todos los productos vendidos en el período a Excel (.xlsx) o CSV"
            >
              {rankExporting ? '⏳ Exportando...' : '📊 Exportar a Excel'}
            </button>
          </div>

          {rankLoading && <p>Cargando ranking...</p>}
          {rankError && <p className="error">{rankError}</p>}
          {rankExportMsg && <p className="text-muted">{rankExportMsg}</p>}

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
                        <span>{vg.voucherType || 'Comprobante'} {vg.voucherNumber || '(sin número)'} {vg.voucherDate ? `— ${formatDate(vg.voucherDate)}` : ''}</span>
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
                onSaved={() => { void loadPurchases(true) }}
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
            perfecto&quot;) — para tener una idea de qué rango de precio y qué categoría de
            regalo busca la clientela potencial. Requiere tener configurado &quot;Sync Web&quot; y haber subido
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
                <>
                  <div className="pie-wrapper">
                    <h3 className="pie-title">💲 Precio</h3>
                    <BarList items={searchReport.priceBuckets} color="#4f8ef7" />
                  </div>
                  {searchReport.giftBuckets && (
                    <div className="pie-wrapper">
                      <h3 className="pie-title">🎁 Categoría de regalo</h3>
                      <BarList items={searchReport.giftBuckets} color="#8b5cf6" />
                    </div>
                  )}
                </>
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
