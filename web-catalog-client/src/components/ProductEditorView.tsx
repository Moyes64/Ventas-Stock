import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { WebCategory, WebProduct } from '../types/contract'
import ProductImage from './ProductImage'

const MAX_IMAGES = 5

interface FormState {
  visible: boolean
  featured: boolean
  featuredOrder: string
  webCategoryId: string
  webPrice: string
  shortDescription: string
  longDescription: string
  ageMin: string
  playersMin: string
  playersMax: string
  playTimeMin: string
  difficulty: string
  sortOrder: string
  tags: string
  videoUrl: string
}

function toForm(p: WebProduct): FormState {
  return {
    visible: p.visible,
    featured: p.featured,
    featuredOrder: String(p.featuredOrder),
    webCategoryId: p.webCategoryId !== null ? String(p.webCategoryId) : '',
    webPrice: p.webPrice !== null ? String(p.webPrice) : '',
    shortDescription: p.shortDescription,
    longDescription: p.longDescription,
    ageMin: p.ageMin !== null ? String(p.ageMin) : '',
    playersMin: p.playersMin !== null ? String(p.playersMin) : '',
    playersMax: p.playersMax !== null ? String(p.playersMax) : '',
    playTimeMin: p.playTimeMin !== null ? String(p.playTimeMin) : '',
    difficulty: p.difficulty !== null ? String(p.difficulty) : '',
    sortOrder: String(p.sortOrder),
    tags: p.tags,
    videoUrl: p.videoUrl,
  }
}

function numOrNull(s: string): number | null {
  return s.trim() === '' ? null : Number(s)
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function ProductEditorView({ productId, onBack }: { productId: number; onBack: () => void }) {
  const [product, setProduct] = useState<WebProduct | null>(null)
  const [categories, setCategories] = useState<WebCategory[]>([])
  const [form, setForm] = useState<FormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [p, cats] = await Promise.all([api.getProduct(productId), api.listCategories()])
      setProduct(p)
      setForm(toForm(p))
      setCategories(cats)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al cargar el producto')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [productId])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      await api.saveProduct({
        productId,
        webCategoryId: form.webCategoryId ? Number(form.webCategoryId) : null,
        visible: form.visible,
        featured: form.featured,
        featuredOrder: Number(form.featuredOrder) || 0,
        webPrice: numOrNull(form.webPrice),
        shortDescription: form.shortDescription,
        longDescription: form.longDescription,
        ageMin: numOrNull(form.ageMin),
        playersMin: numOrNull(form.playersMin),
        playersMax: numOrNull(form.playersMax),
        playTimeMin: numOrNull(form.playTimeMin),
        difficulty: numOrNull(form.difficulty),
        videoUrl: form.videoUrl,
        tags: form.tags,
        sortOrder: Number(form.sortOrder) || 0,
      })
      setMessage('Guardado.')
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  // Las acciones de imagen actualizan solo `product.images` en memoria — a propósito NO
  // llaman a load(), que también pisaría `form` con lo último guardado en el servidor y
  // borraría cualquier cambio de texto que Anabella todavía no haya guardado (bug reportado:
  // subir una imagen faltante después de cargar los campos de texto borraba todo lo tipeado).
  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !product) return
    setUploading(true)
    setError(null)
    try {
      const base64 = await fileToBase64(file)
      const image = await api.uploadImage(productId, product.images.length, base64)
      setProduct(prev => (prev ? { ...prev, images: [...prev.images, image] } : prev))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al subir la imagen')
    } finally {
      setUploading(false)
    }
  }

  async function handleDeleteImage(imageId: number) {
    if (!window.confirm('¿Eliminar esta imagen?')) return
    try {
      await api.deleteImage(imageId)
      setProduct(prev => (prev ? { ...prev, images: prev.images.filter(i => i.id !== imageId) } : prev))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al eliminar la imagen')
    }
  }

  async function handleMoveImage(index: number, dir: -1 | 1) {
    if (!product) return
    const imgs = [...product.images]
    const target = index + dir
    if (target < 0 || target >= imgs.length) return
    ;[imgs[index], imgs[target]] = [imgs[target], imgs[index]]
    try {
      await api.reorderImages(productId, imgs.map(i => i.id))
      setProduct(prev => (prev ? { ...prev, images: imgs } : prev))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al reordenar')
    }
  }

  if (loading || !form) return <p className="muted">Cargando...</p>
  if (!product) return <p className="error">No se encontró el producto.</p>

  return (
    <div>
      <div className="app-header">
        <button className="btn" onClick={onBack}>← Volver</button>
        <span className="muted">{product.productSku} · ${product.productPrice} · Stock: {product.productStock}</span>
      </div>

      <div className="panel">
        <h2>{product.productName}</h2>

        <h3>Imágenes ({product.images.length}/{MAX_IMAGES})</h3>
        <div className="image-strip">
          {product.images.map((img, idx) => (
            <div className="image-item" key={img.id}>
              <div className="card-thumb">
                <ProductImage filename={img.filename} alt={product.productName} />
              </div>
              <div className="image-controls">
                <button className="btn btn-sm" disabled={idx === 0} onClick={() => { void handleMoveImage(idx, -1) }}>◀</button>
                <button className="btn btn-sm btn-danger" onClick={() => { void handleDeleteImage(img.id) }}>✕</button>
                <button className="btn btn-sm" disabled={idx === product.images.length - 1} onClick={() => { void handleMoveImage(idx, 1) }}>▶</button>
              </div>
              {idx === 0 && <p className="hint" style={{ textAlign: 'center' }}>Principal</p>}
            </div>
          ))}
        </div>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: 'none' }} onChange={e => { void handleFileChosen(e) }} />
        <button
          className="btn"
          disabled={uploading || product.images.length >= MAX_IMAGES}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? 'Subiendo...' : '+ Agregar imagen'}
        </button>
      </div>

      <form className="panel" onSubmit={e => { void handleSave(e) }}>
        <div className="field-row">
          <label className="toggle">
            <input type="checkbox" checked={form.visible} onChange={e => setForm({ ...form, visible: e.target.checked })} />
            Publicado
          </label>
          <label className="toggle">
            <input type="checkbox" checked={form.featured} onChange={e => setForm({ ...form, featured: e.target.checked })} />
            Destacado
          </label>
          {form.featured && (
            <div className="field" style={{ maxWidth: 120 }}>
              <label>Orden destacado</label>
              <input type="number" value={form.featuredOrder} onChange={e => setForm({ ...form, featuredOrder: e.target.value })} />
            </div>
          )}
        </div>

        <div className="field-row">
          <div className="field">
            <label>Categoría</label>
            <select value={form.webCategoryId} onChange={e => setForm({ ...form, webCategoryId: e.target.value })}>
              <option value="">Sin categoría</option>
              {categories.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Precio web (opcional, pisa el de catálogo)</label>
            <input type="number" value={form.webPrice} onChange={e => setForm({ ...form, webPrice: e.target.value })} />
          </div>
        </div>

        <div className="field">
          <label>Descripción corta (máx. 160)</label>
          <input maxLength={160} value={form.shortDescription} onChange={e => setForm({ ...form, shortDescription: e.target.value })} />
          <span className="hint">{form.shortDescription.length}/160</span>
        </div>
        <div className="field">
          <label>Descripción larga</label>
          <textarea value={form.longDescription} onChange={e => setForm({ ...form, longDescription: e.target.value })} />
        </div>

        <div className="field-row">
          <div className="field"><label>Edad mínima</label><input type="number" value={form.ageMin} onChange={e => setForm({ ...form, ageMin: e.target.value })} /></div>
          <div className="field"><label>Jugadores mín.</label><input type="number" value={form.playersMin} onChange={e => setForm({ ...form, playersMin: e.target.value })} /></div>
          <div className="field"><label>Jugadores máx.</label><input type="number" value={form.playersMax} onChange={e => setForm({ ...form, playersMax: e.target.value })} /></div>
          <div className="field"><label>Duración (min)</label><input type="number" value={form.playTimeMin} onChange={e => setForm({ ...form, playTimeMin: e.target.value })} /></div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Dificultad (1-5)</label>
            <select value={form.difficulty} onChange={e => setForm({ ...form, difficulty: e.target.value })}>
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="field"><label>Orden</label><input type="number" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: e.target.value })} /></div>
        </div>

        <div className="field">
          <label>Tags (separados por coma)</label>
          <input value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} />
        </div>
        <div className="field">
          <label>Video (YouTube/Vimeo)</label>
          <input value={form.videoUrl} onChange={e => setForm({ ...form, videoUrl: e.target.value })} />
        </div>

        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  )
}
