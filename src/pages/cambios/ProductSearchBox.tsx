import { useState } from 'react'
import { catalog } from '../../lib/ipc'
import type { Product } from '../../types/ipc'

function fmt(n: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
}

/**
 * Buscador de producto por código de barras o parte del nombre, igual que el
 * campo "Buscar producto (nombre o código de barras)" de Nueva Venta: cada
 * tecla intenta un match exacto de código de barras (para lectores que
 * emulan teclado) y, si no hay match, busca por nombre y muestra un listado
 * para elegir.
 */
export default function ProductSearchBox({
  onPick,
  placeholder = 'Código de barras o nombre del producto...',
  autoFocus,
}: {
  onPick: (product: Product) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [error, setError] = useState<string | null>(null)

  async function handleChange(value: string, opts?: { fromEnter?: boolean }) {
    setQuery(value)
    const q = value.trim()
    if (!q) {
      setResults([])
      setError(null)
      return
    }
    try {
      const byBarcode = await catalog.getByBarcode(q)
      if (byBarcode) {
        pick(byBarcode)
        return
      }
      if (q.length < 2) {
        setResults([])
        return
      }
      const list = await catalog.searchProducts(q)
      setResults(list)
      if (opts?.fromEnter && list.length === 0) {
        setError(`No se encontró ningún producto con el código o nombre "${q}"`)
      } else {
        setError(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function pick(product: Product) {
    onPick(product)
    setQuery('')
    setResults([])
    setError(null)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={query}
        onChange={e => { void handleChange(e.target.value) }}
        onKeyDown={e => { if (e.key === 'Enter') void handleChange(query, { fromEnter: true }) }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{
          width: '100%', padding: '8px 10px', borderRadius: '6px',
          border: '1px solid #d1d5db', fontSize: '13px', outline: 'none',
        }}
      />
      {error && (
        <div style={{ marginTop: '6px', fontSize: '12px', color: '#dc2626' }}>⚠️ {error}</div>
      )}
      {results.length > 0 && (
        <ul style={{
          position: 'absolute', zIndex: 10, top: '100%', left: 0, right: 0, marginTop: '4px',
          backgroundColor: 'white', border: '1px solid #d1d5db', borderRadius: '8px',
          maxHeight: '220px', overflowY: 'auto', listStyle: 'none', padding: '4px', margin: 0,
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
        }}>
          {results.map(p => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => pick(p)}
                style={{
                  width: '100%', textAlign: 'left', padding: '6px 8px', border: 'none',
                  background: 'none', cursor: 'pointer', fontSize: '12px', borderRadius: '6px',
                  display: 'flex', justifyContent: 'space-between', gap: '8px',
                }}
              >
                <span style={{ fontWeight: 600 }}>{p.name}</span>
                <span style={{ color: '#6b7280', whiteSpace: 'nowrap' }}>{p.sku} · {fmt(p.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
