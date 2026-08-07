import { useEffect, useMemo, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { WebCategory, WebProduct, SaveWebProductInput, UnpublishedProduct } from '../types/contract'
import ProductImage from './ProductImage'

function toSaveInput(wp: WebProduct): SaveWebProductInput {
  return {
    productId: wp.productId,
    webCategoryId: wp.webCategoryId,
    visible: wp.visible,
    featured: wp.featured,
    featuredOrder: wp.featuredOrder,
    webPrice: wp.webPrice,
    shortDescription: wp.shortDescription,
    longDescription: wp.longDescription,
    ageMin: wp.ageMin,
    playersMin: wp.playersMin,
    playersMax: wp.playersMax,
    playTimeMin: wp.playTimeMin,
    difficulty: wp.difficulty,
    videoUrl: wp.videoUrl,
    tags: wp.tags,
    sortOrder: wp.sortOrder,
  }
}

export default function ProductListView({ onEditProduct }: { onEditProduct: (productId: number) => void }) {
  const [products, setProducts] = useState<WebProduct[]>([])
  const [categories, setCategories] = useState<WebCategory[]>([])
  const [unpublished, setUnpublished] = useState<UnpublishedProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showUnpublished, setShowUnpublished] = useState(false)

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [visFilter, setVisFilter] = useState<'all' | 'visible' | 'hidden'>('all')
  const [featuredOnly, setFeaturedOnly] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [p, c, u] = await Promise.all([api.listProducts(), api.listCategories(), api.listUnpublished()])
      setProducts(p)
      setCategories(c)
      setUnpublished(u)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al cargar el catálogo')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const filtered = useMemo(() => {
    let list = products
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(p => p.productName.toLowerCase().includes(q))
    }
    if (categoryFilter === 'none') list = list.filter(p => p.webCategoryId === null)
    else if (categoryFilter !== 'all') list = list.filter(p => p.webCategoryId === Number(categoryFilter))
    if (visFilter === 'visible') list = list.filter(p => p.visible)
    else if (visFilter === 'hidden') list = list.filter(p => !p.visible)
    if (featuredOnly) list = list.filter(p => p.featured).sort((a, b) => a.featuredOrder - b.featuredOrder)
    return list
  }, [products, search, categoryFilter, visFilter, featuredOnly])

  async function toggleVisible(wp: WebProduct) {
    try {
      await api.saveProduct({ ...toSaveInput(wp), visible: !wp.visible })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar')
    }
  }

  async function toggleFeatured(wp: WebProduct) {
    try {
      const featured = !wp.featured
      const featuredOrder = featured ? await api.getNextFeaturedOrder() : wp.featuredOrder
      await api.saveProduct({ ...toSaveInput(wp), featured, featuredOrder })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar')
    }
  }

  async function addProduct(u: UnpublishedProduct) {
    try {
      const sortOrder = await api.getNextSortOrder(null)
      await api.saveProduct({
        productId: u.id,
        webCategoryId: null,
        visible: false,
        featured: false,
        featuredOrder: 0,
        webPrice: null,
        shortDescription: '',
        longDescription: '',
        ageMin: null,
        playersMin: null,
        playersMax: null,
        playTimeMin: null,
        difficulty: null,
        videoUrl: '',
        tags: '',
        sortOrder,
      })
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al agregar')
    }
  }

  if (loading) return <p className="muted">Cargando...</p>

  return (
    <div>
      {error && <p className="error">{error}</p>}

      <div className="panel">
        <div className="filters">
          <input placeholder="Buscar por nombre..." value={search} onChange={e => setSearch(e.target.value)} />
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="all">Todas las categorías</option>
            <option value="none">Sin categoría</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={visFilter} onChange={e => setVisFilter(e.target.value as typeof visFilter)}>
            <option value="all">Publicados y ocultos</option>
            <option value="visible">Solo publicados</option>
            <option value="hidden">Solo ocultos</option>
          </select>
          <label className="toggle">
            <input type="checkbox" checked={featuredOnly} onChange={e => setFeaturedOnly(e.target.checked)} />
            Solo destacados
          </label>
          <button className="btn" onClick={() => setShowUnpublished(v => !v)}>
            {showUnpublished ? 'Ocultar' : '+ Agregar producto'}
          </button>
        </div>

        {showUnpublished && (
          <div className="panel" style={{ background: 'var(--bg)' }}>
            <h3>Productos del catálogo sin publicar</h3>
            {unpublished.length === 0 ? (
              <p className="muted">No hay productos pendientes de agregar.</p>
            ) : (
              <table>
                <thead><tr><th>Nombre</th><th>SKU</th><th>Proveedor</th><th></th></tr></thead>
                <tbody>
                  {unpublished.map(u => (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td className="muted">{u.sku}</td>
                      <td className="muted">{u.supplierName ?? '—'}</td>
                      <td><button className="btn btn-sm btn-primary" onClick={() => { void addProduct(u) }}>+ Agregar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div className="grid-cards">
        {filtered.map(p => (
          <div className="card" key={p.id}>
            <div className="card-thumb">
              {p.images[0] ? <ProductImage filename={p.images[0].filename} alt={p.productName} /> : <div className="img-placeholder" />}
            </div>
            <div className="card-body">
              <span className="card-name">{p.productName}</span>
              <span className={`badge ${p.visible ? 'badge--on' : 'badge--off'}`}>
                {p.visible ? 'Publicado' : 'Oculto'}
              </span>
              {p.featured && <span className="badge badge--on">★ Destacado</span>}
            </div>
            <div className="card-actions">
              <button className="btn btn-sm" onClick={() => onEditProduct(p.productId)}>Editar</button>
              <button className="btn btn-sm" onClick={() => { void toggleVisible(p) }}>
                {p.visible ? 'Ocultar' : 'Publicar'}
              </button>
              <button className="btn btn-sm" onClick={() => { void toggleFeatured(p) }}>
                {p.featured ? '☆' : '★'}
              </button>
            </div>
          </div>
        ))}
      </div>
      {filtered.length === 0 && <p className="muted">No hay productos que coincidan con el filtro.</p>}
    </div>
  )
}
