import { useEffect, useMemo, useState } from 'react'
import { finance } from '../../lib/ipc'
import { localToday } from '../../lib/date'
import type { MpFeePaymentMethod, MpReconciliationRow } from '../../types/ipc'
import { useConfirm } from '../../hooks/useConfirm'

const METHOD_LABELS: Record<MpFeePaymentMethod, string> = {
  qr: '📱 QR',
  debito: '💳 Débito',
  credito: '💳 Crédito',
  mercadopago: '🛒 Mercado Pago (Web)',
}

const METHODS: MpFeePaymentMethod[] = ['qr', 'debito', 'credito', 'mercadopago']

interface DraftValues {
  brutoReal: string
  comisionReal: string
  netoReal: string
}

export default function MpReconciliationPage() {
  const [fecha, setFecha] = useState(localToday)
  const [paymentMethod, setPaymentMethod] = useState<MpFeePaymentMethod | ''>('')
  const [rows, setRows] = useState<MpReconciliationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<number, DraftValues>>({})
  const [busy, setBusy] = useState<number | null>(null)
  const [rowError, setRowError] = useState<Record<number, string | null>>({})
  const { confirm, dialog: confirmDialog } = useConfirm()

  const currency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  async function loadRows(f: string, method: MpFeePaymentMethod | '') {
    setLoading(true)
    setError(null)
    try {
      const data = await finance.getMpReconciliationRows(f, method || undefined)
      setRows(data)
      const nextDrafts: Record<number, DraftValues> = {}
      for (const row of data) nextDrafts[row.saleId] = draftFrom(row)
      setDrafts(nextDrafts)
      setRowError({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar la conciliación')
    } finally {
      setLoading(false)
    }
  }

  function draftFrom(row: MpReconciliationRow): DraftValues {
    const rec = row.reconciliation
    return {
      brutoReal: rec ? String(rec.brutoReal) : '',
      comisionReal: rec ? String(rec.comisionReal) : '',
      netoReal: rec ? String(rec.netoReal) : '',
    }
  }

  useEffect(() => {
    void loadRows(fecha, paymentMethod)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, paymentMethod])

  async function handleSave(saleId: number) {
    const draft = drafts[saleId]
    const brutoReal = parseFloat(draft.brutoReal)
    const comisionReal = parseFloat(draft.comisionReal)
    const netoReal = parseFloat(draft.netoReal)
    if ([brutoReal, comisionReal, netoReal].some(n => isNaN(n) || n < 0)) {
      setRowError(prev => ({ ...prev, [saleId]: 'Completá bruto, comisión y neto con números válidos' }))
      return
    }

    setBusy(saleId)
    setRowError(prev => ({ ...prev, [saleId]: null }))
    try {
      await finance.saveMpReconciliation({ saleId, brutoReal, comisionReal, netoReal })
      await loadRows(fecha, paymentMethod)
    } catch (err) {
      setRowError(prev => ({ ...prev, [saleId]: err instanceof Error ? err.message : 'Error al guardar' }))
    } finally {
      setBusy(null)
    }
  }

  async function handleConfirmAdjustment(saleId: number, id: number) {
    setBusy(saleId)
    setRowError(prev => ({ ...prev, [saleId]: null }))
    try {
      await finance.confirmMpReconciliationAdjustment(id)
      await loadRows(fecha, paymentMethod)
    } catch (err) {
      setRowError(prev => ({ ...prev, [saleId]: err instanceof Error ? err.message : 'Error al ajustar' }))
    } finally {
      setBusy(null)
    }
  }

  async function handleIgnore(saleId: number, id: number) {
    setBusy(saleId)
    setRowError(prev => ({ ...prev, [saleId]: null }))
    try {
      await finance.ignoreMpReconciliation(id)
      await loadRows(fecha, paymentMethod)
    } catch (err) {
      setRowError(prev => ({ ...prev, [saleId]: err instanceof Error ? err.message : 'Error al ignorar' }))
    } finally {
      setBusy(null)
    }
  }

  async function handleReopen(saleId: number, id: number) {
    if (!(await confirm('¿Reabrir esta conciliación? Esto revierte el ajuste ya asentado en la cuenta MP-Anabella.'))) return
    setBusy(saleId)
    setRowError(prev => ({ ...prev, [saleId]: null }))
    try {
      await finance.reopenMpReconciliation(id)
      await loadRows(fecha, paymentMethod)
    } catch (err) {
      setRowError(prev => ({ ...prev, [saleId]: err instanceof Error ? err.message : 'Error al reabrir' }))
    } finally {
      setBusy(null)
    }
  }

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          brutoSistema: acc.brutoSistema + row.brutoSistema,
          comisionSistema: acc.comisionSistema + row.comisionSistema,
          netoSistema: acc.netoSistema + row.netoSistema,
        }),
        { brutoSistema: 0, comisionSistema: 0, netoSistema: 0 }
      ),
    [rows]
  )

  return (
    <div className="caja-section caja-section--wide">
      <h2 className="section-title">🔍 Conciliación Mercado Pago</h2>
      <p className="page-subtitle">
        Comparás, venta por venta, lo que Ventas-Stock calculó automáticamente contra el resumen
        real del posnet/tienda de Mercado Pago del día. Si hay diferencia en una venta puntual,
        podés asentar un ajuste en la Cuenta MP-Anabella — nunca se asienta solo, siempre lo
        confirmás vos.
      </p>

      <div className="form-row">
        <div className="form-group" style={{ maxWidth: 220 }}>
          <label className="label">Fecha</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="input" />
        </div>
        <div className="form-group" style={{ maxWidth: 220 }}>
          <label className="label">Medio de pago</label>
          <select
            className="input"
            value={paymentMethod}
            onChange={e => setPaymentMethod(e.target.value as MpFeePaymentMethod | '')}
          >
            <option value="">Todos</option>
            {METHODS.map(m => (
              <option key={m} value={m}>{METHOD_LABELS[m]}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p>Calculando...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && rows.length === 0 && (
        <p className="text-muted">No hay ventas con comisión de Mercado Pago para esta fecha{paymentMethod ? ` y medio de pago (${METHOD_LABELS[paymentMethod]})` : ''}.</p>
      )}

      {!loading && rows.length > 0 && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Venta</th>
                <th>Medio</th>
                <th colSpan={3} style={{ textAlign: 'center' }}>Según Ventas-Stock</th>
                <th colSpan={3} style={{ textAlign: 'center' }}>Según resumen MP</th>
                <th>Diferencia</th>
                <th></th>
              </tr>
              <tr>
                <th></th>
                <th></th>
                <th>Bruto</th><th>Comisión</th><th>Neto</th>
                <th>Bruto</th><th>Comisión</th><th>Neto</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const rec = row.reconciliation
                const draft = drafts[row.saleId] ?? { brutoReal: '', comisionReal: '', netoReal: '' }
                const isBusy = busy === row.saleId
                const diffAbs = rec ? Math.abs(rec.diferencia) : 0
                return (
                  <tr key={row.saleId}>
                    <td>
                      <strong>#{row.saleId}</strong>
                      {row.invoiceNumber && <div className="text-muted">Fact. {row.invoiceNumber}</div>}
                      {row.customerName && <div className="text-muted">{row.customerName}</div>}
                      {rec && (
                        <div>
                          <span className={`badge badge--${rec.status === 'adjusted' ? 'success' : rec.status === 'ignored' ? 'warning' : 'info'}`}>
                            {rec.status === 'adjusted' ? 'Ajustado' : rec.status === 'ignored' ? 'Ignorado' : 'Pendiente'}
                          </span>
                        </div>
                      )}
                    </td>
                    <td>{METHOD_LABELS[row.paymentMethod]}</td>
                    <td>{currency(row.brutoSistema)}</td>
                    <td>{currency(row.comisionSistema)}</td>
                    <td><strong>{currency(row.netoSistema)}</strong></td>
                    <td>
                      <input
                        type="number" min="0" step="0.01" className="input" style={{ width: 100 }}
                        value={draft.brutoReal}
                        disabled={rec?.status === 'adjusted'}
                        onChange={e => setDrafts(prev => ({ ...prev, [row.saleId]: { ...prev[row.saleId], brutoReal: e.target.value } }))}
                      />
                    </td>
                    <td>
                      <input
                        type="number" min="0" step="0.01" className="input" style={{ width: 100 }}
                        value={draft.comisionReal}
                        disabled={rec?.status === 'adjusted'}
                        onChange={e => setDrafts(prev => ({ ...prev, [row.saleId]: { ...prev[row.saleId], comisionReal: e.target.value } }))}
                      />
                    </td>
                    <td>
                      <input
                        type="number" min="0" step="0.01" className="input" style={{ width: 100 }}
                        value={draft.netoReal}
                        disabled={rec?.status === 'adjusted'}
                        onChange={e => setDrafts(prev => ({ ...prev, [row.saleId]: { ...prev[row.saleId], netoReal: e.target.value } }))}
                      />
                    </td>
                    <td className={rec && rec.diferencia !== 0 ? 'text-danger' : ''}>
                      {rec ? currency(rec.diferencia) : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {rec?.status === 'adjusted' ? (
                          <button className="btn btn-secondary btn-sm" disabled={isBusy} onClick={() => { void handleReopen(row.saleId, rec.id) }}>
                            {isBusy ? '⏳' : '🔓 Reabrir'}
                          </button>
                        ) : (
                          <>
                            <button className="btn btn-primary btn-sm" disabled={isBusy} onClick={() => { void handleSave(row.saleId) }}>
                              {isBusy ? '⏳' : '💾 Guardar'}
                            </button>
                            {rec && rec.status === 'pending' && diffAbs >= 0.01 && (
                              <button className="btn btn-danger btn-sm" disabled={isBusy} onClick={() => { void handleConfirmAdjustment(row.saleId, rec.id) }}>
                                ⚖️ Ajustar
                              </button>
                            )}
                            {rec && rec.status === 'pending' && (
                              <button className="btn btn-secondary btn-sm" disabled={isBusy} onClick={() => { void handleIgnore(row.saleId, rec.id) }}>
                                Ignorar
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      {rowError[row.saleId] && <p className="error" style={{ margin: '4px 0 0' }}>{rowError[row.saleId]}</p>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={2}>Total ({rows.length} venta{rows.length === 1 ? '' : 's'})</th>
                <th>{currency(totals.brutoSistema)}</th>
                <th>{currency(totals.comisionSistema)}</th>
                <th>{currency(totals.netoSistema)}</th>
                <th colSpan={5}></th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {confirmDialog}
    </div>
  )
}
