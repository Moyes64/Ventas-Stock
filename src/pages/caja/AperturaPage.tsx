import { useEffect, useState } from 'react'
import { caja } from '../../lib/ipc'
import type { CashSession } from '../../types/ipc'

export default function AperturaPage() {
  const today = new Date().toISOString().slice(0, 10)
  const [sessionDate, setSessionDate] = useState(today)
  const [aperturaAmount, setAperturaAmount] = useState('')
  const [existingSession, setExistingSession] = useState<CashSession | null | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function checkSession(date: string) {
    setExistingSession(undefined)
    setError(null)
    setSuccess(null)
    try {
      const session = await caja.getSessionByDate(date)
      setExistingSession(session ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al verificar la caja')
    }
  }

  useEffect(() => {
    void checkSession(today)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  async function handleOpenSession() {
    const amount = parseFloat(aperturaAmount)
    if (isNaN(amount) || amount < 0) {
      setError('Ingrese un monto válido (mayor o igual a cero)')
      return
    }
    setLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const session = await caja.openSession({ sessionDate, aperturaAmount: amount })
      setExistingSession(session)
      setSuccess(`✅ Apertura de caja registrada para el ${session.sessionDate} con ${currency(session.aperturaAmount)}`)
      setAperturaAmount('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al abrir la caja')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="caja-section">
      <h2 className="section-title">🔓 Apertura de Caja</h2>
      <p className="section-desc">
        Registre el monto de efectivo disponible en caja al inicio del día.
      </p>

      <div className="form-group">
        <label className="label">Fecha de apertura</label>
        <input
          type="date"
          value={sessionDate}
          onChange={e => {
            setSessionDate(e.target.value)
            void checkSession(e.target.value)
          }}
          className="input"
        />
      </div>

      {existingSession === undefined && <p>Verificando...</p>}

      {existingSession && (
        <div className={`caja-status-card caja-status-card--${existingSession.status}`}>
          <p>
            <strong>
              {existingSession.status === 'open' ? '🔓 Caja abierta' : '🔒 Caja cerrada'}
            </strong>{' '}
            para el {existingSession.sessionDate}
          </p>
          <p>Monto apertura: <strong>{currency(existingSession.aperturaAmount)}</strong></p>
          {existingSession.cierreAmount !== null && (
            <p>Monto cierre: <strong>{currency(existingSession.cierreAmount)}</strong></p>
          )}
        </div>
      )}

      {existingSession === null && (
        <>
          <div className="form-group">
            <label className="label">Monto en caja al abrir</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={aperturaAmount}
              onChange={e => setAperturaAmount(e.target.value)}
              placeholder="0.00"
              className="input"
            />
          </div>

          {error && <p className="error">{error}</p>}
          {success && <p className="success">{success}</p>}

          <button
            className="btn btn-primary"
            onClick={() => { void handleOpenSession() }}
            disabled={loading}
          >
            {loading ? '⏳ Registrando...' : '🔓 Registrar Apertura'}
          </button>
        </>
      )}

      {existingSession && !success && error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
    </div>
  )
}
