import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { reporting, catalog } from '../lib/ipc'
import type { DailySummaryReport } from '../types/ipc'
import { useHiddenOptions } from '../context/HiddenOptionsContext'

export default function Dashboard() {
  const [todaySummary, setTodaySummary] = useState<DailySummaryReport | null>(null)
  const [lowStockCount, setLowStockCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { isHiddenOptionsVisible } = useHiddenOptions()

  useEffect(() => {
    async function loadData() {
      try {
        const today = new Date().toISOString().slice(0, 10)
        const [summaries, lowStockItems] = await Promise.all([
          reporting.dailySummary({ dateFrom: today, dateTo: today }),
          catalog.listLowStock(),
        ])
        setTodaySummary(summaries[0] ?? null)
        setLowStockCount(lowStockItems.length)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar datos')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  if (loading) return <div className="page"><p>Cargando...</p></div>
  if (error) return <div className="page"><p className="error">{error}</p></div>

  const currency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  return (
    <div className="page">
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">{new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>

      <div className="stats-dashboard-grid">
        {/* Fila 1: Ventas hoy, Total hoy, Productos bajo stock */}
        <div className="stat-card">
          <div className="stat-value">{todaySummary?.whiteSalesCount ?? 0}</div>
          <div className="stat-label">Ventas hoy</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{currency(todaySummary?.whiteSalesTotal ?? 0)}</div>
          <div className="stat-label">Total hoy</div>
        </div>
        <div className={`stat-card ${lowStockCount > 0 ? 'stat-card--warning' : ''}`}>
          <div className="stat-value">{lowStockCount}</div>
          <div className="stat-label">Productos bajo stock</div>
        </div>

        {isHiddenOptionsVisible && (
          <>
            {/* Fila 2: Ventas N hoy, Total N hoy (col 3 vacía) */}
            <div className="stat-card stat-card--black">
              <div className="stat-value">{todaySummary?.blackSalesCount ?? 0}</div>
              <div className="stat-label">Ventas N hoy</div>
            </div>
            <div className="stat-card stat-card--black">
              <div className="stat-value">{currency(todaySummary?.blackSalesTotal ?? 0)}</div>
              <div className="stat-label">Total N hoy</div>
            </div>
            <div className="stats-dashboard-grid__spacer" aria-hidden="true" />

            {/* Fila 3: Total ventas día, Total general día */}
            <div className="stat-card stat-card--total">
              <div className="stat-value">
                {(todaySummary?.whiteSalesCount ?? 0) + (todaySummary?.blackSalesCount ?? 0)}
              </div>
              <div className="stat-label">Total ventas día</div>
            </div>
            <div className="stat-card stat-card--total">
              <div className="stat-value">
                {currency((todaySummary?.whiteSalesTotal ?? 0) + (todaySummary?.blackSalesTotal ?? 0))}
              </div>
              <div className="stat-label">Total general día</div>
            </div>
          </>
        )}
      </div>

      <div className="quick-actions">
        <h2>Acciones rápidas</h2>
        <div className="action-buttons">
          <Link to="/sales/new" className="btn btn-primary btn-lg">
            🛒 Nueva Venta
          </Link>
          <Link to="/stock" className="btn btn-secondary">
            📊 Ver Stock
          </Link>
          <Link to="/reporting" className="btn btn-secondary">
            📈 Ver Reportes
          </Link>
        </div>
      </div>
    </div>
  )
}
