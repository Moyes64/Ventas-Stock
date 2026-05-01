import { useEffect, useState } from 'react'
import { catalog } from '../../lib/ipc'
import type { Product } from '../../types/ipc'

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)

  async function loadProducts() {
    setLoading(true)
    try {
      const data = search.length >= 2
        ? await catalog.searchProducts(search)
        : await catalog.listProducts()
      setProducts(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar productos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadProducts() }, [search])

  async function handleDelete(id: number) {
    if (!window.confirm('¿Desactivar este producto?')) return
    try {
      await catalog.deleteProduct(id)
      await loadProducts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  const currency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Catálogo de Productos</h1>
        <button className="btn btn-primary" onClick={() => { setEditProduct(null); setShowForm(true) }}>
          + Nuevo Producto
        </button>
      </div>

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Buscar por nombre, SKU o código de barras..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input input--search"
        />
      </div>

      {loading && <p>Cargando...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Código Barras</th>
                <th>Nombre</th>
                <th>Precio</th>
                <th>Costo</th>
                <th>Stock</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.id} className={!p.active ? 'row--inactive' : ''}>
                  <td><code>{p.sku}</code></td>
                  <td><code>{p.barcode ?? '—'}</code></td>
                  <td>{p.name}</td>
                  <td>{currency(p.price)}</td>
                  <td>{currency(p.cost)}</td>
                  <td className={p.stockQuantity <= p.stockMin && p.stockMin > 0 ? 'stock-low' : ''}>
                    {p.stockQuantity}
                    {p.stockMin > 0 && <small> (mín: {p.stockMin})</small>}
                  </td>
                  <td>
                    <span className={p.active ? 'badge badge--success' : 'badge badge--danger'}>
                      {p.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => { setEditProduct(p); setShowForm(true) }}
                    >Editar</button>
                    {p.active && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(p.id)}
                      >Desactivar</button>
                    )}
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={8} className="empty-row">Sin productos</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <ProductForm
          product={editProduct}
          onClose={() => setShowForm(false)}
          onSaved={loadProducts}
        />
      )}
    </div>
  )
}

function ProductForm({
  product,
  onClose,
  onSaved,
}: {
  product: Product | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    name: product?.name ?? '',
    description: product?.description ?? '',
    price: product?.price ?? 0,
    cost: product?.cost ?? 0,
    taxRateId: product?.taxRateId ?? 1,
    stockMin: product?.stockMin ?? 0,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (product) {
        await catalog.updateProduct(product.id, form)
      } else {
        await catalog.createProduct(form)
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>{product ? 'Editar Producto' : 'Nuevo Producto'}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="form">
          <div className="form-row">
            <label className="label">SKU *</label>
            <input
              type="text"
              value={form.sku}
              onChange={e => setForm({ ...form, sku: e.target.value })}
              required
              className="input"
              disabled={!!product}
            />
          </div>
          <div className="form-row">
            <label className="label">Código de barras</label>
            <input
              type="text"
              value={form.barcode}
              onChange={e => setForm({ ...form, barcode: e.target.value })}
              className="input"
            />
          </div>
          <div className="form-row">
            <label className="label">Nombre *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
              className="input"
            />
          </div>
          <div className="form-row">
            <label className="label">Precio venta (c/ IVA) *</label>
            <input
              type="number"
              value={form.price}
              onChange={e => setForm({ ...form, price: parseFloat(e.target.value) })}
              min="0"
              step="0.01"
              required
              className="input"
            />
          </div>
          <div className="form-row">
            <label className="label">Costo (s/ IVA)</label>
            <input
              type="number"
              value={form.cost}
              onChange={e => setForm({ ...form, cost: parseFloat(e.target.value) })}
              min="0"
              step="0.01"
              className="input"
            />
          </div>
          <div className="form-row">
            <label className="label">Stock mínimo</label>
            <input
              type="number"
              value={form.stockMin}
              onChange={e => setForm({ ...form, stockMin: parseInt(e.target.value, 10) })}
              min="0"
              className="input"
            />
          </div>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
