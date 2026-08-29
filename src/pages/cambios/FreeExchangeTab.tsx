import { useState, useEffect, useRef } from 'react'
import { catalog, customers, credits, freeExchange } from '../../lib/ipc'
import type { Product, Customer, FreeExchangeItemInput, FreeExchangeRecord } from '../../types/ipc'

interface CartLine {
  product: Product
  quantity: number
  unitPrice: number
}

const MONEY_METHODS: Array<{ value: string; label: string }> = [
  { value: 'contado_efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'qr', label: 'QR' },
  { value: 'mercadopago', label: 'Mercado Pago' },
]

function fmt(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
}

function toInput(items: FreeExchangeItemInput[] | CartLine[]): FreeExchangeItemInput[] {
  return (items as CartLine[]).map(i => ({
    productId: i.product.id,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
  }))
}

function CartSection({
  title,
  hint,
  lines,
  onScan,
  onQtyChange,
  onPriceChange,
  onRemove,
  scanQuery,
  setScanQuery,
  color,
}: {
  title: string
  hint: string
  lines: CartLine[]
  onScan: (query: string, opts?: { silent?: boolean }) => void
  onQtyChange: (productId: number, qty: number) => void
  onPriceChange: (productId: number, price: number) => void
  onRemove: (productId: number) => void
  scanQuery: string
  setScanQuery: (v: string) => void
  color: string
}) {
  const total = lines.reduce((acc, l) => acc + l.quantity * l.unitPrice, 0)
  return (
    <div style={{ border: `1px solid ${color}33`, borderRadius: '10px', padding: '14px', backgroundColor: `${color}0d` }}>
      <h3 style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px', color }}>{title}</h3>
      <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '10px' }}>{hint}</p>
      <input
        type="text"
        value={scanQuery}
        onChange={e => { setScanQuery(e.target.value); onScan(e.target.value, { silent: true }) }}
        onKeyDown={e => { if (e.key === 'Enter') onScan(scanQuery) }}
        placeholder="Escanear código de barras..."
        style={{
          width: '100%', padding: '8px 10px', borderRadius: '6px',
          border: '1px solid #d1d5db', fontSize: '13px', outline: 'none', marginBottom: '10px',
        }}
      />
      {lines.length === 0 ? (
        <p style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>Sin productos</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {lines.map(line => (
            <div key={line.product.id} style={{
              display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'white',
              padding: '6px 8px', borderRadius: '6px', border: '1px solid #e5e7eb',
            }}>
              <span style={{ flex: 1, fontSize: '12px', fontWeight: 600 }}>{line.product.name}</span>
              <input
                type="number" min={1} value={line.quantity}
                onChange={e => onQtyChange(line.product.id, Math.max(1, Number(e.target.value) || 1))}
                style={{ width: '44px', fontSize: '12px', padding: '3px', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
              <span style={{ fontSize: '11px', color: '#9ca3af' }}>×</span>
              <input
                type="number" min={0} step="0.01" value={line.unitPrice}
                onChange={e => onPriceChange(line.product.id, Math.max(0, Number(e.target.value) || 0))}
                style={{ width: '72px', fontSize: '12px', padding: '3px', border: '1px solid #d1d5db', borderRadius: '4px' }}
              />
              <span style={{ fontSize: '12px', fontWeight: 700, minWidth: '64px', textAlign: 'right' }}>
                {fmt(line.quantity * line.unitPrice)}
              </span>
              <button
                onClick={() => onRemove(line.product.id)}
                style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '13px' }}
              >✕</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: `1px solid ${color}33`, display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700 }}>
        <span>Total</span>
        <span>{fmt(total)}</span>
      </div>
    </div>
  )
}

export default function FreeExchangeTab() {
  const [customerList, setCustomerList] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState<number | ''>('')
  const [creditBalance, setCreditBalance] = useState<number | null>(null)

  const [returnedLines, setReturnedLines] = useState<CartLine[]>([])
  const [newLines, setNewLines] = useState<CartLine[]>([])
  const [returnScan, setReturnScan] = useState('')
  const [newScan, setNewScan] = useState('')

  const [settlementMethod, setSettlementMethod] = useState('contado_efectivo')
  const [notes, setNotes] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [doneMsg, setDoneMsg] = useState<string | null>(null)

  const [history, setHistory] = useState<FreeExchangeRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const returnInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void customers.list().then(setCustomerList).catch(() => {})
    void loadHistory()
  }, [])

  useEffect(() => {
    if (customerId) {
      credits.getBalance(customerId).then(setCreditBalance).catch(() => setCreditBalance(null))
    } else {
      setCreditBalance(null)
      setSettlementMethod(m => m === 'credito_cliente' ? 'contado_efectivo' : m)
    }
  }, [customerId])

  async function loadHistory() {
    setLoadingHistory(true)
    try {
      setHistory(await freeExchange.list(30))
    } finally {
      setLoadingHistory(false)
    }
  }

  async function scanInto(
    query: string,
    setLines: React.Dispatch<React.SetStateAction<CartLine[]>>,
    clear: () => void,
    opts?: { silent?: boolean }
  ) {
    const q = query.trim()
    if (!q) return
    try {
      const product = await catalog.getByBarcode(q)
      if (!product) {
        // En modo silencioso (se dispara en cada tecla mientras se escanea) un código
        // incompleto es normal y no debe mostrarse como error — solo se avisa cuando
        // el usuario confirma explícitamente con Enter y el código completo no existe.
        if (!opts?.silent) {
          setError(`No se encontró ningún producto con el código "${q}"`)
        }
        return
      }
      setLines(prev => {
        const existing = prev.find(l => l.product.id === product.id)
        if (existing) {
          return prev.map(l => l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l)
        }
        return [...prev, { product, quantity: 1, unitPrice: product.price }]
      })
      setError(null)
      clear()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const returnedTotal = returnedLines.reduce((acc, l) => acc + l.quantity * l.unitPrice, 0)
  const newTotal = newLines.reduce((acc, l) => acc + l.quantity * l.unitPrice, 0)
  const difference = Math.round((newTotal - returnedTotal) * 100) / 100
  const favorsCustomer = difference < -0.009
  const favorsStore = difference > 0.009

  async function handleConfirm() {
    if (returnedLines.length === 0) {
      setError('Escaneá al menos un producto devuelto')
      return
    }
    if (favorsStore && settlementMethod === 'credito_cliente' && !customerId) {
      setError('Para pagar con crédito de cliente hay que elegir un cliente')
      return
    }
    setConfirming(true)
    setError(null)
    try {
      const res = await freeExchange.confirm({
        customerId: customerId || null,
        returnedItems: toInput(returnedLines),
        newItems: toInput(newLines),
        settlementMethod: favorsStore ? settlementMethod : undefined,
        notes: notes.trim() || undefined,
      })
      if (!res.ok) {
        setError(res.error ?? 'No se pudo registrar la operación')
        return
      }
      const diff = res.difference ?? 0
      setDoneMsg(
        diff > 0.009
          ? `✅ Operación #${res.id} registrada. El cliente pagó ${fmt(diff)} de diferencia.`
          : diff < -0.009
            ? `✅ Operación #${res.id} registrada. Se devolvieron ${fmt(Math.abs(diff))} en efectivo desde Caja.`
            : `✅ Operación #${res.id} registrada. Sin diferencia a saldar.`
      )
      setReturnedLines([])
      setNewLines([])
      setNotes('')
      setSettlementMethod('contado_efectivo')
      await loadHistory()
    } finally {
      setConfirming(false)
    }
  }

  function reset() {
    setDoneMsg(null)
    setError(null)
    setTimeout(() => returnInputRef.current?.focus(), 50)
  }

  if (doneMsg) {
    return (
      <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
        <p style={{ fontSize: '14px', color: '#166534', marginBottom: '20px' }}>{doneMsg}</p>
        <button
          onClick={reset}
          style={{ padding: '10px 24px', borderRadius: '8px', fontWeight: 700, fontSize: '13px', border: 'none', cursor: 'pointer', backgroundColor: '#2563eb', color: 'white' }}
        >
          🔄 Procesar otra
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
      <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Devolución sin ticket de cambio</h2>
        <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '16px' }}>
          Escaneá lo que trae el cliente y lo que se lleva a cambio. El sistema calcula la diferencia.
        </p>

        {error && (
          <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', fontSize: '13px', color: '#dc2626' }}>
            ⚠️ {error}
          </div>
        )}

        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>
            Cliente (opcional)
          </label>
          <select
            value={customerId}
            onChange={e => setCustomerId(e.target.value ? Number(e.target.value) : '')}
            style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px' }}
          >
            <option value="">Consumidor Final</option>
            {customerList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {customerId && creditBalance !== null && creditBalance > 0 && (
            <p style={{ fontSize: '11px', color: '#16a34a', marginTop: '4px' }}>
              Saldo a favor disponible: {fmt(creditBalance)}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '16px' }}>
          <CartSection
            title="↩️ Producto(s) devuelto(s)"
            hint="Precio de lista, editable si corresponde"
            lines={returnedLines}
            onScan={(q, opts) => void scanInto(q, setReturnedLines, () => setReturnScan(''), opts)}
            onQtyChange={(id, qty) => setReturnedLines(prev => prev.map(l => l.product.id === id ? { ...l, quantity: qty } : l))}
            onPriceChange={(id, price) => setReturnedLines(prev => prev.map(l => l.product.id === id ? { ...l, unitPrice: price } : l))}
            onRemove={id => setReturnedLines(prev => prev.filter(l => l.product.id !== id))}
            scanQuery={returnScan}
            setScanQuery={setReturnScan}
            color="#dc2626"
          />
          <CartSection
            title="🛍️ Producto(s) nuevo(s)"
            hint="Lo que el cliente se lleva a cambio (opcional)"
            lines={newLines}
            onScan={(q, opts) => void scanInto(q, setNewLines, () => setNewScan(''), opts)}
            onQtyChange={(id, qty) => setNewLines(prev => prev.map(l => l.product.id === id ? { ...l, quantity: qty } : l))}
            onPriceChange={(id, price) => setNewLines(prev => prev.map(l => l.product.id === id ? { ...l, unitPrice: price } : l))}
            onRemove={id => setNewLines(prev => prev.filter(l => l.product.id !== id))}
            scanQuery={newScan}
            setScanQuery={setNewScan}
            color="#2563eb"
          />
        </div>

        <div style={{
          backgroundColor: favorsCustomer ? '#f0fdf4' : favorsStore ? '#eff6ff' : '#f9fafb',
          border: `1px solid ${favorsCustomer ? '#bbf7d0' : favorsStore ? '#bfdbfe' : '#e5e7eb'}`,
          borderRadius: '8px', padding: '12px 14px', marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
            <span>Devuelto</span><span>{fmt(returnedTotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px' }}>
            <span>Nuevo</span><span>{fmt(newTotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 700, borderTop: '1px solid #d1d5db', paddingTop: '8px' }}>
            <span>{favorsCustomer ? 'A favor del cliente' : favorsStore ? 'Paga el cliente' : 'Diferencia'}</span>
            <span>{fmt(Math.abs(difference))}</span>
          </div>
        </div>

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
              {customerId && creditBalance !== null && creditBalance > 0 && (
                <option value="credito_cliente">Crédito de cliente (saldo: {fmt(creditBalance)})</option>
              )}
            </select>
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: '4px' }}>
            Observaciones (opcional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Ej: producto con defecto de fábrica"
            style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '13px', outline: 'none' }}
          />
        </div>

        <button
          onClick={() => void handleConfirm()}
          disabled={confirming || returnedLines.length === 0}
          style={{
            width: '100%', padding: '10px', borderRadius: '8px', fontWeight: 700,
            fontSize: '13px', border: 'none', cursor: (confirming || returnedLines.length === 0) ? 'not-allowed' : 'pointer',
            backgroundColor: (confirming || returnedLines.length === 0) ? '#9ca3af' : '#16a34a', color: 'white',
          }}
        >
          {confirming ? '⏳ Procesando...' : '✅ Confirmar operación'}
        </button>
      </div>

      <div style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px' }}>Últimas devoluciones sin ticket</h2>
        {loadingHistory ? (
          <p style={{ fontSize: '13px', color: '#9ca3af' }}>Cargando...</p>
        ) : history.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#9ca3af', textAlign: 'center', padding: '32px 0' }}>
            Aún no hay operaciones registradas
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {history.map(rec => (
              <div key={rec.id} style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: '#f9fafb', border: '1px solid #f3f4f6', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: '2px' }}>
                  <span>#{rec.id} · {rec.customer_name ?? 'Consumidor Final'}</span>
                  <span style={{ color: rec.difference > 0 ? '#2563eb' : rec.difference < 0 ? '#16a34a' : '#6b7280' }}>
                    {rec.difference === 0 ? 'Sin diferencia' : fmt(Math.abs(rec.difference))}
                  </span>
                </div>
                <div style={{ color: '#6b7280' }}>
                  Devuelto: {fmt(rec.returned_total)} · Nuevo: {fmt(rec.new_total)}
                  {rec.settlement_method && ` · ${rec.settlement_method}`}
                </div>
                <div style={{ color: '#9ca3af', marginTop: '2px' }}>
                  {new Date(rec.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </div>
                {rec.notes && <div style={{ color: '#6b7280', fontStyle: 'italic', marginTop: '2px' }}>{rec.notes}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
