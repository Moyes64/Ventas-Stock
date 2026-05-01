import { useEffect, useState } from 'react'
import { reporting } from '../../lib/ipc'
import type { DailySummaryReport } from '../../types/ipc'

export default function ReportingPage() {
  const [summary, setSummary] = useState<DailySummaryReport[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10))
  const [activeReport, setActiveReport] = useState<'daily' | 'products' | 'lowstock'>('daily')

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

  useEffect(() => { loadReport() }, [])

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
            <button onClick={loadReport} className="btn btn-secondary">Generar</button>
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

      {activeReport === 'products' && <p className="page-subtitle">Próximamente: Reporte de productos más vendidos</p>}
      {activeReport === 'lowstock' && <p className="page-subtitle">Próximamente: Reporte de stock bajo</p>}
    </div>
  )
}
