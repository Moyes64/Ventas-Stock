import { useEffect, useRef, useState } from 'react'
import { invoicing as invoicingApi, printing, sales as salesApi } from '../../lib/ipc'
import { localToday } from '../../lib/date'
import type { PaymentMethod, Sale } from '../../types/ipc'
import { useHiddenOptions } from '../../context/HiddenOptionsContext'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  contado_efectivo: '💵 Contado Efectivo',
  transferencia: '🏦 Transferencia',
  qr: '📱 QR',
  debito: '💳 Débito',
  credito: '💳 Crédito',
  credito_cliente: '🎁 Crédito del cliente',
  mercadopago: '🛒 Mercado Pago (Web)',
}

const EDITABLE_PAYMENT_METHODS: PaymentMethod[] = [
  'contado_efectivo', 'transferencia', 'qr', 'debito', 'credito', 'mercadopago',
]

const STATUS_LABELS: Record<string, string> = {
  AUTHORIZED: '✅ Autorizada',
  PENDING_CAE: '⏳ Pendiente CAE',
  REJECTED: '❌ Rechazada',
  INTERNAL_RECEIPT: '📄 Comprobante Interno',
}

const STATUS_BADGE: Record<string, string> = {
  AUTHORIZED: 'badge badge--success',
  PENDING_CAE: 'badge badge--warning',
  REJECTED: 'badge badge--danger',
  INTERNAL_RECEIPT: 'badge badge--info',
}

export default function InvoicingPage() {
  const today = localToday()
  const [invoices, setInvoices] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filtros
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  const [statusFilter, setStatusFilter] = useState('')
  const [customerNameFilter, setCustomerNameFilter] = useState('')
  const [customerDocFilter, setCustomerDocFilter] = useState('')
  const [invoiceNumberFilter, setInvoiceNumberFilter] = useState('')
  const [blackFilter, setBlackFilter] = useState<'all' | 'normal' | 'black'>('all')
  const nameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Acciones
  const [retrying, setRetrying] = useState<number | null>(null)
  const [printingId, setPrintingId] = useState<number | null>(null)
  const [changePrintingId, setChangePrintingId] = useState<number | null>(null)
  const [batchPrinting, setBatchPrinting] = useState(false)
  const [printError, setPrintError] = useState<string | null>(null)
  const [batchMsg, setBatchMsg] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null)
  const [savingPaymentId, setSavingPaymentId] = useState<number | null>(null)

  const { isHiddenOptionsVisible } = useHiddenOptions()

  const currency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  async function loadInvoices(overrides?: Partial<{
    dateFrom: string; dateTo: string; status: string
    customerName: string; customerDoc: string; invoiceNumber: string
  }>) {
    setLoading(true)
    setError(null)
    setSelected(new Set())
    try {
      const invNum = parseInt(overrides?.invoiceNumber ?? invoiceNumberFilter, 10)
      const data = await printing.listForReprint({
        dateFrom: overrides?.dateFrom ?? dateFrom,
        dateTo: overrides?.dateTo ?? dateTo,
        status: (overrides?.status ?? statusFilter) || undefined,
        customerName: (overrides?.customerName ?? customerNameFilter) || undefined,
        customerDoc: (overrides?.customerDoc ?? customerDocFilter) || undefined,
        invoiceNumber: !isNaN(invNum) && invNum > 0 ? invNum : undefined,
      })
      setInvoices(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadInvoices() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Búsqueda por nombre con debounce 300ms
  function handleNameChange(val: string) {
    setCustomerNameFilter(val)
    if (nameDebounce.current) clearTimeout(nameDebounce.current)
    nameDebounce.current = setTimeout(() => {
      void loadInvoices({ customerName: val })
    }, 300)
  }

  async function handleRetryCAE(saleId: number) {
    setRetrying(saleId)
    try {
      const result = await invoicingApi.retryCAE(saleId)
      if (result.success) { await loadInvoices() }
      else setError(`Error AFIP: ${result.error}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reintentar CAE')
    } finally { setRetrying(null) }
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
    } finally { setPrintingId(null) }
  }

  async function handlePrintChangeTicket(inv: Sale) {
    setChangePrintingId(inv.id)
    setPrintError(null)
    try {
      const res = await printing.printChangeTicket(inv.id)
      if (!res.success) setPrintError(res.error ?? 'Error al imprimir ticket de cambio')
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Error al imprimir ticket de cambio')
    } finally { setChangePrintingId(null) }
  }

  async function handleUpdatePaymentMethod(saleId: number, paymentMethod: PaymentMethod) {
    setSavingPaymentId(saleId)
    setError(null)
    try {
      const updated = await salesApi.updatePaymentMethod(saleId, paymentMethod)
      setInvoices(prev => prev.map(inv => (inv.id === saleId ? { ...inv, paymentMethod: updated.paymentMethod } : inv)))
      setEditingPaymentId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar el modo de pago')
    } finally {
      setSavingPaymentId(null)
    }
  }

  async function handleBatchPrint() {
    const ids = selected.size > 0 ? Array.from(selected) : invoices.map(i => i.id)
    if (ids.length === 0) return
    setBatchPrinting(true)
    setBatchMsg(null)
    setPrintError(null)
    try {
      const res = await printing.printBatch(ids)
      setBatchMsg(`✅ Impresas ${res.printed} de ${ids.length} facturas.` +
        (res.errors.length > 0 ? ` Errores: ${res.errors.join('; ')}` : ''))
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Error al imprimir lote')
    } finally { setBatchPrinting(false) }
  }

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selected.size === invoices.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(invoices.map(i => i.id)))
    }
  }

  const filtered = invoices.filter(inv => {
    if (blackFilter === 'normal') return !inv.isBlackSale
    if (blackFilter === 'black') return inv.isBlackSale
    return true
  })

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">🧾 Facturación / Reimpresión</h1>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="filter-bar filter-bar--wrap">
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
            <option value="INTERNAL_RECEIPT">Comprobantes Internos</option>
          </select>
        </label>
        <label>
          Nombre cliente:
          <input
            type="text"
            value={customerNameFilter}
            onChange={e => handleNameChange(e.target.value)}
            className="input"
            placeholder="Buscar por nombre..."
          />
        </label>
        <label>
          Documento:
          <input
            type="text"
            value={customerDocFilter}
            onChange={e => setCustomerDocFilter(e.target.value)}
            className="input"
            placeholder="CUIT / DNI"
          />
        </label>
        <label>
          Nro. Factura:
          <input
            type="number"
            value={invoiceNumberFilter}
            onChange={e => setInvoiceNumberFilter(e.target.value)}
            className="input"
            placeholder="Ej: 1"
            style={{ width: '90px' }}
          />
        </label>
        {isHiddenOptionsVisible && (
          <label>
            Tipo N:
            <select value={blackFilter} onChange={e => setBlackFilter(e.target.value as 'all' | 'normal' | 'black')} className="select">
              <option value="all">Todos</option>
              <option value="normal">Solo normales</option>
              <option value="black">Solo N</option>
            </select>
          </label>
        )}
        <button onClick={() => { void loadInvoices() }} className="btn btn-secondary">🔍 Buscar</button>
      </div>

      {/* ── Acciones lote ───────────────────────────────────────────────── */}
      <div className="batch-actions">
        <span className="batch-count">
          {filtered.length} comprobante{filtered.length !== 1 ? 's' : ''}
          {selected.size > 0 && ` · ${selected.size} seleccionado${selected.size !== 1 ? 's' : ''}`}
        </span>
        <button
          className="btn btn-primary"
          onClick={() => { void handleBatchPrint() }}
          disabled={batchPrinting || filtered.length === 0}
          title={selected.size > 0 ? 'Imprimir seleccionados' : 'Imprimir todos los del listado'}
        >
          {batchPrinting
            ? '⏳ Imprimiendo...'
            : selected.size > 0
              ? `🖨️ Imprimir seleccionados (${selected.size})`
              : '🖨️ Imprimir todos'}
        </button>
      </div>

      {loading && <p>Cargando...</p>}
      {error && <p className="error">{error}</p>}
      {printError && <p className="error">{printError}</p>}
      {batchMsg && <p className="success">{batchMsg}</p>}

      {!loading && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll}
                    title="Seleccionar todos"
                  />
                </th>
                <th>#</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Nro. Comprobante</th>
                <th>Total</th>
                <th>Modo de pago</th>
                <th>Estado</th>
                <th>CAE</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => (
                <tr key={inv.id} className={`${inv.isBlackSale ? 'row--black-sale' : ''} ${selected.has(inv.id) ? 'row--selected' : ''}`}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(inv.id)}
                      onChange={() => toggleSelect(inv.id)}
                    />
                  </td>
                  <td>
                    {inv.id}
                    {inv.isBlackSale && <span className="badge badge--black" title="Venta N">N</span>}
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
                    {editingPaymentId === inv.id ? (
                      <select
                        className="select"
                        autoFocus
                        value={inv.paymentMethod}
                        disabled={savingPaymentId === inv.id}
                        onChange={e => { void handleUpdatePaymentMethod(inv.id, e.target.value as PaymentMethod) }}
                        onBlur={() => setEditingPaymentId(null)}
                      >
                        {inv.paymentMethod === 'credito_cliente' && (
                          <option value="credito_cliente">{PAYMENT_METHOD_LABELS.credito_cliente}</option>
                        )}
                        {EDITABLE_PAYMENT_METHODS.map(pm => (
                          <option key={pm} value={pm}>{PAYMENT_METHOD_LABELS[pm]}</option>
                        ))}
                      </select>
                    ) : (
                      <span
                        onClick={() => setEditingPaymentId(inv.id)}
                        style={{ cursor: 'pointer' }}
                        title="Editar modo de pago"
                      >
                        {savingPaymentId === inv.id ? '⏳' : (PAYMENT_METHOD_LABELS[inv.paymentMethod] ?? inv.paymentMethod)} ✏️
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={STATUS_BADGE[inv.status] ?? 'badge'}>
                      {STATUS_LABELS[inv.status] ?? inv.status}
                    </span>
                  </td>
                  <td>
                    {inv.cae
                      ? <span title={`Vto: ${inv.caeVto}`} style={{ fontSize: '0.8em' }}>{inv.cae}</span>
                      : <span className="text-muted">{inv.afipError ? `❌ ${inv.afipError.slice(0, 30)}…` : '—'}</span>
                    }
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {!inv.isBlackSale && (inv.status === 'PENDING_CAE' || inv.status === 'INTERNAL_RECEIPT') && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => { void handleRetryCAE(inv.id) }}
                        disabled={retrying === inv.id}
                        title="Reintentar CAE"
                      >
                        {retrying === inv.id ? '⏳' : '↺ CAE'}
                      </button>
                    )}
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => void handlePrint(inv)}
                      disabled={printingId === inv.id}
                      title="Reimprimir comprobante"
                    >
                      {printingId === inv.id ? '⏳' : '🖨️'}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => void handlePrintChangeTicket(inv)}
                      disabled={changePrintingId === inv.id}
                      title="Imprimir Ticket de Cambio"
                    >
                      {changePrintingId === inv.id ? '⏳' : '🔄'}
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={11} className="empty-row">Sin comprobantes para los filtros seleccionados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
