import { useEffect, useState, type ReactNode } from 'react'
import { finance } from '../../lib/ipc'
import { localToday, formatDate } from '../../lib/date'
import type { FinanceMpFeeRate, FeePaymentMethod } from '../../types/ipc'

interface Props<M extends FeePaymentMethod> {
  title: string
  subtitle: ReactNode
  methods: M[]
  labels: Record<M, string>
  /** % de IVA precargado en el form de cada medio (default 21). */
  defaultIvaPct?: Partial<Record<M, string>>
}

function byMethod<M extends string, V>(methods: M[], value: (m: M) => V): Record<M, V> {
  return Object.fromEntries(methods.map(m => [m, value(m)])) as Record<M, V>
}

/** Tasas de comisión versionadas por medio de pago (una tarjeta por medio). Lo
 *  usan las hojas "Comisiones MP" y "Comisiones FISERV" de Finanzas. */
export default function FeeRatesPanel<M extends FeePaymentMethod>({ title, subtitle, methods, labels, defaultIvaPct }: Props<M>) {
  const [rates, setRates] = useState<FinanceMpFeeRate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form de alta por medio de pago
  const [pct, setPct] = useState<Record<M, string>>(() => byMethod(methods, () => ''))
  const [ivaPct, setIvaPct] = useState<Record<M, string>>(() => byMethod(methods, m => defaultIvaPct?.[m] ?? '21'))
  const [vigenteDesde, setVigenteDesde] = useState<Record<M, string>>(() => byMethod(methods, () => localToday()))
  const [saving, setSaving] = useState<M | null>(null)
  const [saveError, setSaveError] = useState<Record<M, string | null>>(() => byMethod<M, string | null>(methods, () => null))

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

  async function handleAdd(method: M) {
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
      <h2 className="section-title">{title}</h2>
      <p className="page-subtitle">{subtitle}</p>

      {error && <p className="error">{error}</p>}
      {loading && <p>Cargando...</p>}

      {!loading && (
        <div className="fee-rates-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {methods.map(method => {
            const history = rates.filter(r => r.paymentMethod === method)
            const current = history[0] // ya viene ordenado DESC por vigente_desde
            return (
              <div key={method} className="caja-movement-form">
                <h3>{labels[method]}</h3>

                {current ? (
                  <p>
                    Tasa vigente:{' '}
                    <strong>{current.pct}% + {current.ivaPct}% IVA</strong>{' '}
                    <span className="text-muted">(desde {formatDate(current.vigenteDesde)})</span>
                  </p>
                ) : (
                  <p className="text-muted">Sin tasa configurada — no se descuenta comisión en las ventas por {labels[method]}.</p>
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
                            {formatDate(r.vigenteDesde)}
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
