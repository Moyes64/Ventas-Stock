import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { stockCount as stockCountApi } from '../../lib/ipc'
import type { StockCountSession, ReconciliationRow } from '../../types/ipc'

export default function StockCountReconcilePage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const navigate = useNavigate()
  const id = Number(sessionId)

  const [session, setSession] = useState<StockCountSession | null>(null)
  const [rows, setRows] = useState<ReconciliationRow[]>([])
  const [decisions, setDecisions] = useState<Record<number, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [s, r] = await Promise.all([
        stockCountApi.getSession(id),
        stockCountApi.getReconciliation(id),
      ])
      setSession(s ?? null)
      setRows(r)
      setDecisions(prev => {
        // Preserva decisiones ya elegidas por el usuario; para filas nuevas,
        // pre-tilda "aplicar" solo cuando hay diferencia real con el sistema.
        const next: Record<number, boolean> = {}
        for (const row of r) {
          next[row.itemId] = row.itemId in prev ? prev[row.itemId] : row.diff !== 0
        }
        return next
      })
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, [id])

  function setAll(apply: boolean) {
    setDecisions(prev => {
      const next = { ...prev }
      for (const row of rows) {
        if (!row.reconciled) next[row.itemId] = apply
      }
      return next
    })
  }

  async function handleConfirm() {
    setSaving(true)
    setSaveMsg(null)
    setSaveErr(null)
    try {
      const pending = rows.filter(r => !r.reconciled)
      await stockCountApi.applyReconciliation(
        id,
        pending.map(r => ({ itemId: r.itemId, apply: decisions[r.itemId] ?? false }))
      )
      setSaveMsg('Conciliación aplicada correctamente')
      await load()
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Error al aplicar la conciliación')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="page"><p>Cargando...</p></div>
  if (!session) return <div className="page"><p className="error">Sesión no encontrada.</p></div>

  const pendingCount = rows.filter(r => !r.reconciled).length

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">📱 Conciliación — {session.label}</h1>
        <button className="btn btn-ghost" onClick={() => navigate('/stock/conteo')}>← Volver</button>
      </div>

      <p className="muted-text">
        Comparación entre lo contado en el celular y el stock actual del sistema. Tildá &quot;Aplicar&quot; en los
        productos donde quieras que el stock del sistema pase a ser el contado — el resto se descarta sin tocar el stock.
      </p>

      {rows.length === 0 ? (
        <p className="muted-text">Esta sesión no tiene productos contados.</p>
      ) : (
        <>
          {pendingCount > 0 && (
            <div className="form-actions" style={{ marginBottom: 12 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(true)}>
                Aplicar todo
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(false)}>
                Descartar todo
              </button>
            </div>
          )}

          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="text-right">Stock sistema</th>
                <th className="text-right">Contado</th>
                <th className="text-right">Diferencia</th>
                <th>Nota</th>
                <th className="text-right">Aplicar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.itemId}>
                  <td>{r.productName}</td>
                  <td className="text-right">{r.systemQuantity}</td>
                  <td className="text-right">{r.countedQuantity}</td>
                  <td className={`text-right ${r.diff !== 0 ? (r.diff > 0 ? 'text-warn' : 'text-danger') : ''}`}>
                    {r.diff > 0 ? `+${r.diff}` : r.diff}
                  </td>
                  <td className="muted-text">{r.note || '—'}</td>
                  <td className="text-right">
                    {r.reconciled ? (
                      <span className="badge badge--success">Ya conciliado</span>
                    ) : (
                      <input
                        type="checkbox"
                        checked={decisions[r.itemId] ?? false}
                        onChange={e => setDecisions(prev => ({ ...prev, [r.itemId]: e.target.checked }))}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {saveMsg && <p className="params-success">{saveMsg}</p>}
          {saveErr && <p className="error">{saveErr}</p>}

          {pendingCount > 0 && (
            <div className="form-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => { void handleConfirm() }}
                disabled={saving}
              >
                {saving ? 'Aplicando...' : 'Confirmar conciliación'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
