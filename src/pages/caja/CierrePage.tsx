import { useEffect, useState } from 'react'
import { caja } from '../../lib/ipc'
import type { CierreSummary } from '../../types/ipc'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  contado_efectivo: '💵 Contado Efectivo',
  transferencia: '🏦 Transferencia',
  debito: '💳 Débito',
  credito: '💳 Crédito',
}

export default function CierrePage() {
  const today = new Date().toISOString().slice(0, 10)
  const [selectedDate, setSelectedDate] = useState(today)
  const [summary, setSummary] = useState<CierreSummary | null>(null)
  const [loadingSum, setLoadingSum] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const [closeSuccess, setCloseSuccess] = useState<string | null>(null)

  async function loadSummary(date: string) {
    setLoadingSum(true)
    setSummaryError(null)
    setSummary(null)
    setCloseError(null)
    setCloseSuccess(null)
    try {
      const data = await caja.getCierreSummary(date)
      setSummary(data)
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Error al cargar el resumen')
    } finally {
      setLoadingSum(false)
    }
  }

  useEffect(() => {
    void loadSummary(today)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleClose() {
    if (!summary) return
    setClosing(true)
    setCloseError(null)
    setCloseSuccess(null)
    try {
      await caja.closeSession(selectedDate, summary.expectedTotal)
      setCloseSuccess(`✅ Cierre de caja registrado. Total: ${currency(summary.expectedTotal)}`)
      void loadSummary(selectedDate)
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'Error al cerrar la caja')
    } finally {
      setClosing(false)
    }
  }

  const currency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  return (
    <div className="caja-section">
      <h2 className="section-title">🔒 Cierre de Caja</h2>

      <div className="form-group">
        <label className="label">Fecha de cierre</label>
        <input
          type="date"
          value={selectedDate}
          onChange={e => {
            setSelectedDate(e.target.value)
            void loadSummary(e.target.value)
          }}
          className="input"
        />
      </div>

      {loadingSum && <p>Calculando resumen...</p>}
      {summaryError && <p className="error">{summaryError}</p>}

      {summary && (
        <>
          <div className={`caja-status-card caja-status-card--${summary.session.status}`}>
            <p>
              Estado:{' '}
              <strong>
                {summary.session.status === 'open' ? '🔓 Abierta' : '🔒 Cerrada'}
              </strong>
            </p>
          </div>

          <div className="caja-summary">
            <h3 className="caja-summary-title">Resumen del día {selectedDate}</h3>

            <div className="caja-summary-table">
              <div className="caja-summary-row">
                <span>Apertura de caja</span>
                <span>{currency(summary.aperturaAmount)}</span>
              </div>
              <div className="caja-summary-row caja-summary-row--ingreso">
                <span>+ Ventas contado efectivo</span>
                <span>{currency(summary.cashSalesTotal)}</span>
              </div>
              <div className="caja-summary-row caja-summary-row--ingreso">
                <span>+ Otros ingresos</span>
                <span>{currency(summary.ingresosTotal)}</span>
              </div>
              <div className="caja-summary-row caja-summary-row--egreso">
                <span>− Egresos</span>
                <span>−{currency(summary.egresosTotal)}</span>
              </div>
              <div className="caja-summary-row caja-summary-row--total">
                <span><strong>Total esperado en caja</strong></span>
                <span><strong>{currency(summary.expectedTotal)}</strong></span>
              </div>
            </div>

            <h3 className="caja-summary-title" style={{ marginTop: '1.5rem' }}>
              Ventas por medio de pago
            </h3>
            <div className="caja-summary-table">
              {Object.entries(summary.salesByPaymentMethod).map(([method, amount]) => (
                <div key={method} className="caja-summary-row">
                  <span>{PAYMENT_METHOD_LABELS[method] ?? method}</span>
                  <span>{currency(amount)}</span>
                </div>
              ))}
            </div>

            {summary.movements.length > 0 && (
              <>
                <h3 className="caja-summary-title" style={{ marginTop: '1.5rem' }}>
                  Movimientos del día
                </h3>
                <div className="caja-summary-table">
                  {summary.movements.map(m => (
                    <div
                      key={m.id}
                      className={`caja-summary-row caja-summary-row--${m.tipo}`}
                    >
                      <span>{m.tipo === 'ingreso' ? '↑' : '↓'} {m.descripcion}</span>
                      <span>
                        {m.tipo === 'egreso' ? '−' : '+'}{currency(m.monto)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {closeError && <p className="error">{closeError}</p>}
          {closeSuccess && <p className="success">{closeSuccess}</p>}

          {summary.session.status === 'open' && !closeSuccess && (
            <button
              className="btn btn-primary"
              onClick={() => { void handleClose() }}
              disabled={closing}
            >
              {closing ? '⏳ Cerrando...' : '🔒 Cerrar Caja'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
