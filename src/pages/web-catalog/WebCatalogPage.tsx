import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { webCatalog } from '../../lib/ipc'
import type { WebProduct, WebCategory, UnpublishedProduct } from '../../types/ipc'

export default function WebCatalogPage() {
  const navigate = useNavigate()
  const [products, setProducts]         = useState<WebProduct[]>([])
  const [categories, setCategories]     = useState<WebCategory[]>([])
  const [unpublished, setUnpublished]   = useState<UnpublishedProduct[]>([])
  const [loading, setLoading]           = useState(true)

  // Los filtros viven en la URL (y no en useState) para que el botón "Volver"
  // del editor de producto restaure exactamente el mismo estado de la lista.
  const [searchParams, setSearchParams] = useSearchParams()
  const catParam = searchParams.get('cat')
  const filterCat: number | 'all' | 'none' =
    catParam === 'none' ? 'none' : catParam ? parseInt(catParam) : 'all'
  const filterVis = (searchParams.get('vis') as 'all' | 'visible' | 'hidden' | null) ?? 'all'
  const onlyFeatured = searchParams.get('featured') === '1'
  const search = searchParams.get('q') ?? ''

  function updateFilters(next: { cat?: string; vis?: string; featured?: boolean; q?: string }) {
    const sp = new URLSearchParams(searchParams)
    if (next.cat !== undefined) next.cat === 'all' ? sp.delete('cat') : sp.set('cat', next.cat)
    if (next.vis !== undefined) next.vis === 'all' ? sp.delete('vis') : sp.set('vis', next.vis)
    if (next.featured !== undefined) next.featured ? sp.set('featured', '1') : sp.delete('featured')
    if (next.q !== undefined) next.q ? sp.set('q', next.q) : sp.delete('q')
    setSearchParams(sp, { replace: true })
  }

  const [addingId, setAddingId]         = useState<number | null>(null)
  const [showUnpublished, setShowUnpublished] = useState(false)
  const [unpubSearch, setUnpubSearch]   = useState('')
  const [unpubSupplier, setUnpubSupplier] = useState<number | 'all'>('all')

  async function load() {
    setLoading(true)
    const [p, c, u] = await Promise.all([
      webCatalog.listProducts(),
      webCatalog.listCategories(),
      webCatalog.listUnpublished(),
    ])
    setProducts(p)
    setCategories(c)
    setUnpublished(u)
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function handleToggleVisible(wp: WebProduct) {
    await webCatalog.saveProduct({ ...wp, visible: !wp.visible })
    void load()
  }

  async function handleToggleFeatured(wp: WebProduct) {
    const featured = !wp.featured
    const featuredOrder = featured ? await webCatalog.getNextFeaturedOrder() : wp.featuredOrder
    await webCatalog.saveProduct({ ...wp, featured, featuredOrder })
    void load()
  }

  async function handleAddProduct(productId: number) {
    setAddingId(productId)
    const nextOrder = await webCatalog.getNextSortOrder(null)
    await webCatalog.saveProduct({
      productId,
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
      sortOrder: nextOrder,
    })
    setAddingId(null)
    setShowUnpublished(false)
    void load()
  }

  const filtered = products
    .filter(p => {
      if (onlyFeatured && !p.featured) return false
      if (filterCat === 'none' && p.webCategoryId !== null) return false
      if (typeof filterCat === 'number' && p.webCategoryId !== filterCat) return false
      if (filterVis === 'visible' && !p.visible) return false
      if (filterVis === 'hidden' && p.visible) return false
      if (search && !p.productName.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
    .sort((a, b) => onlyFeatured ? a.featuredOrder - b.featuredOrder : 0)

  const catName = (id: number | null) =>
    id ? (categories.find(c => c.id === id)?.name ?? '—') : '—'

  const sortedCategories = [...categories].sort((a, b) => a.name.localeCompare(b.name, 'es'))

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">🌐 Catálogo Web</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/web-catalog/categories')}>
            🗂️ Categorías
          </button>
          <button className="btn btn-primary" onClick={() => setShowUnpublished(v => !v)}>
            + Agregar producto
          </button>
        </div>
      </div>

      {/* Panel agregar productos no publicados */}
      {showUnpublished && (() => {
        const suppliers = Array.from(
          new Map(
            unpublished
              .filter(p => p.supplierId !== null)
              .map(p => [p.supplierId, p.supplierName])
          ).entries()
        ).sort((a, b) => (a[1] ?? '').localeCompare(b[1] ?? ''))

        const filteredUnpub = unpublished.filter(p => {
          if (unpubSearch && !p.name.toLowerCase().includes(unpubSearch.toLowerCase())) return false
          if (unpubSupplier !== 'all' && p.supplierId !== unpubSupplier) return false
          return true
        })

        return (
          <div className="web-catalog-add-panel">
            <div className="web-catalog-add-header">
              <strong>Productos del catálogo aún no publicados en web ({unpublished.length})</strong>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowUnpublished(false); setUnpubSearch(''); setUnpubSupplier('all') }}>✕</button>
            </div>
            {unpublished.length === 0 ? (
              <p className="muted" style={{ padding: '12px 16px' }}>Todos los productos ya están en el catálogo web.</p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, padding: '8px 16px', borderBottom: '1px solid #e5e7eb' }}>
                  <input
                    className="input"
                    placeholder="🔍 Buscar por nombre..."
                    value={unpubSearch}
                    onChange={e => setUnpubSearch(e.target.value)}
                    style={{ flex: 1 }}
                    autoFocus
                  />
                  <select
                    className="select"
                    value={unpubSupplier === 'all' ? 'all' : String(unpubSupplier)}
                    onChange={e => setUnpubSupplier(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                    style={{ minWidth: 160 }}
                  >
                    <option value="all">Todos los distribuidores</option>
                    {suppliers.map(([id, name]) => (
                      <option key={id} value={String(id)}>{name}</option>
                    ))}
                  </select>
                  <span className="muted" style={{ fontSize: 13, alignSelf: 'center', whiteSpace: 'nowrap' }}>
                    {filteredUnpub.length} producto(s)
                  </span>
                </div>
                <div className="web-catalog-add-list">
                  {filteredUnpub.length === 0 ? (
                    <p className="muted" style={{ padding: '12px 16px' }}>Sin resultados.</p>
                  ) : filteredUnpub.map(p => (
                    <div key={p.id} className="web-catalog-add-item">
                      <div>
                        <strong>{p.name}</strong>
                        <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                          SKU: {p.sku} · Stock: {p.stock}
                          {p.supplierName ? ` · ${p.supplierName}` : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontWeight: 600 }}>$ {p.price.toFixed(2)}</span>
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={addingId === p.id}
                          onClick={() => void handleAddProduct(p.id)}
                        >
                          {addingId === p.id ? '...' : '+ Agregar'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )
      })()}

      {/* Filtros */}
      <div className="web-catalog-filters">
        <input
          className="input"
          placeholder="🔍 Buscar producto..."
          value={search}
          onChange={e => updateFilters({ q: e.target.value })}
          style={{ width: 220 }}
        />
        <select className="select" value={String(filterCat)} onChange={e => updateFilters({ cat: e.target.value })}>
          <option value="all">Todas las categorías</option>
          <option value="none">Sin categoría</option>
          {sortedCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="select" value={filterVis} onChange={e => updateFilters({ vis: e.target.value })}>
          <option value="all">Todos</option>
          <option value="visible">Publicados</option>
          <option value="hidden">Ocultos</option>
        </select>
        <button
          className={`btn btn-sm ${onlyFeatured ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => updateFilters({ featured: !onlyFeatured })}
          title="Mostrar solo los productos marcados como Destacados, en el orden en que aparecerán en la web"
        >
          ⭐ Solo Destacados
        </button>
        <span className="muted" style={{ fontSize: 13 }}>{filtered.length} producto(s)</span>
      </div>

      {loading ? (
        <p className="muted" style={{ padding: 24 }}>Cargando...</p>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p>No hay productos en el catálogo web.</p>
          <p className="muted">Presioná "+ Agregar producto" para comenzar.</p>
        </div>
      ) : (
        <div className="web-catalog-grid">
          {filtered.map(wp => (
            <div key={wp.productId} className={`web-catalog-card ${wp.visible ? 'wc-visible' : 'wc-hidden'}`}>
              {/* Miniatura */}
              <div className="wc-thumb">
                {wp.images.length > 0
                  ? <WcThumb filename={wp.images[0].filename} />
                  : <span className="wc-no-img">Sin imagen</span>
                }
                {wp.featured && <span className="wc-badge-featured">⭐ Destacado #{wp.featuredOrder}</span>}
              </div>

              <div className="wc-body">
                <div className="wc-name">{wp.productName}</div>
                <div className="wc-meta">
                  <span className="wc-cat">{catName(wp.webCategoryId)}</span>
                  {wp.images.length > 0 && <span className="wc-imgcount">📷 {wp.images.length}</span>}
                  {wp.shortDescription && <span className="wc-has-desc">📝</span>}
                </div>
                <div className="wc-price">
                  $ {(wp.webPrice ?? wp.productPrice).toFixed(2)}
                  {wp.webPrice !== null && <span className="wc-price-web"> (precio web)</span>}
                </div>
              </div>

              <div className="wc-actions">
                <button
                  className={`wc-toggle ${wp.visible ? 'wc-toggle--on' : 'wc-toggle--off'}`}
                  title={wp.visible ? 'Publicado — clic para ocultar' : 'Oculto — clic para publicar'}
                  onClick={() => void handleToggleVisible(wp)}
                >
                  {wp.visible ? '🟢 Publicado' : '⚫ Oculto'}
                </button>
                <button
                  className={`wc-toggle-feat ${wp.featured ? 'active' : ''}`}
                  title="Destacado en home"
                  onClick={() => void handleToggleFeatured(wp)}
                >
                  ⭐
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => navigate(`/web-catalog/product/${wp.productId}`)}
                >
                  Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function WcThumb({ filename }: { filename: string }) {
  return <img src={`web-image://${encodeURIComponent(filename)}`} alt="" className="wc-img" />
}
