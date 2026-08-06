import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sales, printing, systemParams, mail } from '../../lib/ipc'
import { localToday } from '../../lib/date'
import type { Sale } from '../../types/ipc'
import { useConfirm } from '../../hooks/useConfirm'

const STATUS_LABELS: Record<string, string> = {
  AUTHORIZED: '✅ Autorizada',
  PENDING_CAE: '⏳ Pendiente CAE',
  REJECTED: '❌ Rechazada',
  INTERNAL_RECEIPT: '📄 Comprobante Interno',
  WEB_ORDER: '🌐 Pedido Web',
  PROCESSED: '🌐 Pedido Web Procesado',
  CANCELLED: '🚫 Cancelada',
}

const STATUS_CLASSES: Record<string, string> = {
  AUTHORIZED: 'badge badge--success',
  PENDING_CAE: 'badge badge--warning',
  REJECTED: 'badge badge--danger',
  INTERNAL_RECEIPT: 'badge badge--info',
  WEB_ORDER: 'badge badge--info',
  PROCESSED: 'badge badge--info',
  CANCELLED: 'badge badge--danger',
}

export default function SalesPage() {
  const [saleList, setSaleList] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState(localToday)
  const [dateTo, setDateTo] = useState(localToday)
  const [printingId, setPrintingId] = useState<number | null>(null)
  const [changePrintingId, setChangePrintingId] = useState<number | null>(null)
  const [mailingId, setMailingId] = useState<number | null>(null)
  const [printError, setPrintError] = useState<string | null>(null)
  const [cancelingId, setCancelingId] = useState<number | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const { confirm, dialog: confirmDialog } = useConfirm()

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadSales() }, [])

  const currency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  async function handlePrint(sale: Sale) {
    setPrintingId(sale.id)
    setPrintError(null)
    try {
      const res = sale.status === 'AUTHORIZED'
        ? await printing.printInvoiceSystem(sale.id)
        : await printing.printDeliveryNoteSystem(sale.id)
      if (!res.success) setPrintError(res.error ?? 'Error al imprimir')
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Error al imprimir')
    } finally {
      setPrintingId(null)
    }
  }

  async function handleSendMail(sale: Sale) {
    if (!sale.customerEmail) return
    setMailingId(sale.id)
    setPrintError(null)
    try {
      const res = await mail.sendInvoice(sale.id, sale.customerEmail)
      if (!res.success) setPrintError(res.error ?? 'Error al enviar email')
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Error al enviar email')
    } finally {
      setMailingId(null)
    }
  }

  async function handleCancelSale(sale: Sale) {
    const confirmed = await confirm(
      `¿Cancelar la venta #${sale.id}? Se repondrá el stock vendido y se revertirá el ingreso financiero asociado.`,
      { danger: true }
    )
    if (!confirmed) return
    setCancelingId(sale.id)
    setCancelError(null)
    try {
      await sales.cancelSale(sale.id)
      await loadSales()
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Error al cancelar la venta')
    } finally {
      setCancelingId(null)
    }
  }

  async function handlePrintChangeTicket(sale: Sale) {
    setChangePrintingId(sale.id)
    setPrintError(null)
    try {
      const res = await printing.printChangeTicket(sale.id)
      if (!res.success) setPrintError(res.error ?? 'Error al imprimir ticket de cambio')
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Error al imprimir ticket de cambio')
    } finally {
      setChangePrintingId(null)
    }
  }

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
        <button onClick={() => { void loadSales() }} className="btn btn-secondary">Buscar</button>
      </div>

      {loading && <p>Cargando...</p>}
      {error && <p className="error">{error}</p>}
      {printError && <p className="error">{printError}</p>}
      {cancelError && <p className="error">{cancelError}</p>}

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
                  <th>Acciones</th>
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
                    <td style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => void handlePrint(sale)}
                        disabled={printingId === sale.id}
                        title={sale.status === 'AUTHORIZED' ? 'Imprimir Factura' : 'Imprimir Remito'}
                      >
                        {printingId === sale.id ? '⏳' : '🖨️'}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => void handlePrintChangeTicket(sale)}
                        disabled={changePrintingId === sale.id}
                        title="Imprimir Ticket de Cambio"
                      >
                        {changePrintingId === sale.id ? '⏳' : '🔄'}
                      </button>
                      {sale.customerEmail && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => void handleSendMail(sale)}
                          disabled={mailingId === sale.id}
                          title={`Enviar por email a ${sale.customerEmail}`}
                        >
                          {mailingId === sale.id ? '⏳' : '📧'}
                        </button>
                      )}
                      {sale.status !== 'AUTHORIZED' && sale.status !== 'CANCELLED' && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => void handleCancelSale(sale)}
                          disabled={cancelingId === sale.id}
                          title="Cancelar venta"
                        >
                          {cancelingId === sale.id ? '⏳' : '🚫'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {saleList.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty-row">No hay ventas para el período seleccionado</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {confirmDialog}
    </div>
  )
}
