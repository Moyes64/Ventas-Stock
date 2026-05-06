import { useEffect, useState } from 'react'
import { caja } from '../../lib/ipc'
import type { CashMovement } from '../../types/ipc'

export default function MovimientosPage() {
  const today = new Date().toISOString().slice(0, 10)
  const [selectedDate, setSelectedDate] = useState(today)
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [descripcion, setDescripcion] = useState('')
  const [tipo, setTipo] = useState<'ingreso' | 'egreso'>('ingreso')
  const [monto, setMonto] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  async function loadMovements(date: string) {
    setLoading(true)
    setError(null)
    try {
      const data = await caja.listMovements(date)
      setMovements(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar movimientos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMovements(today)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSave() {
    const montoNum = parseFloat(monto)
    if (!descripcion.trim()) {
      setSaveError('La descripción es obligatoria')
      return
    }
    if (isNaN(montoNum) || montoNum <= 0) {
      setSaveError('El monto debe ser mayor a cero')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await caja.createMovement({ descripcion: descripcion.trim(), tipo, monto: montoNum, movimientoDate: selectedDate })
      setDescripcion('')
      setMonto('')
      setTipo('ingreso')
      await loadMovements(selectedDate)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar el movimiento')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    try {
      await caja.deleteMovement(id)
      await loadMovements(selectedDate)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar el movimiento')
    }
  }

  const currency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  const totalIngresos = movements.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
  const totalEgresos = movements.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0)

  return (
    <div className="caja-section">
      <h2 className="section-title">📋 Movimientos de Caja</h2>

      <div className="form-group">
        <label className="label">Fecha</label>
        <input
          type="date"
          value={selectedDate}
          onChange={e => {
            setSelectedDate(e.target.value)
            void loadMovements(e.target.value)
          }}
          className="input"
        />
      </div>

      {/* New movement form */}
      <div className="caja-movement-form">
        <h3>Nuevo movimiento</h3>
        <div className="form-row">
          <div className="form-group form-group--grow">
            <label className="label">Descripción</label>
            <input
              type="text"
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Ej: Pago proveedor, Retiro socio..."
              className="input"
            />
          </div>
          <div className="form-group">
            <label className="label">Tipo</label>
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value as 'ingreso' | 'egreso')}
              className="select"
            >
              <option value="ingreso">↑ Ingreso</option>
              <option value="egreso">↓ Egreso</option>
            </select>
          </div>
          <div className="form-group">
            <label className="label">Monto</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              placeholder="0.00"
              className="input"
            />
          </div>
          <div className="form-group form-group--action">
            <label className="label">&nbsp;</label>
            <button
              className="btn btn-primary"
              onClick={() => { void handleSave() }}
              disabled={saving}
            >
              {saving ? '⏳' : '+ Agregar'}
            </button>
          </div>
        </div>
        {saveError && <p className="error">{saveError}</p>}
      </div>

      {/* Movement list */}
      {loading && <p>Cargando...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && (
        <>
          {movements.length === 0 ? (
            <p className="empty-message">No hay movimientos para esta fecha.</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th>Tipo</th>
                    <th>Monto</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map(m => (
                    <tr key={m.id}>
                      <td>{m.descripcion}</td>
                      <td>
                        <span className={`badge badge--${m.tipo === 'ingreso' ? 'success' : 'danger'}`}>
                          {m.tipo === 'ingreso' ? '↑ Ingreso' : '↓ Egreso'}
                        </span>
                      </td>
                      <td className={m.tipo === 'egreso' ? 'text-danger' : ''}>
                        {m.tipo === 'egreso' ? '−' : '+'}{currency(m.monto)}
                      </td>
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => { void handleDelete(m.id) }}
                        >✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}><strong>Totales</strong></td>
                    <td>
                      <div>+{currency(totalIngresos)}</div>
                      <div className="text-danger">−{currency(totalEgresos)}</div>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
