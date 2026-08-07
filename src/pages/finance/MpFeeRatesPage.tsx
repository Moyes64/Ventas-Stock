import { useEffect, useState } from 'react'
import { finance } from '../../lib/ipc'
import { localToday } from '../../lib/date'
import type { FinanceMpFeeRate, MpFeePaymentMethod } from '../../types/ipc'

const METHOD_LABELS: Record<MpFeePaymentMethod, string> = {
  qr: '📱 QR',
  debito: '💳 Débito',
  credito: '💳 Crédito',
  mercadopago: '🛒 Mercado Pago (Web)',
}

const METHODS: MpFeePaymentMethod[] = ['qr', 'debito', 'credito', 'mercadopago']

export default function MpFeeRatesPage() {
  const [rates, setRates] = useState<FinanceMpFeeRate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form de alta por medio de pago
  const [pct, setPct] = useState<Record<MpFeePaymentMethod, string>>({ qr: '', debito: '', credito: '', mercadopago: '' })
  const [ivaPct, setIvaPct] = useState<Record<MpFeePaymentMethod, string>>({
    qr: '21', debito: '21', credito: '21', mercadopago: '0',
  })
  const [vigenteDesde, setVigenteDesde] = useState<Record<MpFeePaymentMethod, string>>({
    qr: localToday(), debito: localToday(), credito: localToday(), mercadopago: localToday(),
  })
  const [saving, setSaving] = useState<MpFeePaymentMethod | null>(null)
  const [saveError, setSaveError] = useState<Record<MpFeePaymentMethod, string | null>>({
    qr: null, debito: null, credito: null, mercadopago: null,
  })

  async function loadRates() {
    setLoading(true)
    setError(null)
    try {
      setRates(await finance.listMpFeeRates())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar las tasas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRates()
  }, [])

  async function handleAdd(method: MpFeePaymentMethod) {
    const pctNum = parseFloat(pct[method])
    const ivaPctNum = parseFloat(ivaPct[method])
    if (isNaN(pctNum) || pctNum < 0) {
      setSaveError(prev => ({ ...prev, [method]: 'El % de comisión debe ser un número mayor o igual a cero' }))
      return
    }
    if (isNaN(ivaPctNum) || ivaPctNum < 0) {
      setSaveError(prev => ({ ...prev, [method]: 'El % de IVA debe ser un número mayor o igual a cero' }))
      return
    }

    setSaving(method)
    setSaveError(prev => ({ ...prev, [method]: null }))
    try {
      await finance.createMpFeeRate({
        paymentMethod: method,
        pct: pctNum,
        ivaPct: ivaPctNum,
        vigenteDesde: vigenteDesde[method],
      })
      setPct(prev => ({ ...prev, [method]: '' }))
      await loadRates()
    } catch (err) {
      setSaveError(prev => ({
        ...prev,
        [method]: err instanceof Error ? err.message : 'Error al guardar la tasa',
      }))
    } finally {
      setSaving(null)
    }
  }

  async function handleDelete(id: number) {
    try {
      await finance.deleteMpFeeRate(id)
      await loadRates()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar la tasa')
    }
  }

  const today = localToday()

  return (
    <div className="caja-section caja-section--wide">
      <h2 className="section-title">💳 Comisiones de Mercado Pago</h2>
      <p className="page-subtitle">
        Configurá el % que Mercado Pago cobra por el uso del posnet (QR y tarjeta) y por la tienda
        online (Checkout Pro) — se descuenta automáticamente como un gasto en cada venta, usando la
        tasa vigente el día de la venta. Transferencia no tiene comisión y no aparece acá.
      </p>

      {error && <p className="error">{error}</p>}
      {loading && <p>Cargando...</p>}

      {!loading && (
        <div className="fee-rates-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {METHODS.map(method => {
            const history = rates.filter(r => r.paymentMethod === method)
            const current = history[0] // ya viene ordenado DESC por vigente_desde
            return (
              <div key={method} className="caja-movement-form">
                <h3>{METHOD_LABELS[method]}</h3>

                {current ? (
                  <p>
                    Tasa vigente:{' '}
                    <strong>{current.pct}% + {current.ivaPct}% IVA</strong>{' '}
                    <span className="text-muted">(desde {current.vigenteDesde})</span>
                  </p>
                ) : (
                  <p className="text-muted">Sin tasa configurada — no se descuenta comisión en las ventas por {METHOD_LABELS[method]}.</p>
                )}

                <div className="form-row">
                  <div className="form-group">
                    <label className="label">% comisión</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={pct[method]}
                      onChange={e => setPct(prev => ({ ...prev, [method]: e.target.value }))}
                      onFocus={e => e.target.select()}
                      placeholder="0.80"
                      className="input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">% IVA</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={ivaPct[method]}
                      onChange={e => setIvaPct(prev => ({ ...prev, [method]: e.target.value }))}
                      onFocus={e => e.target.select()}
                      className="input"
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">Vigente desde</label>
                    <input
                      type="date"
                      value={vigenteDesde[method]}
                      onChange={e => setVigenteDesde(prev => ({ ...prev, [method]: e.target.value }))}
                      className="input"
                    />
                  </div>
                  <div className="form-group form-group--action">
                    <label className="label">&nbsp;</label>
                    <button
                      className="btn btn-primary"
                      onClick={() => { void handleAdd(method) }}
                      disabled={saving === method}
                    >
                      {saving === method ? '⏳' : '+ Nueva tasa'}
                    </button>
                  </div>
                </div>
                {saveError[method] && <p className="error">{saveError[method]}</p>}

                {history.length > 0 && (
                  <table className="table table--compact" style={{ marginTop: '0.75rem' }}>
                    <thead>
                      <tr>
                        <th>Vigente desde</th>
                        <th>%</th>
                        <th>% IVA</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((r, idx) => (
                        <tr key={r.id}>
                          <td>
                            {r.vigenteDesde}
                            {r.vigenteDesde > today && <span className="badge badge--warning" style={{ marginLeft: 6 }}>Futura</span>}
                          </td>
                          <td>{r.pct}%</td>
                          <td>{r.ivaPct}%</td>
                          <td>
                            {idx === 0 ? (
                              <button className="btn btn-danger btn-sm" onClick={() => { void handleDelete(r.id) }}>✕</button>
                            ) : (
                              <span className="text-muted" title="Solo se puede borrar la versión más reciente">🔒</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
