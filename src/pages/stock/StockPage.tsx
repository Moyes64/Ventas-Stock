import { useEffect, useRef, useState } from 'react'
import { stock as stockApi } from '../../lib/ipc'
import type { StockItem, StockMovement } from '../../types/ipc'

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  ENTRY: '📥 Entrada',
  EXIT: '📤 Salida',
  ADJUSTMENT: '🔧 Ajuste',
  SALE: '🛒 Venta',
  PURCHASE_RETURN: '↩️ Dev. Compra',
}

export default function StockPage() {
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [activeTab, setActiveTab] = useState<'stock' | 'movements'>('stock')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterLow, setFilterLow] = useState(false)

  // Inline-edit state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void loadData()
    return () => {
      if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current)
    }
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [items, mvts] = await Promise.all([
        stockApi.getItems(),
        stockApi.getMovements({ limit: 100 }),
      ])
      setStockItems(items)
      setMovements(mvts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar stock')
    } finally {
      setLoading(false)
    }
  }

  function startEdit(item: StockItem) {
    setEditingId(item.productId)
    setEditValue(String(item.currentStock))
    setSaveError(null)
    // Focus input on next render
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditValue('')
    setSaveError(null)
  }

  async function saveEdit(productId: number) {
    const trimmed = editValue.trim()
    if (trimmed === '') {
      setSaveError('Ingrese un valor')
      return
    }
    const parsed = Number(trimmed)
    if (!Number.isInteger(parsed) || parsed < 0) {
      setSaveError('Debe ser un número entero no negativo')
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      await stockApi.adjustStock(productId, parsed)
      setEditingId(null)
      setEditValue('')
      setToast({ type: 'success', text: 'Stock actualizado correctamente' })
      if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current)
      toastTimerRef.current = setTimeout(() => setToast(null), 4000)
      await loadData()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent, productId: number) {
    if (e.key === 'Enter') void saveEdit(productId)
    if (e.key === 'Escape') cancelEdit()
  }

  const displayedItems = filterLow ? stockItems.filter(i => i.isLow) : stockItems

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Control de Stock</h1>
        <button className="btn btn-secondary" onClick={() => void loadData()}>↺ Actualizar</button>
      </div>

      {toast && (
        <div className={`alert alert--${toast.type}`}>
          {toast.text}
        </div>
      )}

      <div className="tab-bar">
        <button
          className={`tab ${activeTab === 'stock' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('stock')}
        >
          Niveles de Stock ({stockItems.filter(i => i.isLow).length} bajos)
        </button>
        <button
          className={`tab ${activeTab === 'movements' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('movements')}
        >
          Movimientos
        </button>
      </div>

      {loading && <p>Cargando...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && activeTab === 'stock' && (
        <>
          <label className="filter-check">
            <input
              type="checkbox"
              checked={filterLow}
              onChange={e => setFilterLow(e.target.checked)}
            />
            Mostrar solo productos con stock bajo
          </label>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Código Barras</th>
                  <th>Stock Actual</th>
                  <th>Stock Mínimo</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {displayedItems.map(item => (
                  <tr key={item.productId} className={item.isLow ? 'row--warning' : ''}>
                    <td><code>{item.sku}</code></td>
                    <td>{item.productName}</td>
                    <td><code>{item.barcode ?? '—'}</code></td>
                    <td className={item.isLow ? 'stock-low' : ''}>
                      {editingId === item.productId ? (
                        <div className="stock-edit-cell">
                          <input
                            ref={inputRef}
                            type="number"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => handleKeyDown(e, item.productId)}
                            className="input input--stock-edit"
                            disabled={saving}
                          />
                          {saveError && <span className="stock-edit-error">{saveError}</span>}
                        </div>
                      ) : (
                        item.currentStock
                      )}
                    </td>
                    <td>{item.stockMin}</td>
                    <td>
                      {item.isLow ? (
                        <span className="badge badge--warning">⚠️ Bajo</span>
                      ) : (
                        <span className="badge badge--success">✓ OK</span>
                      )}
                    </td>
                    <td>
                      {editingId === item.productId ? (
                        <div className="action-group">
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => void saveEdit(item.productId)}
                            disabled={saving}
                          >
                            {saving ? '⏳' : '✓ Guardar'}
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={cancelEdit}
                            disabled={saving}
                          >
                            ✕ Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => startEdit(item)}
                          disabled={editingId !== null}
                        >
                          ✏️ Editar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {displayedItems.length === 0 && (
                  <tr><td colSpan={7} className="empty-row">Sin productos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && activeTab === 'movements' && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Referencia</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(m => (
                <tr key={m.id}>
                  <td>{new Date(m.createdAt).toLocaleDateString('es-AR')}</td>
                  <td>{m.productName}</td>
                  <td>{MOVEMENT_TYPE_LABELS[m.type] ?? m.type}</td>
                  <td className={m.quantity < 0 ? 'qty-negative' : 'qty-positive'}>
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </td>
                  <td>{m.referenceType ? `${m.referenceType} #${m.referenceId}` : '—'}</td>
                  <td>{m.notes || '—'}</td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr><td colSpan={6} className="empty-row">Sin movimientos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
