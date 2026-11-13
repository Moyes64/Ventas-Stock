import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sales, printing, systemParams, mail, reporting } from '../../lib/ipc'
import { localToday, formatDate, formatDateTime } from '../../lib/date'
import type { Sale, ExchangeDifference } from '../../types/ipc'
import { useConfirm } from '../../hooks/useConfirm'
import { FISERV_LABELS } from '../../lib/fiserv'

const STATUS_LABELS: Record<string, string> = {
  AUTHORIZED: '✅ Autorizada',
  PENDING_CAE: '⏳ Pendiente CAE',
  REJECTED: '❌ Rechazada',
  INTERNAL_RECEIPT: '📄 Comprobante Interno',
  WEB_ORDER: '🌐 Pedido Web',
  PROCESSED: '🌐 Pedido Web Procesado',
  CANCELLED: '🚫 Cancelada',
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  contado_efectivo: '💵 Efectivo',
  transferencia: '🏦 Transferencia',
  qr: '📱 QR',
  debito: '💳 Débito',
  credito: '💳 Crédito',
  mercadopago: '🛒 Mercado Pago',
  mp_ariel: '🛍️ Mercado Libre (MP Ariel)',
  ...FISERV_LABELS,
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

/** '00001-00000291' — sin punto de venta guardado se asume el 1. */
function invoiceNumberLabel(puntoVenta: number | null, number: number): string {
  return `${String(puntoVenta || 1).padStart(5, '0')}-${String(number).padStart(8, '0')}`
}

export default function SalesPage() {
  const [saleList, setSaleList] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState(localToday)
  const [dateTo, setDateTo] = useState(localToday)
  // Totalizador del período: se calcula en la base (mismo criterio que el
  // reporte "Ventas por día") para no quedar limitado a las 100 filas listadas.
  const [periodTotal, setPeriodTotal] = useState<{ count: number; amount: number } | null>(null)
  const [exchangeDiffs, setExchangeDiffs] = useState<ExchangeDifference[]>([])
  const [printingId, setPrintingId] = useState<number | null>(null)
  const [changePrintingId, setChangePrintingId] = useState<number | null>(null)
  const [mailingId, setMailingId] = useState<number | null>(null)
  const [printError, setPrintError] = useState<string | null>(null)
  const [cancelingId, setCancelingId] = useState<number | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  // Nota de crédito: venta cuya factura se está por anular (abre el modal)
  const [creditNoteSale, setCreditNoteSale] = useState<Sale | null>(null)
  const [creditNoteReason, setCreditNoteReason] = useState('')
  const [creditNoteSaving, setCreditNoteSaving] = useState(false)
  const [creditNoteError, setCreditNoteError] = useState<string | null>(null)
  const [creditNoteDone, setCreditNoteDone] = useState<Sale | null>(null)
  const { confirm, dialog: confirmDialog } = useConfirm()

  async function loadSales() {
    setLoading(true)
    setError(null)
    try {
      const [data, summary, diffs] = await Promise.all([
        sales.list({ dateFrom, dateTo, limit: 100 }),
        reporting.salesByDateRange({ dateFrom, dateTo }),
        reporting.exchangeDifferences({ dateFrom, dateTo }),
      ])
      setSaleList(data)
      setExchangeDiffs(diffs)
      setPeriodTotal({
        count: summary.reduce((acc, d) => acc + d.salesCount, 0),
        amount: summary.reduce((acc, d) => acc + d.totalAmount, 0),
      })
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
      // false: es reimpresión desde el listado de ventas, no el cierre de una
      // venta — no forzar un ticket de cambio térmico automático.
      const res = sale.status === 'AUTHORIZED'
        ? await printing.printInvoiceSystem(sale.id, false)
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

  function openCreditNote(sale: Sale) {
    setCreditNoteSale(sale)
    setCreditNoteReason('')
    setCreditNoteError(null)
    setCreditNoteDone(null)
  }

  async function handleIssueCreditNote() {
    if (!creditNoteSale) return
    setCreditNoteSaving(true)
    setCreditNoteError(null)
    try {
      const res = await sales.issueCreditNote(creditNoteSale.id, creditNoteReason)
      if (!res.success || !res.sale) {
        setCreditNoteError(res.error ?? 'No se pudo emitir la nota de crédito')
        return
      }
      setCreditNoteDone(res.sale)
      await loadSales()
    } catch (err) {
      setCreditNoteError(err instanceof Error ? err.message : 'No se pudo emitir la nota de crédito')
    } finally {
      setCreditNoteSaving(false)
    }
  }

  async function handlePrintCreditNote(sale: Sale) {
    setPrintingId(sale.id)
    setPrintError(null)
    try {
      const res = await printing.printCreditNoteSystem(sale.id)
      if (!res.success) setPrintError(res.error ?? 'Error al imprimir la nota de crédito')
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Error al imprimir la nota de crédito')
    } finally {
      setPrintingId(null)
    }
  }

  async function handleExportCreditNotePdf(sale: Sale) {
    setPrintError(null)
    try {
      const res = await printing.exportCreditNotePdf(sale.id)
      if (!res.success && !res.canceled) setPrintError(res.error ?? 'Error al exportar la nota de crédito')
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Error al exportar la nota de crédito')
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
          {periodTotal && (
            <div className="stats-grid" style={{ gridTemplateColumns: 'minmax(260px, 380px)' }}>
              <div className="stat-card stat-card--total">
                <div className="stat-value">{currency(periodTotal.amount)}</div>
                <div className="stat-label">
                  Total vendido {dateFrom === dateTo ? `el ${formatDate(dateFrom)}` : `del ${formatDate(dateFrom)} al ${formatDate(dateTo)}`}
                </div>
                <div className="stat-sub stat-sub--light">
                  {periodTotal.count} {periodTotal.count === 1 ? 'venta' : 'ventas'} (sin canceladas, rechazadas ni pedidos web pendientes)
                </div>
                {exchangeDiffs.length > 0 && (
                  <div className="stat-sub stat-sub--light" title="Cobrado por diferencias en cambios/devoluciones. No es una venta ni está facturado.">
                    + {currency(exchangeDiffs.reduce((acc, d) => acc + d.amount, 0))} cobrados por diferencias de cambios (sin facturar)
                  </div>
                )}
              </div>
            </div>
          )}
          <p className="results-count">
            {saleList.length} ventas encontradas
            {saleList.length === 100 && ' (se muestran las 100 más recientes; el total incluye todo el período)'}
          </p>
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
                  <th>Usuario</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {saleList.map(sale => (
                  <tr key={sale.id}>
                    <td>{sale.id}</td>
                    <td>{formatDate(sale.saleDate)}</td>
                    <td>{sale.customerName ?? 'Consumidor Final'}</td>
                    <td>{currency(sale.total)}</td>
                    <td>
                      <span className={STATUS_CLASSES[sale.status] ?? 'badge'}>
                        {STATUS_LABELS[sale.status] ?? sale.status}
                      </span>
                      {sale.invoiceNumber && sale.cae && (
                        <div className="text-muted" style={{ fontSize: '0.8em' }}>
                          Factura {invoiceNumberLabel(sale.puntoVenta, sale.invoiceNumber)}
                        </div>
                      )}
                      {sale.creditNote && (
                        <div className="text-muted" style={{ fontSize: '0.8em' }} title={`CAE NC: ${sale.creditNote.cae}`}>
                          Anulada con NC {invoiceNumberLabel(sale.creditNote.puntoVenta, sale.creditNote.number)} ({formatDate(sale.creditNote.issueDate)})
                        </div>
                      )}
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
                    <td>{sale.userName ?? <span className="text-muted">—</span>}</td>
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
                      {sale.creditNote && (
                        <>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => void handlePrintCreditNote(sale)}
                            disabled={printingId === sale.id}
                            title="Imprimir Nota de Crédito"
                          >
                            🖨️ NC
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => void handleExportCreditNotePdf(sale)}
                            title="Guardar Nota de Crédito en PDF"
                          >
                            📄 NC
                          </button>
                        </>
                      )}
                      {sale.cae && sale.invoiceNumber && !sale.isBlackSale && !sale.creditNote &&
                        (sale.status === 'AUTHORIZED' || sale.status === 'CANCELLED') && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => openCreditNote(sale)}
                          title="Anular la factura con una Nota de Crédito (ARCA)"
                        >
                          🧾 Anular
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
                    <td colSpan={8} className="empty-row">No hay ventas para el período seleccionado</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {exchangeDiffs.length > 0 && (
            <>
              <h3 style={{ marginTop: '1.5rem' }}>Diferencias cobradas por cambios</h3>
              <p className="text-muted">
                Cuando el cliente se lleva un producto más caro que el que devuelve. No son ventas ni están facturadas;
                el ingreso figura en Finanzas.
              </p>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Cambio</th>
                      <th>Medio de pago</th>
                      <th>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exchangeDiffs.map(d => (
                      <tr key={`${d.source}-${d.exchangeId}`}>
                        <td>{formatDateTime(d.createdAt)}</td>
                        <td>
                          {d.source === 'sin_ticket'
                            ? `Sin ticket #${d.exchangeId}`
                            : `Con ticket #${d.exchangeId} (venta #${d.saleId})`}
                        </td>
                        <td>{PAYMENT_METHOD_LABELS[d.paymentMethod] ?? d.paymentMethod}</td>
                        <td>{currency(d.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {creditNoteSale && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Anular factura con Nota de Crédito</h2>
              <button className="btn btn-ghost" onClick={() => setCreditNoteSale(null)} disabled={creditNoteSaving}>✕</button>
            </div>
            {creditNoteDone?.creditNote ? (
              <div className="form">
                <p>
                  ✅ ARCA autorizó la <strong>Nota de Crédito {invoiceNumberLabel(creditNoteDone.creditNote.puntoVenta, creditNoteDone.creditNote.number)}</strong>
                  {' '}(CAE {creditNoteDone.creditNote.cae}).
                </p>
                <p className="text-muted">La venta #{creditNoteDone.id} quedó cancelada.</p>
                <div className="form-actions">
                  <button className="btn btn-secondary" onClick={() => void handleExportCreditNotePdf(creditNoteDone)}>📄 Guardar PDF</button>
                  <button className="btn btn-secondary" onClick={() => void handlePrintCreditNote(creditNoteDone)}>🖨️ Imprimir</button>
                  <button className="btn btn-primary" onClick={() => setCreditNoteSale(null)}>Cerrar</button>
                </div>
              </div>
            ) : (
              <div className="form">
                <p>
                  Se va a emitir en ARCA una <strong>Nota de Crédito por {currency(creditNoteSale.total)}</strong> que anula la
                  {' '}<strong>Factura {invoiceNumberLabel(creditNoteSale.puntoVenta, creditNoteSale.invoiceNumber ?? 0)}</strong>
                  {' '}del {formatDate(creditNoteSale.saleDate)} (venta #{creditNoteSale.id}).
                </p>
                {creditNoteSale.status === 'AUTHORIZED' ? (
                  <p>Además la venta queda <strong>cancelada</strong>: vuelve el stock vendido y se revierte el ingreso en Finanzas.</p>
                ) : (
                  <p>La venta ya estaba cancelada en el sistema: solo se emite la nota de crédito.</p>
                )}
                <p className="text-muted">Una nota de crédito autorizada no se puede deshacer.</p>
                <div className="form-row">
                  <label className="label">Motivo (opcional, queda registrado)</label>
                  <input
                    type="text"
                    className="input"
                    value={creditNoteReason}
                    onChange={e => setCreditNoteReason(e.target.value)}
                    placeholder="Ej: tarjeta rechazada, se facturó de nuevo"
                    disabled={creditNoteSaving}
                  />
                </div>
                {creditNoteError && <p className="error">{creditNoteError}</p>}
                <div className="form-actions">
                  <button className="btn btn-ghost" onClick={() => setCreditNoteSale(null)} disabled={creditNoteSaving}>Volver</button>
                  <button className="btn btn-danger" onClick={() => void handleIssueCreditNote()} disabled={creditNoteSaving}>
                    {creditNoteSaving ? 'Pidiendo CAE a ARCA...' : 'Emitir Nota de Crédito'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {confirmDialog}
    </div>
  )
}
