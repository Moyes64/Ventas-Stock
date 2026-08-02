import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { webCatalog } from '../../lib/ipc'
import type { WebProduct, WebCategory } from '../../types/ipc'

const DIFFICULTY_LABELS = ['', '⭐ Muy fácil', '⭐⭐ Fácil', '⭐⭐⭐ Medio', '⭐⭐⭐⭐ Difícil', '⭐⭐⭐⭐⭐ Muy difícil']

export default function WebProductEditorPage() {
  const { productId } = useParams<{ productId: string }>()
  const navigate = useNavigate()
  const pid = parseInt(productId ?? '0')

  const [wp, setWp]             = useState<WebProduct | null>(null)
  const [categories, setCats]   = useState<WebCategory[]>([])
  const [saving, setSaving]     = useState(false)
  const [saveMsg, setSaveMsg]   = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [maxSortOrder, setMaxSortOrder] = useState<number | null>(null)
  const [maxFeaturedOrder, setMaxFeaturedOrder] = useState<number | null>(null)

  // Form state
  const [form, setForm] = useState({
    webCategoryId: null as number | null,
    visible: false,
    featured: false,
    featuredOrder: '0' as string,
    webPrice: '' as string,
    shortDescription: '',
    longDescription: '',
    ageMin: '' as string,
    playersMin: '' as string,
    playersMax: '' as string,
    playTimeMin: '' as string,
    difficulty: '' as string,
    videoUrl: '',
    tags: '',
    sortOrder: '0',
  })

  useEffect(() => {
    void (async () => {
      const [product, cats] = await Promise.all([
        webCatalog.getProduct(pid),
        webCatalog.listCategories(),
      ])
      setCats(cats)
      if (product) {
        setWp(product)
        setForm({
          webCategoryId: product.webCategoryId,
          visible: product.visible,
          featured: product.featured,
          featuredOrder: String(product.featuredOrder),
          webPrice: product.webPrice !== null ? String(product.webPrice) : '',
          shortDescription: product.shortDescription,
          longDescription: product.longDescription,
          ageMin: product.ageMin !== null ? String(product.ageMin) : '',
          playersMin: product.playersMin !== null ? String(product.playersMin) : '',
          playersMax: product.playersMax !== null ? String(product.playersMax) : '',
          playTimeMin: product.playTimeMin !== null ? String(product.playTimeMin) : '',
          difficulty: product.difficulty !== null ? String(product.difficulty) : '',
          videoUrl: product.videoUrl,
          tags: product.tags,
          sortOrder: String(product.sortOrder),
        })
      }
    })()
  }, [pid])

  useEffect(() => {
    if (!wp) return
    void webCatalog.getNextSortOrder(form.webCategoryId).then(next => setMaxSortOrder(next - 1))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.webCategoryId, wp])

  useEffect(() => {
    if (!wp) return
    void webCatalog.getNextFeaturedOrder().then(next => setMaxFeaturedOrder(next - 1))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wp])

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    if (!wp) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const updated = await webCatalog.saveProduct({
        productId: pid,
        webCategoryId: form.webCategoryId,
        visible: form.visible,
        featured: form.featured,
        featuredOrder: parseInt(form.featuredOrder) || 0,
        webPrice: form.webPrice !== '' ? parseFloat(form.webPrice) : null,
        shortDescription: form.shortDescription,
        longDescription: form.longDescription,
        ageMin: form.ageMin !== '' ? parseInt(form.ageMin) : null,
        playersMin: form.playersMin !== '' ? parseInt(form.playersMin) : null,
        playersMax: form.playersMax !== '' ? parseInt(form.playersMax) : null,
        playTimeMin: form.playTimeMin !== '' ? parseInt(form.playTimeMin) : null,
        difficulty: form.difficulty !== '' ? parseInt(form.difficulty) : null,
        videoUrl: form.videoUrl,
        tags: form.tags,
        sortOrder: parseInt(form.sortOrder) || 0,
      })
      setWp(updated)
      setSaveMsg('✅ Guardado correctamente')
    } catch (err) {
      setSaveMsg(`❌ ${err instanceof Error ? err.message : 'Error al guardar'}`)
    } finally {
      setSaving(false)
    }
  }

  async function refreshImages() {
    const updated = await webCatalog.getProduct(pid)
    if (updated) setWp(updated)
  }

  async function handleUploadImage() {
    if (!wp) return
    setUploading(true)
    const res = await webCatalog.uploadImage(pid, wp.images.length)
    if (res.success) await refreshImages()
    setUploading(false)
  }

  async function handleDeleteImage(imageId: number) {
    await webCatalog.deleteImage(imageId)
    await refreshImages()
  }

  async function handleMoveImage(index: number, dir: -1 | 1) {
    if (!wp) return
    const imgs = [...wp.images]
    const target = index + dir
    if (target < 0 || target >= imgs.length) return
    ;[imgs[index], imgs[target]] = [imgs[target]!, imgs[index]!]
    await webCatalog.reorderImages(pid, imgs.map(i => i.id))
    await refreshImages()
  }

  if (!wp) return <div className="page"><p className="muted" style={{ padding: 24 }}>Cargando...</p></div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button className="btn btn-ghost" onClick={() => navigate('/web-catalog')}>← Volver</button>
          <h1 className="page-title" style={{ display: 'inline', marginLeft: 12 }}>{wp.productName}</h1>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {saveMsg && <span style={{ fontSize: 13 }}>{saveMsg}</span>}
          <button className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Guardando...' : '💾 Guardar'}
          </button>
        </div>
      </div>

      <div className="web-editor-layout">

        {/* ── Columna izquierda: imágenes ── */}
        <div className="web-editor-images">
          <h3 className="web-editor-section-title">📷 Imágenes ({wp.images.length}/5)</h3>

          <div className="wc-images-grid">
            {wp.images.map((img, idx) => (
              <div key={img.id} className={`wc-image-card ${idx === 0 ? 'wc-image-main' : ''}`}>
                <img src={`web-image://${encodeURIComponent(img.filename)}`} alt="" className="wc-edit-img" />
                {idx === 0 && <div className="wc-img-label">Principal</div>}
                <div className="wc-img-actions">
                  <button className="btn-icon" onClick={() => void handleMoveImage(idx, -1)} disabled={idx === 0} title="Mover izquierda">◀</button>
                  <button className="btn-icon" onClick={() => void handleMoveImage(idx, 1)} disabled={idx === wp.images.length - 1} title="Mover derecha">▶</button>
                  <button className="btn-icon btn-icon--danger" onClick={() => void handleDeleteImage(img.id)} title="Eliminar">✕</button>
                </div>
              </div>
            ))}

            {wp.images.length < 5 && (
              <button
                className="wc-image-add"
                onClick={() => void handleUploadImage()}
                disabled={uploading}
              >
                {uploading ? '⏳' : '+'}<br />
                <small>{uploading ? 'Subiendo...' : 'Agregar foto'}</small>
              </button>
            )}
          </div>

          <div className="form-group" style={{ marginTop: 16 }}>
            <label className="label">🎬 Video (YouTube / Vimeo)</label>
            <input
              className="input"
              placeholder="https://youtube.com/watch?v=..."
              value={form.videoUrl}
              onChange={e => set('videoUrl', e.target.value)}
            />
          </div>
        </div>

        {/* ── Columna derecha: datos ── */}
        <div className="web-editor-data">

          {/* Publicación */}
          <div className="web-editor-section">
            <h3 className="web-editor-section-title">📡 Publicación</h3>
            <div className="web-editor-row">
              <label className="wc-switch-label">
                <input type="checkbox" checked={form.visible} onChange={e => set('visible', e.target.checked)} className="wc-switch-input" />
                <span className="wc-switch"></span>
                <span>{form.visible ? '🟢 Publicado en la tienda' : '⚫ Oculto (no visible en la tienda)'}</span>
              </label>
            </div>
            <div className="web-editor-row" style={{ marginTop: 8 }}>
              <label className="wc-switch-label">
                <input type="checkbox" checked={form.featured} onChange={e => set('featured', e.target.checked)} className="wc-switch-input" />
                <span className="wc-switch"></span>
                <span>⭐ Destacado en la home</span>
              </label>
            </div>
            {form.featured && (
              <div className="form-group sysparam-col2" style={{ marginTop: 8 }}>
                <label className="label">Orden en destacados</label>
                <input className="input" type="number" min={0} value={form.featuredOrder} onChange={e => set('featuredOrder', e.target.value)} />
                {maxFeaturedOrder !== null && (
                  <span style={{ fontSize: 11, color: '#6b7280', marginTop: 2, display: 'block' }}>
                    {maxFeaturedOrder < 0
                      ? 'Sin otros productos destacados'
                      : `Valor más alto entre destacados: ${maxFeaturedOrder}`}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Categoría y precio */}
          <div className="web-editor-section">
            <h3 className="web-editor-section-title">🏷️ Categoría y precio</h3>
            <div className="sysparam-grid">
              <div className="form-group sysparam-col2">
                <label className="label">Categoría web</label>
                <select className="select" value={form.webCategoryId ?? ''} onChange={e => set('webCategoryId', e.target.value ? parseInt(e.target.value) : null)}>
                  <option value="">Sin categoría</option>
                  {categories.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group sysparam-col2">
                <label className="label">Precio web</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder={`$ ${wp.productPrice.toFixed(2)} (precio catálogo)`}
                  value={form.webPrice}
                  onChange={e => set('webPrice', e.target.value)}
                />
                <span className="field-hint">Dejalo vacío para usar el precio del catálogo.</span>
              </div>
            </div>
          </div>

          {/* Descripciones */}
          <div className="web-editor-section">
            <h3 className="web-editor-section-title">📝 Descripciones</h3>
            <div className="form-group">
              <label className="label">Descripción corta <span className="field-hint">(se muestra en la grilla de productos)</span></label>
              <input
                className="input"
                maxLength={160}
                placeholder="Una línea que resuma el producto..."
                value={form.shortDescription}
                onChange={e => set('shortDescription', e.target.value)}
              />
              <span className="field-hint">{form.shortDescription.length}/160 caracteres</span>
            </div>
            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="label">Descripción completa <span className="field-hint">(ficha del producto)</span></label>
              <textarea
                className="input"
                rows={6}
                placeholder="Descripción detallada del juego, mecánicas, contenido de la caja, etc."
                value={form.longDescription}
                onChange={e => set('longDescription', e.target.value)}
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
          </div>

          {/* Atributos */}
          <div className="web-editor-section">
            <h3 className="web-editor-section-title">🎮 Atributos del juego</h3>
            <div className="sysparam-grid">
              <div className="form-group sysparam-col2">
                <label className="label">Edad mínima</label>
                <input className="input" type="number" min={0} placeholder="Ej: 8" value={form.ageMin} onChange={e => set('ageMin', e.target.value)} />
              </div>
              <div className="form-group sysparam-col2">
                <label className="label">Tiempo de juego (min)</label>
                <input className="input" type="number" min={0} placeholder="Ej: 45" value={form.playTimeMin} onChange={e => set('playTimeMin', e.target.value)} />
              </div>
              <div className="form-group sysparam-col2">
                <label className="label">Jugadores mín.</label>
                <input className="input" type="number" min={1} placeholder="Ej: 2" value={form.playersMin} onChange={e => set('playersMin', e.target.value)} />
              </div>
              <div className="form-group sysparam-col2">
                <label className="label">Jugadores máx.</label>
                <input className="input" type="number" min={1} placeholder="Ej: 6" value={form.playersMax} onChange={e => set('playersMax', e.target.value)} />
              </div>
              <div className="form-group sysparam-col2">
                <label className="label">Dificultad</label>
                <select className="select" value={form.difficulty} onChange={e => set('difficulty', e.target.value)}>
                  <option value="">Sin especificar</option>
                  {[1,2,3,4,5].map(n => <option key={n} value={n}>{DIFFICULTY_LABELS[n]}</option>)}
                </select>
              </div>
              <div className="form-group sysparam-col2">
                <label className="label">Orden en catálogo</label>
                <input className="input" type="number" min={0} value={form.sortOrder} onChange={e => set('sortOrder', e.target.value)} />
                {maxSortOrder !== null && (
                  <span style={{ fontSize: 11, color: '#6b7280', marginTop: 2, display: 'block' }}>
                    {maxSortOrder < 0
                      ? 'Sin otros productos en esta categoría'
                      : `Valor más alto en esta categoría: ${maxSortOrder}`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="web-editor-section">
            <h3 className="web-editor-section-title">🔖 Etiquetas de búsqueda</h3>
            <div className="form-group">
              <input
                className="input"
                placeholder="rompecabezas, madera, familia, regalo, 1000 piezas..."
                value={form.tags}
                onChange={e => set('tags', e.target.value)}
              />
              <span className="field-hint">Separadas por coma. Ayudan a los clientes a encontrar el producto.</span>
            </div>
          </div>

          {/* Info de catálogo */}
          <div className="web-editor-section" style={{ background: 'var(--color-surface)', borderRadius: 8, padding: '12px 16px' }}>
            <p className="field-hint">
              <strong>Catálogo interno:</strong> SKU {wp.productSku} · Precio $ {wp.productPrice.toFixed(2)} · Stock: {wp.productStock} unidades
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
