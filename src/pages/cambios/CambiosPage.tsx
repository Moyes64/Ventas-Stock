import { useState, useEffect, useRef } from 'react'
import { cambios, credits } from '../../lib/ipc'
import type { ExchangePreview, ExchangeRecord, Product } from '../../types/ipc'
import FreeExchangeTab from './FreeExchangeTab'
import ProductSearchBox from './ProductSearchBox'
import { MONEY_METHODS } from './paymentMethods'
import { formatDateTime, formatDate } from '../../lib/date'

type Step = 'scan' | 'preview' | 'done'
type Mode = 'ticket' | 'sinTicket'

export default function CambiosPage() {
  const [mode, setMode] = useState<Mode>('ticket')
  const [step, setStep] = useState<Step>('scan')
  const [rawQr, setRawQr] = useState('')
  const [preview, setPreview] = useState<ExchangePreview | null>(null)
  const [notes, setNotes] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [doneMsg, setDoneMsg] = useState('')
  const [history, setHistory] = useState<ExchangeRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  // Producto de reemplazo opcional (igual que en "Sin ticket")
  const [newProduct, setNewProduct] = useState<Product | null>(null)
  const [newQty, setNewQty] = useState(1)
  const [newUnitPrice, setNewUnitPrice] = useState(0)
  const [settlementMethod, setSettlementMethod] = useState('contado_efectivo')
  const [creditBalance, setCreditBalance] = useState<number | null>(null)

  useEffect(() => {
    void loadHistory()
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (preview?.ok && preview.customerId) {
      credits.getBalance(preview.customerId).then(setCreditBalance).catch(() => setCreditBalance(null))
    } else {
      setCreditBalance(null)
    }
  }, [preview])

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

  const newTotal = newProduct ? Math.round(newQty * newUnitPrice * 100) / 100 : 0
  const difference = Math.round((newTotal - (preview?.amount ?? 0)) * 100) / 100
  const favorsCustomer = !!newProduct && difference < -0.009
  const favorsStore = !!newProduct && difference > 0.009

  async function handleConfirm() {
    if (!rawQr || confirming) return
    if (favorsStore && settlementMethod === 'credito_cliente' && !preview?.customerId) {
      setPreview(p => p ? { ...p, ok: false, error: 'Para pagar con crédito de cliente hay que identificar al cliente en la venta original' } : null)
      return
    }
    setConfirming(true)
    try {
      const res = await cambios.confirm({
        rawQr: rawQr.trim(),
        notes: notes.trim() || undefined,
        newItem: newProduct ? { productId: newProduct.id, quantity: newQty, unitPrice: newUnitPrice } : null,
        settlementMethod: favorsStore ? settlementMethod : undefined,
      })
      if (res.ok) {
        const diff = res.difference ?? 0
        setDoneMsg(
          newProduct
            ? diff > 0.009
              ? `✅ Cambio registrado. El cliente pagó ${fmt(diff)} de diferencia.`
              : diff < -0.009
                ? `✅ Cambio registrado. Se devolvieron ${fmt(Math.abs(diff))} en efectivo desde Caja.`
                : `✅ Cambio registrado. Sin diferencia a saldar.`
            : res.creditId
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
    setNewProduct(null)
    setNewQty(1)
    setNewUnitPrice(0)
    setSettlementMethod('contado_efectivo')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function fmt(n: number) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">🔄 Cambios y Devoluciones</h1>
          <p className="page-subtitle">
            {mode === 'ticket'
              ? 'Escaneá el QR del ticket de cambio para procesar'
              : 'Escaneá el producto que devuelve el cliente y el que se lleva a cambio'}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button
          onClick={() => setMode('ticket')}
          style={{
            padding: '8px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '13px',
            border: mode === 'ticket' ? '1px solid #2563eb' : '1px solid #d1d5db', cursor: 'pointer',
            backgroundColor: mode === 'ticket' ? '#2563eb' : 'white',
            color: mode === 'ticket' ? 'white' : '#374151',
          }}
        >
          🎫 Con ticket
        </button>
        <button
          onClick={() => setMode('sinTicket')}
          style={{
            padding: '8px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '13px',
            border: mode === 'sinTicket' ? '1px solid #2563eb' : '1px solid #d1d5db', cursor: 'pointer',
            backgroundColor: mode === 'sinTicket' ? '#2563eb' : 'white',
            color: mode === 'sinTicket' ? 'white' : '#374151',
          }}
        >
          📦 Sin ticket
        </button>
      </div>

      {mode === 'sinTicket' ? (
        <FreeExchangeTab />
      ) : (
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
                <Row label="Venta N°" value={`#${preview.saleId} — ${formatDate(preview.saleDate)}`} />
                <Row label="Cliente" value={preview.customerName ?? '—'} />
                <Row label="Producto" value={preview.productName ?? '—'} bold />
                <Row label="Cantidad" value={String(preview.qty ?? 1)} />
                <Row label="Importe" value={fmt(preview.amount ?? 0)} bold />
                <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '4px', paddingTop: '8px' }}>
                  <Row label="Vto. cambio" value={preview.vencimiento ? formatDate(preview.vencimiento) : '—'} />
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

              {/* Producto de reemplazo opcional */}
              <div style={{
                border: '1px solid #2563eb33', borderRadius: '10px', padding: '14px',
                backgroundColor: '#2563eb0d', marginBottom: '16px',
              }}>
                <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px', color: '#2563eb' }}>
                  🛍️ Producto de reemplazo
                </h3>
                <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '10px' }}>
                  Lo que el cliente se lleva a cambio (opcional)
                </p>
                {!newProduct ? (
                  <ProductSearchBox
                    onPick={p => { setNewProduct(p); setNewQty(1); setNewUnitPrice(p.price) }}
                    placeholder="Código de barras o nombre del producto..."
                  />
                ) : (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'white',
                    padding: '6px 8px', borderRadius: '6px', border: '1px solid #e5e7eb',
                  }}>
                    <span style={{ flex: 1, fontSize: '12px', fontWeight: 600 }}>{newProduct.name}</span>
                    <input
                      type="number" min={1} value={newQty}
                      onChange={e => setNewQty(Math.max(1, Number(e.target.value) || 1))}
                      style={{ width: '44px', fontSize: '12px', padding: '3px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                    />
                    <span style={{ fontSize: '11px', color: '#9ca3af' }}>×</span>
                    <input
                      type="number" min={0} step="0.01" value={newUnitPrice}
                      onChange={e => setNewUnitPrice(Math.max(0, Number(e.target.value) || 0))}
                      style={{ width: '72px', fontSize: '12px', padding: '3px', border: '1px solid #d1d5db', borderRadius: '4px' }}
                    />
                    <span style={{ fontSize: '12px', fontWeight: 700, minWidth: '64px', textAlign: 'right' }}>
                      {fmt(newTotal)}
                    </span>
                    <button
                      onClick={() => { setNewProduct(null); setNewQty(1); setNewUnitPrice(0) }}
                      style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '13px' }}
                    >✕</button>
                  </div>
                )}
              </div>

              {/* Diferencia, si hay producto de reemplazo */}
              {newProduct && (
                <div style={{
                  backgroundColor: favorsCustomer ? '#f0fdf4' : favorsStore ? '#eff6ff' : '#f9fafb',
                  border: `1px solid ${favorsCustomer ? '#bbf7d0' : favorsStore ? '#bfdbfe' : '#e5e7eb'}`,
                  borderRadius: '8px', padding: '12px 14px', marginBottom: '16px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                    <span>Devuelto</span><span>{fmt(preview.amount ?? 0)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
                    <span>Nuevo</span><span>{fmt(newTotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 700, borderTop: '1px solid #d1d5db', paddingTop: '8px' }}>
                    <span>{favorsCustomer ? 'A favor del cliente' : favorsStore ? 'Paga el cliente' : 'Diferencia'}</span>
                    <span>{fmt(Math.abs(difference))}</span>
                  </div>
                </div>
              )}

              {favorsCustomer && (
                <p style={{ fontSize: '12px', color: '#166534', marginBottom: '16px' }}>
                  💵 Se devuelve en efectivo desde Caja al confirmar.
                </p>
              )}

              {favorsStore && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                    ¿Cómo paga el cliente la diferencia?
                  </label>
                  <select
                    value={settlementMethod}
                    onChange={e => setSettlementMethod(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
                  >
                    {MONEY_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    {preview.customerId && creditBalance !== null && creditBalance > 0 && (
                      <option value="credito_cliente">Crédito de cliente (saldo: {fmt(creditBalance)})</option>
                    )}
                  </select>
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
                  <div style={{ fontWeight: 700, marginBottom: '2px' }}>
                    ↩️ {rec.product_name}
                    {rec.new_product_name && <> → 🛍️ {rec.new_product_name}</>}
                  </div>
                  <div style={{ color: '#6b7280' }}>
                    {rec.customer_name ?? 'Sin cliente'} · Venta #{rec.sale_id} · {fmt(rec.amount)}
                    {rec.new_product_name && rec.new_total != null && ` · Nuevo: ${fmt(rec.new_total)}`}
                    {rec.new_product_name && rec.difference !== 0 && ` · Diferencia: ${fmt(Math.abs(rec.difference))} ${rec.difference > 0 ? '(pagó cliente)' : '(a favor cliente)'}`}
                  </div>
                  <div style={{ color: '#9ca3af', marginTop: '2px' }}>{formatDateTime(rec.created_at)}</div>
                  {rec.notes && <div style={{ color: '#6b7280', fontStyle: 'italic', marginTop: '2px' }}>{rec.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}
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
