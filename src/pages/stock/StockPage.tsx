import { useEffect, useRef, useState } from 'react'
import { stock as stockApi, suppliers as suppliersApi, catalog } from '../../lib/ipc'
import type { StockItem, StockMovement, Supplier, Product } from '../../types/ipc'

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  ENTRY: '📥 Entrada',
  EXIT: '📤 Salida',
  ADJUSTMENT: '🔧 Ajuste',
  SALE: '🛒 Venta',
  PURCHASE_RETURN: '↩️ Dev. Compra',
}

function EntryForm({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [products, setProducts] = useState<Product[]>([])
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState({
    productId: '' as number | '',
    quantity: 1,
    voucherType: 'FACTURA',
    voucherNumber: '',
    voucherDate: today,
    supplierId: '' as number | '',
  })

  useEffect(() => {
    async function loadData() {
      try {
        const [prods, sups] = await Promise.all([
          catalog.listProducts(true),
          suppliersApi.list(true),
        ])
        setProducts(prods)
        setSuppliersList(sups)
      } catch {
        // non-critical
      } finally {
        setLoadingData(false)
      }
    }
    void loadData()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.productId === '') {
      setError('Seleccione un producto')
      return
    }
    if (form.supplierId === '') {
      setError('Seleccione un proveedor')
      return
    }
    if (!form.voucherNumber.trim()) {
      setError('Ingrese el número de comprobante')
      return
    }
    if (!form.voucherDate) {
      setError('Ingrese la fecha del comprobante')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await stockApi.addMovement({
        productId: Number(form.productId),
        type: 'ENTRY',
        quantity: form.quantity,
        voucherType: form.voucherType,
        voucherNumber: form.voucherNumber.trim(),
        voucherDate: form.voucherDate,
        supplierId: Number(form.supplierId),
        notes: `Ingreso por ${form.voucherType} ${form.voucherNumber.trim()}`,
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar el ingreso')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>Ingresar Stock</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        {loadingData ? (
          <p>Cargando datos...</p>
        ) : (
          <form onSubmit={e => void handleSubmit(e)} className="form">
            <div className="form-row">
              <label className="label">Producto *</label>
              <select
                value={form.productId}
                onChange={e => setForm({ ...form, productId: e.target.value === '' ? '' : Number(e.target.value) })}
                required
                className="input"
              >
                <option value="">— Seleccionar producto —</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <label className="label">Cantidad *</label>
              <input
                type="number"
                value={form.quantity}
                onChange={e => setForm({ ...form, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                min="1"
                required
                className="input"
              />
            </div>

            <div className="form-row">
              <label className="label">Tipo de comprobante *</label>
              <select
                value={form.voucherType}
                onChange={e => setForm({ ...form, voucherType: e.target.value })}
                required
                className="input"
              >
                <option value="FACTURA">FACTURA</option>
                <option value="REMITO">REMITO</option>
              </select>
            </div>

            <div className="form-row">
              <label className="label">Número de comprobante *</label>
              <input
                type="text"
                value={form.voucherNumber}
                onChange={e => setForm({ ...form, voucherNumber: e.target.value })}
                required
                className="input"
                placeholder="Ej: 0001-00012345"
              />
            </div>

            <div className="form-row">
              <label className="label">Fecha del comprobante *</label>
              <input
                type="date"
                value={form.voucherDate}
                onChange={e => setForm({ ...form, voucherDate: e.target.value })}
                required
                className="input"
              />
            </div>

            <div className="form-row">
              <label className="label">Proveedor *</label>
              <select
                value={form.supplierId}
                onChange={e => setForm({ ...form, supplierId: e.target.value === '' ? '' : Number(e.target.value) })}
                required
                className="input"
              >
                <option value="">— Seleccionar proveedor —</option>
                {suppliersList.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {error && <p className="error">{error}</p>}
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando...' : 'Registrar ingreso'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default function StockPage() {
  const [stockItems, setStockItems] = useState<StockItem[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [activeTab, setActiveTab] = useState<'stock' | 'movements'>('stock')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterLow, setFilterLow] = useState(false)
  const [showEntryForm, setShowEntryForm] = useState(false)

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
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => setShowEntryForm(true)}>+ Ingresar Stock</button>
          <button className="btn btn-secondary" onClick={() => void loadData()}>↺ Actualizar</button>
        </div>
      </div>

      {showEntryForm && (
        <EntryForm
          onClose={() => setShowEntryForm(false)}
          onSaved={() => void loadData()}
        />
      )}

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
                <th>Fecha mov.</th>
                <th>Producto</th>
                <th>Tipo mov.</th>
                <th>Comprobante</th>
                <th>Fecha comp.</th>
                <th>Proveedor</th>
                <th>Cantidad</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {movements.map(m => (
                <tr key={m.id}>
                  <td>{new Date(m.createdAt).toLocaleDateString('es-AR')}</td>
                  <td>{m.productName}</td>
                  <td>{MOVEMENT_TYPE_LABELS[m.type] ?? m.type}</td>
                  <td>
                    {m.voucherType && m.voucherNumber
                      ? `${m.voucherType} ${m.voucherNumber}`
                      : m.referenceType
                        ? `${m.referenceType}${m.referenceId ? ` #${m.referenceId}` : ''}`
                        : '—'}
                  </td>
                  <td>
                    {m.voucherDate
                      ? (() => {
                          const [y, mo, d] = m.voucherDate.split('-').map(Number)
                          return new Date(y, mo - 1, d).toLocaleDateString('es-AR')
                        })()
                      : '—'}
                  </td>
                  <td>{m.supplierName ?? '—'}</td>
                  <td className={m.quantity < 0 ? 'qty-negative' : 'qty-positive'}>
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </td>
                  <td>{m.notes || '—'}</td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr><td colSpan={8} className="empty-row">Sin movimientos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
