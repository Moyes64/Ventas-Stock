import { useEffect, useState } from 'react'
import { finance } from '../../lib/ipc'
import { formatWeekdayDate, localToday } from '../../lib/date'
import type { FinanceHoliday, FinanceAccreditationShift } from '../../types/ipc'

/** Feriados nacionales: días no hábiles (además de sábados y domingos) para el
 *  cálculo de la acreditación de los cobros FISERV. */
export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<FinanceHoliday[]>([])
  const [shifts, setShifts] = useState<FinanceAccreditationShift[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [fecha, setFecha] = useState(localToday())
  const [descripcion, setDescripcion] = useState('')
  const [saving, setSaving] = useState(false)
  const [shifting, setShifting] = useState(false)
  const [shiftedMsg, setShiftedMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [h, s] = await Promise.all([finance.listHolidays(), finance.getAccreditationsOnNonBusinessDays()])
      setHolidays(h)
      setShifts(s)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar los feriados')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleAdd() {
    setSaving(true)
    setError(null)
    setShiftedMsg(null)
    try {
      await finance.createHoliday({ fecha, descripcion })
      setDescripcion('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el feriado')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    setError(null)
    setShiftedMsg(null)
    try {
      await finance.deleteHoliday(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar el feriado')
    }
  }

  async function handleShift() {
    setShifting(true)
    setError(null)
    try {
      const done = await finance.shiftAccreditationsToBusinessDays()
      setShiftedMsg(`Se corrieron ${done.length} acreditación(es) al día hábil siguiente.`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al correr las acreditaciones')
    } finally {
      setShifting(false)
    }
  }

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  const today = localToday()
  const upcoming = holidays.filter(h => h.fecha >= today).reverse()
  const past = holidays.filter(h => h.fecha < today)

  function renderTable(rows: FinanceHoliday[], muted = false) {
    return (
      <table className="table table--compact" style={{ marginTop: '0.75rem' }}>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Descripción</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(h => (
            <tr key={h.id} className={muted ? 'text-muted' : undefined}>
              <td>{formatWeekdayDate(h.fecha)}</td>
              <td>{h.descripcion}</td>
              <td>
                <button className="btn btn-danger btn-sm" onClick={() => { void handleDelete(h.id) }}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <div className="caja-section caja-section--wide">
      <h2 className="section-title">📅 Feriados</h2>
      <p className="page-subtitle">
        Días no hábiles además de sábados y domingos. Se usan para calcular la acreditación de los cobros
        FISERV en <strong>Mercado Pago - Anabella</strong>: una venta del viernes anterior a un lunes feriado
        acredita el martes. Los feriados puente y los trasladables se fijan por decreto cada año — cargalos
        acá cuando se publique el calendario oficial.
      </p>

      {error && <p className="error">{error}</p>}
      {shiftedMsg && <div className="alert alert--success">{shiftedMsg}</div>}

      {shifts.length > 0 && (
        <div className="alert alert--warning">
          <p>
            ⚠️ Hay {shifts.length} acreditación(es) pendiente(s) que caen en un día no hábil:
          </p>
          <table className="table table--compact">
            <thead>
              <tr>
                <th>Movimiento</th>
                <th>Monto</th>
                <th>Acredita hoy</th>
                <th>Pasaría a</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map(s => (
                <tr key={s.movementId}>
                  <td>{s.descripcion}</td>
                  <td>{formatCurrency(s.monto)}</td>
                  <td>{formatWeekdayDate(s.fechaAcreditacion)}</td>
                  <td><strong>{formatWeekdayDate(s.nuevaFechaAcreditacion)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn btn-primary" onClick={() => { void handleShift() }} disabled={shifting}>
            {shifting ? '⏳' : 'Correr al día hábil siguiente'}
          </button>
        </div>
      )}

      <div className="caja-movement-form">
        <div className="form-row">
          <div className="form-group">
            <label className="label">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="input" />
          </div>
          <div className="form-group" style={{ flex: 2 }}>
            <label className="label">Descripción</label>
            <input
              type="text"
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Ej: Feriado puente"
              className="input"
            />
          </div>
          <div className="form-group form-group--action">
            <label className="label">&nbsp;</label>
            <button className="btn btn-primary" onClick={() => { void handleAdd() }} disabled={saving || !fecha}>
              {saving ? '⏳' : '+ Agregar feriado'}
            </button>
          </div>
        </div>
      </div>

      {loading && <p>Cargando...</p>}

      {!loading && (
        <>
          <h3 style={{ marginTop: '1.5rem' }}>Próximos</h3>
          {upcoming.length > 0 ? renderTable(upcoming) : <p className="text-muted">No hay feriados próximos cargados.</p>}
          {past.length > 0 && (
            <details style={{ marginTop: '1rem' }}>
              <summary>Anteriores ({past.length})</summary>
              {renderTable(past, true)}
            </details>
          )}
        </>
      )}
    </div>
  )
}
