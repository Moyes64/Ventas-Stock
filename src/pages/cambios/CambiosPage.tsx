import { useState, useEffect, useRef } from 'react'
import { cambios } from '../../lib/ipc'
import type { ExchangePreview, ExchangeRecord } from '../../types/ipc'

type Step = 'scan' | 'preview' | 'done'

export default function CambiosPage() {
  const [step, setStep] = useState<Step>('scan')
  const [rawQr, setRawQr] = useState('')
  const [preview, setPreview] = useState<ExchangePreview | null>(null)
  const [notes, setNotes] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')
  const [history, setHistory] = useState<ExchangeRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadHistory()
    inputRef.current?.focus()
  }, [])

  async function loadHistory() {
    setLoadingHistory(true)
    try {
      setHistory(await cambios.list(30))
    } finally {
      setLoadingHistory(false)
    }
  }

  async function handleScan() {
    if (!rawQr.trim()) return
    const result = await cambios.preview(rawQr.trim())
    setPreview(result)
    if (result.ok) {
      setStep('preview')
    }
  }

  async function handleConfirm() {
    if (!rawQr || confirming) return
    setConfirming(true)
    try {
      const res = await cambios.confirm(rawQr.trim(), notes.trim() || undefined)
      if (res.ok) {
        setDoneMsg(
          res.creditId
            ? `✅ Cambio registrado. Se generó crédito a favor del cliente.`
            : `✅ Cambio registrado. Stock repuesto.`
        )
        setStep('done')
        await loadHistory()
      } else {
        setPreview(p => p ? { ...p, ok: false, error: res.error } : null)
        setStep('scan')
      }
    } finally {
      setConfirming(false)
    }
  }

  function reset() {
    setRawQr('')
    setPreview(null)
    setNotes('')
    setStep('scan')
    setDoneMsg('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function fmt(n: number) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">🔄 Cambios y Devoluciones</h1>
          <p className="page-subtitle">Escaneá el QR del ticket de cambio para procesar</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>

        {/* Panel izquierdo: escaneo / preview / done */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px' }}>

          {/* ── Paso 1: Scan ── */}
          {step === 'scan' && (
            <>
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>
                Ingresar o escanear QR
              </h2>
              {preview && !preview.ok && (
                <div style={{
                  marginBottom: '12px', padding: '10px 14px', borderRadius: '8px',
                  backgroundColor: '#fef2f2', border: '1px solid #fecaca',
                  fontSize: '13px', color: '#dc2626',
                }}>
                  ⚠️ {preview.error}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={rawQr}
                  onChange={e => setRawQr(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && void handleScan()}
                  placeholder='Escaneá el QR o pegá el contenido aquí...'
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: '1px solid #d1d5db', fontSize: '13px', outline: 'none',
                    fontFamily: 'monospace',
                  }}
                />
                <button
                  onClick={() => void handleScan()}
                  disabled={!rawQr.trim()}
                  style={{
                    padding: '10px', borderRadius: '8px', fontWeight: 700,
                    fontSize: '13px', border: 'none', cursor: rawQr.trim() ? 'pointer' : 'not-allowed',
                    backgroundColor: rawQr.trim() ? '#2563eb' : '#9ca3af', color: 'white',
                  }}
                >
                  🔍 Verificar ticket
                </button>
              </div>
            </>
          )}

          {/* ── Paso 2: Preview ── */}
          {step === 'preview' && preview?.ok && (
            <>
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>
                Confirmar cambio / devolución
              </h2>

              {/* Datos del ticket */}
              <div style={{
                backgroundColor: '#f9fafb', borderRadius: '8px', padding: '14px',
                marginBottom: '16px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px',
              }}>
                <Row label="Venta N°" value={`#${preview.saleId} — ${preview.saleDate}`} />
                <Row label="Cliente" value={preview.customerName ?? '—'} />
                <Row label="Producto" value={preview.productName ?? '—'} bold />
                <Row label="Cantidad" value={String(preview.qty ?? 1)} />
                <Row label="Importe" value={fmt(preview.amount ?? 0)} bold />
                <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '4px', paddingTop: '8px' }}>
                  <Row label="Vto. cambio" value={preview.vencimiento ?? '—'} />
                </div>
              </div>

              {/* Alerta vencido */}
              {preview.expired && (
                <div style={{
                  marginBottom: '12px', padding: '10px 14px', borderRadius: '8px',
                  backgroundColor: '#fff7ed', border: '1px solid #fed7aa',
                  fontSize: '13px', color: '#c2410c',
                }}>
                  ⚠️ El plazo de cambio venció hace más de {preview.diasCambio} días desde la venta.
                  Podés confirmar igual si es una excepción.
                </div>
              )}

              {/* Nota opcional */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                  Observaciones (opcional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Ej: producto con defecto de fábrica"
                  style={{
                    width: '100%', padding: '8px 10px', borderRadius: '8px',
                    border: '1px solid #d1d5db', fontSize: '13px', outline: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => void handleConfirm()}
                  disabled={confirming}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '8px', fontWeight: 700,
                    fontSize: '13px', border: 'none', cursor: confirming ? 'not-allowed' : 'pointer',
                    backgroundColor: confirming ? '#9ca3af' : '#16a34a', color: 'white',
                  }}
                >
                  {confirming ? '⏳ Procesando...' : '✅ Confirmar cambio'}
                </button>
                <button
                  onClick={reset}
                  style={{
                    padding: '10px 16px', borderRadius: '8px', fontWeight: 600,
                    fontSize: '13px', border: '1px solid #d1d5db', cursor: 'pointer',
                    backgroundColor: 'white', color: '#374151',
                  }}
                >
                  Cancelar
                </button>
              </div>
            </>
          )}

          {/* ── Paso 3: Done ── */}
          {step === 'done' && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
              <p style={{ fontSize: '15px', fontWeight: 700, marginBottom: '8px', color: '#166534' }}>
                Cambio procesado
              </p>
              <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '24px' }}>{doneMsg}</p>
              <button
                onClick={reset}
                style={{
                  padding: '10px 24px', borderRadius: '8px', fontWeight: 700,
                  fontSize: '13px', border: 'none', cursor: 'pointer',
                  backgroundColor: '#2563eb', color: 'white',
                }}
              >
                🔄 Procesar otro
              </button>
            </div>
          )}
        </div>

        {/* Panel derecho: historial */}
        <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>
            Últimos cambios procesados
          </h2>
          {loadingHistory ? (
            <p style={{ fontSize: '13px', color: '#9ca3af' }}>Cargando...</p>
          ) : history.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#9ca3af', textAlign: 'center', padding: '32px 0' }}>
              Aún no hay cambios registrados
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {history.map(rec => (
                <div key={rec.id} style={{
                  padding: '10px 12px', borderRadius: '8px',
                  backgroundColor: '#f9fafb', border: '1px solid #f3f4f6',
                  fontSize: '12px',
                }}>
                  <div style={{ fontWeight: 700, marginBottom: '2px' }}>{rec.product_name}</div>
                  <div style={{ color: '#6b7280' }}>
                    {rec.customer_name ?? 'Sin cliente'} · Venta #{rec.sale_id} · {fmt(rec.amount)}
                  </div>
                  <div style={{ color: '#9ca3af', marginTop: '2px' }}>{fmtDate(rec.created_at)}</div>
                  {rec.notes && <div style={{ color: '#6b7280', fontStyle: 'italic', marginTop: '2px' }}>{rec.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
      <span style={{ color: '#6b7280' }}>{label}:</span>
      <span style={{ fontWeight: bold ? 700 : 400 }}>{value}</span>
    </div>
  )
}
