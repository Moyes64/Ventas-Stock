import { useEffect, useState } from 'react'
import { caja, printing } from '../../lib/ipc'
import { localToday } from '../../lib/date'
import type { CierreSummary } from '../../types/ipc'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  contado_efectivo: '💵 Contado Efectivo',
  transferencia: '🏦 Transferencia',
  debito: '💳 Débito',
  credito: '💳 Crédito',
}

export default function CierrePage() {
  const today = localToday()
  const [selectedDate, setSelectedDate] = useState(today)
  const [summary, setSummary] = useState<CierreSummary | null>(null)
  const [loadingSum, setLoadingSum] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const [closeSuccess, setCloseSuccess] = useState<string | null>(null)
  const [reopening, setReopening] = useState(false)
  const [reopenError, setReopenError] = useState<string | null>(null)
  const [showPrintPrompt, setShowPrintPrompt] = useState(false)
  const [batchPrinting, setBatchPrinting] = useState(false)
  const [batchMsg, setBatchMsg] = useState<string | null>(null)

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
      setShowPrintPrompt(true)
      void loadSummary(selectedDate)
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : 'Error al cerrar la caja')
    } finally {
      setClosing(false)
    }
  }

  async function handleReopen() {
    if (!summary) return
    if (!window.confirm(`¿Confirmás reabrir la caja del ${selectedDate}? Esto deshace el cierre registrado.`)) {
      return
    }
    setReopening(true)
    setReopenError(null)
    try {
      await caja.reopenSession(selectedDate)
      setCloseSuccess(null)
      setShowPrintPrompt(false)
      void loadSummary(selectedDate)
    } catch (err) {
      setReopenError(err instanceof Error ? err.message : 'Error al reabrir la caja')
    } finally {
      setReopening(false)
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

          {/* Prompt de impresión post-cierre */}
          {showPrintPrompt && (
            <div className="print-prompt-card">
              <p className="print-prompt-text">
                🖨️ ¿Desea imprimir todos los comprobantes emitidos hoy ({selectedDate})?
              </p>
              <div className="print-prompt-actions">
                <button
                  className="btn btn-primary"
                  disabled={batchPrinting}
                  onClick={async () => {
                    setBatchPrinting(true)
                    setBatchMsg(null)
                    try {
                      const invoicesHoy = await printing.listForReprint({ dateFrom: selectedDate, dateTo: selectedDate })
                      const ids = invoicesHoy.map(i => i.id)
                      if (ids.length === 0) {
                        setBatchMsg('No hay comprobantes para imprimir en esta fecha.')
                      } else {
                        const res = await printing.printBatch(ids)
                        setBatchMsg(`✅ Impresos ${res.printed} de ${ids.length} comprobante${ids.length !== 1 ? 's' : ''}.`)
                      }
                    } catch (err) {
                      setBatchMsg(`Error: ${err instanceof Error ? err.message : String(err)}`)
                    } finally {
                      setBatchPrinting(false)
                      setShowPrintPrompt(false)
                    }
                  }}
                >
                  {batchPrinting ? '⏳ Imprimiendo...' : '🖨️ Sí, imprimir todos'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowPrintPrompt(false)}
                  disabled={batchPrinting}
                >
                  No por ahora
                </button>
              </div>
            </div>
          )}
          {batchMsg && <p className="success">{batchMsg}</p>}

          {summary.session.status === 'open' && !closeSuccess && (
            <button
              className="btn btn-primary"
              onClick={() => { void handleClose() }}
              disabled={closing}
            >
              {closing ? '⏳ Cerrando...' : '🔒 Cerrar Caja'}
            </button>
          )}

          {reopenError && <p className="error">{reopenError}</p>}

          {summary.session.status === 'closed' && (
            <button
              className="btn btn-secondary"
              onClick={() => { void handleReopen() }}
              disabled={reopening}
            >
              {reopening ? '⏳ Reabriendo...' : '🔓 Reabrir Caja'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
