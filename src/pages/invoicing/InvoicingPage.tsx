import { useEffect, useState } from 'react'
import { invoicing as invoicingApi, printing } from '../../lib/ipc'
import type { Sale } from '../../types/ipc'
import { useHiddenOptions } from '../../context/HiddenOptionsContext'

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
  const [printingId, setPrintingId] = useState<number | null>(null)
  const [printError, setPrintError] = useState<string | null>(null)
  const [blackFilter, setBlackFilter] = useState<'all' | 'normal' | 'black'>('all')
  const { isHiddenOptionsVisible } = useHiddenOptions()

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

  async function handlePrint(inv: Sale) {
    setPrintingId(inv.id)
    setPrintError(null)
    try {
      const res = inv.status === 'AUTHORIZED'
        ? await printing.printInvoiceSystem(inv.id)
        : await printing.printDeliveryNoteSystem(inv.id)
      if (!res.success) setPrintError(res.error ?? 'Error al imprimir')
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Error al imprimir')
    } finally {
      setPrintingId(null)
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
        {isHiddenOptionsVisible && (
          <label>
            Tipo N:
            <select value={blackFilter} onChange={e => setBlackFilter(e.target.value as 'all' | 'normal' | 'black')} className="select">
              <option value="all">Todos</option>
              <option value="normal">Solo normales</option>
              <option value="black">Solo N (sin IVA)</option>
            </select>
          </label>
        )}
        <button onClick={loadInvoices} className="btn btn-secondary">Buscar</button>
      </div>

      {loading && <p>Cargando...</p>}
      {error && <p className="error">{error}</p>}
      {printError && <p className="error">{printError}</p>}

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
              {invoices
                .filter(inv => {
                  if (blackFilter === 'normal') return !inv.isBlackSale
                  if (blackFilter === 'black') return inv.isBlackSale
                  return true
                })
                .map(inv => (
                <tr key={inv.id} className={inv.isBlackSale ? 'row--black-sale' : ''}>
                  <td>
                    {inv.id}
                    {inv.isBlackSale && <span className="badge badge--black" title="Venta N (sin IVA)">N</span>}
                  </td>
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
                    {!inv.isBlackSale && (inv.status === 'PENDING_CAE' || inv.status === 'INTERNAL_RECEIPT') && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleRetryCAE(inv.id)}
                        disabled={retrying === inv.id}
                      >
                        {retrying === inv.id ? '⏳' : '↺ CAE'}
                      </button>
                    )}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => void handlePrint(inv)}
                      disabled={printingId === inv.id}
                      title={inv.status === 'AUTHORIZED' ? 'Imprimir Factura (Sistema)' : 'Imprimir Remito (Sistema)'}
                    >
                      {printingId === inv.id ? '⏳' : '🖨️'}
                    </button>
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
