import { useEffect, useState } from 'react'
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

  useEffect(() => {
    loadData()
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

  const displayedItems = filterLow ? stockItems.filter(i => i.isLow) : stockItems

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Control de Stock</h1>
        <button className="btn btn-secondary" onClick={loadData}>↺ Actualizar</button>
      </div>

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
                </tr>
              </thead>
              <tbody>
                {displayedItems.map(item => (
                  <tr key={item.productId} className={item.isLow ? 'row--warning' : ''}>
                    <td><code>{item.sku}</code></td>
                    <td>{item.productName}</td>
                    <td><code>{item.barcode ?? '—'}</code></td>
                    <td className={item.isLow ? 'stock-low' : ''}>{item.currentStock}</td>
                    <td>{item.stockMin}</td>
                    <td>
                      {item.isLow ? (
                        <span className="badge badge--warning">⚠️ Bajo</span>
                      ) : (
                        <span className="badge badge--success">✓ OK</span>
                      )}
                    </td>
                  </tr>
                ))}
                {displayedItems.length === 0 && (
                  <tr><td colSpan={6} className="empty-row">Sin productos</td></tr>
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
