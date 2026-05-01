import { useEffect, useState } from 'react'
import { invoicing as invoicingApi } from '../../lib/ipc'
import type { Sale } from '../../types/ipc'

const STATUS_LABELS: Record<string, string> = {
  AUTHORIZED: '✅ Autorizada',
  PENDING_CAE: '⏳ Pendiente CAE',
  REJECTED: '❌ Rechazada',
  INTERNAL_RECEIPT: '📄 Comprobante Interno',
}

export default function InvoicingPage() {
  const [invoices, setInvoices] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date()
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10))
  const [statusFilter, setStatusFilter] = useState('')
  const [retrying, setRetrying] = useState<number | null>(null)

  async function loadInvoices() {
    setLoading(true)
    setError(null)
    try {
      const data = await invoicingApi.list({
        dateFrom,
        dateTo,
        status: statusFilter || undefined,
      })
      setInvoices(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadInvoices() }, [])

  async function handleRetryCAE(saleId: number) {
    setRetrying(saleId)
    try {
      const result = await invoicingApi.retryCAE(saleId)
      if (result.success) {
        await loadInvoices()
      } else {
        setError(`Error AFIP: ${result.error}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reintentar CAE')
    } finally {
      setRetrying(null)
    }
  }

  const currency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Facturación Electrónica</h1>
      </div>

      <div className="filter-bar">
        <label>
          Desde:
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input" />
        </label>
        <label>
          Hasta:
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input" />
        </label>
        <label>
          Estado:
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="select">
            <option value="">Todos</option>
            <option value="AUTHORIZED">Autorizadas</option>
            <option value="PENDING_CAE">Pendientes CAE</option>
            <option value="REJECTED">Rechazadas</option>
            <option value="INTERNAL_RECEIPT">Comprobantes Internos</option>
          </select>
        </label>
        <button onClick={loadInvoices} className="btn btn-secondary">Buscar</button>
      </div>

      {loading && <p>Cargando...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Nro. Comprobante</th>
                <th>Total</th>
                <th>Estado</th>
                <th>CAE</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id}>
                  <td>{inv.id}</td>
                  <td>{inv.saleDate}</td>
                  <td>{inv.customerName ?? 'Consumidor Final'}</td>
                  <td>{inv.invoiceType ?? '—'}</td>
                  <td>
                    {inv.puntoVenta && inv.invoiceNumber
                      ? `${String(inv.puntoVenta).padStart(5, '0')}-${String(inv.invoiceNumber).padStart(8, '0')}`
                      : '—'}
                  </td>
                  <td>{currency(inv.total)}</td>
                  <td>
                    <span className="badge">
                      {STATUS_LABELS[inv.status] ?? inv.status}
                    </span>
                  </td>
                  <td>
                    {inv.cae ? (
                      <span title={`Vto: ${inv.caeVto}`}>{inv.cae}</span>
                    ) : (
                      <span className="text-muted">{inv.afipError ? `❌ ${inv.afipError.slice(0, 40)}…` : '—'}</span>
                    )}
                  </td>
                  <td>
                    {(inv.status === 'PENDING_CAE' || inv.status === 'INTERNAL_RECEIPT') && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleRetryCAE(inv.id)}
                        disabled={retrying === inv.id}
                      >
                        {retrying === inv.id ? '⏳' : '↺ CAE'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr><td colSpan={9} className="empty-row">Sin comprobantes</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
