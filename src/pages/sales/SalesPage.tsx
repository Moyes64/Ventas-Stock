import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sales } from '../../lib/ipc'
import type { Sale } from '../../types/ipc'

const STATUS_LABELS: Record<string, string> = {
  AUTHORIZED: '✅ Autorizada',
  PENDING_CAE: '⏳ Pendiente CAE',
  REJECTED: '❌ Rechazada',
  INTERNAL_RECEIPT: '📄 Comprobante Interno',
}

const STATUS_CLASSES: Record<string, string> = {
  AUTHORIZED: 'badge badge--success',
  PENDING_CAE: 'badge badge--warning',
  REJECTED: 'badge badge--danger',
  INTERNAL_RECEIPT: 'badge badge--info',
}

export default function SalesPage() {
  const [saleList, setSaleList] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 10))
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10))

  async function loadSales() {
    setLoading(true)
    setError(null)
    try {
      const data = await sales.list({ dateFrom, dateTo, limit: 100 })
      setSaleList(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar ventas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSales() }, [])

  const currency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Ventas</h1>
        <Link to="/sales/new" className="btn btn-primary">+ Nueva Venta</Link>
      </div>

      <div className="filter-bar">
        <label>
          Desde:
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="input"
          />
        </label>
        <label>
          Hasta:
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="input"
          />
        </label>
        <button onClick={loadSales} className="btn btn-secondary">Buscar</button>
      </div>

      {loading && <p>Cargando...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && !error && (
        <>
          <p className="results-count">{saleList.length} ventas encontradas</p>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>CAE</th>
                </tr>
              </thead>
              <tbody>
                {saleList.map(sale => (
                  <tr key={sale.id}>
                    <td>{sale.id}</td>
                    <td>{sale.saleDate}</td>
                    <td>{sale.customerName ?? 'Consumidor Final'}</td>
                    <td>{currency(sale.total)}</td>
                    <td>
                      <span className={STATUS_CLASSES[sale.status] ?? 'badge'}>
                        {STATUS_LABELS[sale.status] ?? sale.status}
                      </span>
                    </td>
                    <td>
                      {sale.cae ? (
                        <span className="cae-number" title={`Vto: ${sale.caeVto}`}>
                          {sale.cae}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {saleList.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-row">No hay ventas para el período seleccionado</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
