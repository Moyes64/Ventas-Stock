import { useEffect, useState } from 'react'
import { catalog, suppliers as suppliersApi } from '../../lib/ipc'
import type { Product, TaxRate, Supplier } from '../../types/ipc'

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

/** Calculates sale price: costo * (1 + ganancia/100) * (1 + iva/100) */
function calcSalePrice(cost: number, gainPct: number, ivaPct: number): number {
  return cost * (1 + gainPct / 100) * (1 + ivaPct / 100)
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
  const isNew = !product

  const [taxRates, setTaxRates] = useState<TaxRate[]>([])
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([])
  const [loadingData, setLoadingData] = useState(true)

  const [form, setForm] = useState({
    sku: product?.sku ?? '',
    barcode: product?.barcode ?? '',
    name: product?.name ?? '',
    description: product?.description ?? '',
    supplierId: product?.supplierId ?? ('' as number | ''),
    supplierCode: product?.supplierCode ?? '',
    cost: product?.cost ?? 0,
    taxRateId: product?.taxRateId ?? 0,
    gainPercent: product?.gainPercent ?? 0,
    stockMin: product?.stockMin ?? 0,
    initialStock: 0,
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Derived: selected IVA percentage
  const selectedTaxRate = taxRates.find(t => t.id === Number(form.taxRateId))
  const ivaPct = selectedTaxRate?.percentage ?? 0
  const computedPrice = calcSalePrice(form.cost, form.gainPercent, ivaPct)

  useEffect(() => {
    async function loadData() {
      try {
        const [rates, sups] = await Promise.all([
          catalog.getTaxRates(),
          suppliersApi.list(true),
        ])
        setTaxRates(rates)
        setSuppliersList(sups)
        // Set default taxRateId for new products once rates are loaded
        if (isNew && rates.length > 0 && form.taxRateId === 0) {
          // Prefer 21% if available, otherwise first rate
          const def = rates.find(r => r.percentage === 21) ?? rates[0]
          setForm(f => ({ ...f, taxRateId: def.id }))
        }
      } catch {
        // non-critical; form still works without dropdown data
      } finally {
        setLoadingData(false)
      }
    }
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (product) {
        await catalog.updateProduct(product.id, {
          sku: form.sku,
          barcode: form.barcode || undefined,
          name: form.name,
          description: form.description,
          supplierId: form.supplierId === '' ? undefined : Number(form.supplierId),
          supplierCode: form.supplierCode,
          cost: form.cost,
          price: computedPrice,
          taxRateId: Number(form.taxRateId),
          gainPercent: form.gainPercent,
          stockMin: form.stockMin,
        })
      } else {
        await catalog.createProduct({
          sku: form.sku,
          barcode: form.barcode || undefined,
          name: form.name,
          description: form.description,
          supplierId: form.supplierId === '' ? undefined : Number(form.supplierId),
          supplierCode: form.supplierCode,
          cost: form.cost,
          price: computedPrice,
          taxRateId: Number(form.taxRateId),
          gainPercent: form.gainPercent,
          stockMin: form.stockMin,
          initialStock: form.initialStock,
        })
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const currency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>{product ? 'Editar Producto' : 'Nuevo Producto'}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        {loadingData ? (
          <p style={{ padding: '1rem' }}>Cargando datos...</p>
        ) : (
          <form onSubmit={handleSubmit} className="form">
            {/* SKU */}
            <div className="form-row">
              <label className="label">SKU *</label>
              <input
                type="text"
                value={form.sku}
                onChange={e => setForm({ ...form, sku: e.target.value })}
                required
                className="input"
                disabled={!!product}
                placeholder="Código interno del producto"
              />
            </div>

            {/* Nombre */}
            <div className="form-row">
              <label className="label">Nombre *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                required
                className="input"
                placeholder="Nombre del producto"
              />
            </div>

            {/* Proveedor */}
            <div className="form-row">
              <label className="label">Proveedor *</label>
              <select
                value={form.supplierId}
                onChange={e => setForm({ ...form, supplierId: e.target.value === '' ? '' : Number(e.target.value) })}
                required
                className="input"
              >
                <option value="">— Seleccione un proveedor —</option>
                {suppliersList.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Código Proveedor */}
            <div className="form-row">
              <label className="label">Código Proveedor</label>
              <input
                type="text"
                value={form.supplierCode}
                onChange={e => setForm({ ...form, supplierCode: e.target.value })}
                className="input"
                placeholder="Código de referencia del proveedor"
              />
            </div>

            {/* Código de barras */}
            <div className="form-row">
              <label className="label">Código de barras</label>
              <input
                type="text"
                value={form.barcode}
                onChange={e => setForm({ ...form, barcode: e.target.value })}
                className="input"
                placeholder="EAN-13, Code128, etc."
              />
            </div>

            {/* Costo */}
            <div className="form-row">
              <label className="label">Costo (s/ IVA) *</label>
              <input
                type="number"
                value={form.cost}
                onChange={e => setForm({ ...form, cost: Number.isNaN(parseFloat(e.target.value)) ? form.cost : parseFloat(e.target.value) })}
                min="0"
                step="0.01"
                required
                className="input"
              />
            </div>

            {/* IVA */}
            <div className="form-row">
              <label className="label">IVA (%) *</label>
              <select
                value={form.taxRateId}
                onChange={e => setForm({ ...form, taxRateId: Number(e.target.value) })}
                required
                className="input"
              >
                {taxRates.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.percentage}%)</option>
                ))}
              </select>
            </div>

            {/* Ganancia */}
            <div className="form-row">
              <label className="label">Ganancia (%) *</label>
              <input
                type="number"
                value={form.gainPercent}
                onChange={e => setForm({ ...form, gainPercent: Number.isNaN(parseFloat(e.target.value)) ? form.gainPercent : parseFloat(e.target.value) })}
                min="0"
                step="0.1"
                required
                className="input"
                placeholder="Ej: 50"
              />
            </div>

            {/* Precio venta calculado */}
            <div className="form-row">
              <label className="label">Precio venta (c/ IVA)</label>
              <input
                type="text"
                value={currency(computedPrice)}
                readOnly
                className="input input--readonly"
                title="Calculado: Costo × (1 + Ganancia%) × (1 + IVA%)"
              />
              <small className="hint">
                {form.cost} × (1 + {form.gainPercent}%) × (1 + {ivaPct}%) = {currency(computedPrice)}
              </small>
            </div>

            {/* Stock mínimo */}
            <div className="form-row">
              <label className="label">Punto de reposición (stock mínimo)</label>
              <input
                type="number"
                value={form.stockMin}
                onChange={e => setForm({ ...form, stockMin: Number.isNaN(parseInt(e.target.value, 10)) ? form.stockMin : parseInt(e.target.value, 10) })}
                min="0"
                className="input"
                placeholder="0"
              />
            </div>

            {/* Stock inicial – solo en alta */}
            {isNew && (
              <div className="form-row">
                <label className="label">Stock inicial</label>
                <input
                  type="number"
                  value={form.initialStock}
                  onChange={e => setForm({ ...form, initialStock: Number.isNaN(parseInt(e.target.value, 10)) ? form.initialStock : parseInt(e.target.value, 10) })}
                  min="0"
                  className="input"
                  placeholder="0"
                />
                <small className="hint">Genera un movimiento de entrada en el historial de stock.</small>
              </div>
            )}

            {error && <p className="error">{error}</p>}
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
