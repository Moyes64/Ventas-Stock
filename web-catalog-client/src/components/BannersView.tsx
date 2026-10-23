import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { WebBanner, WebBannerLinkType, WebBannerTheme, WebCategory, WebProduct } from '../types/contract'
import ProductImage from './ProductImage'

// Misma pantalla que Ventas-Stock > Catálogo Web > Banners web
// (src/pages/web-catalog/WebBannersPage.tsx), adaptada a este cliente.

interface FormState {
  title: string
  subtitle: string
  badge: string
  finePrint: string
  theme: WebBannerTheme
  linkType: WebBannerLinkType
  linkProductId: string
  linkCategoryId: string
  linkUrl: string
  offerWebPrice: string
  offerCompareAt: string
  showButton: boolean
  buttonText: string
  dateFrom: string
  dateTo: string
  active: boolean
  sortOrder: string
}

const EMPTY_FORM: FormState = {
  title: '', subtitle: '', badge: '', finePrint: '', theme: 'gold',
  linkType: 'none', linkProductId: '', linkCategoryId: '', linkUrl: '',
  offerWebPrice: '', offerCompareAt: '',
  showButton: true, buttonText: 'Ver oferta',
  dateFrom: '', dateTo: '', active: true, sortOrder: '0',
}

const LINK_TYPE_LABELS: Record<WebBannerLinkType, string> = {
  none: 'Sin link (solo informativo)',
  product: 'Un producto',
  category: 'Una categoría del catálogo',
  url: 'Otro link',
}

function priceText(n: number | null | undefined): string {
  return n != null ? String(n) : ''
}

function numOrNull(s: string): number | null {
  return s.trim() === '' ? null : Number(s)
}

// Precios sin centavos y con separador de miles (ej. "$ 99.900"), igual que el banner en la web.
function money(n: number): string {
  return `$ ${Math.round(n).toLocaleString('es-AR')}`
}

function formatDate(ymd: string | null): string {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function bannerStatus(b: WebBanner, today: string): string {
  if (!b.active) return 'Inactivo'
  if (b.linkProductUnavailable) return '⚠ Producto no publicado'
  if (b.dateTo && b.dateTo < today) return 'Vencido'
  if (b.dateFrom && b.dateFrom > today) return 'Programado'
  return 'Activo'
}

function vigencia(b: WebBanner): string {
  if (b.dateFrom && b.dateTo) return `${formatDate(b.dateFrom)} al ${formatDate(b.dateTo)}`
  if (b.dateFrom) return `Desde ${formatDate(b.dateFrom)}`
  if (b.dateTo) return `Hasta ${formatDate(b.dateTo)}`
  return 'Siempre'
}

function linkDescription(b: WebBanner): string {
  switch (b.linkType) {
    case 'product': return `Producto: ${b.linkProductName ?? '—'}`
    case 'category': return `Categoría: ${b.linkCategoryName ?? '—'}`
    case 'url': return b.linkUrl
    default: return 'Sin link'
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function BannersView() {
  const [enabled, setEnabled] = useState(true)
  const [banners, setBanners] = useState<WebBanner[]>([])
  const [products, setProducts] = useState<WebProduct[]>([])
  const [categories, setCategories] = useState<WebCategory[]>([])
  const [editing, setEditing] = useState<WebBanner | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const today = localToday()

  async function load() {
    setError(null)
    try {
      const [config, list, prods, cats] = await Promise.all([
        api.getBannersConfig(), api.listBanners(), api.listProducts(), api.listCategories(),
      ])
      setEnabled(config.enabled)
      setBanners(list)
      setProducts(prods.filter(p => p.visible).sort((a, b) => a.productName.localeCompare(b.productName, 'es')))
      setCategories(cats.filter(c => c.active))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al cargar los banners')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const selectedProduct = products.find(p => String(p.productId) === form.linkProductId) ?? null

  function selectProduct(value: string) {
    const p = products.find(x => String(x.productId) === value)
    setForm(prev => ({
      ...prev,
      linkProductId: value,
      offerWebPrice: priceText(p?.webPrice ?? null),
      offerCompareAt: priceText(p?.compareAtPrice ?? null),
    }))
  }

  async function startNew() {
    setEditing(null)
    setError(null)
    setMessage(null)
    try {
      setForm({ ...EMPTY_FORM, sortOrder: String(await api.getNextBannerSortOrder()) })
    } catch {
      setForm(EMPTY_FORM)
    }
  }

  function startEdit(b: WebBanner) {
    setEditing(b)
    setError(null)
    setMessage(null)
    setForm({
      title: b.title,
      subtitle: b.subtitle,
      badge: b.badge,
      finePrint: b.finePrint,
      theme: b.theme,
      linkType: b.linkType,
      linkProductId: b.linkProductId !== null ? String(b.linkProductId) : '',
      linkCategoryId: b.linkCategoryId !== null ? String(b.linkCategoryId) : '',
      linkUrl: b.linkUrl,
      offerWebPrice: priceText(b.linkProductWebPrice),
      offerCompareAt: priceText(b.linkProductCompareAtPrice),
      showButton: b.buttonText !== '',
      buttonText: b.buttonText || 'Ver oferta',
      dateFrom: b.dateFrom ?? '',
      dateTo: b.dateTo ?? '',
      active: b.active,
      sortOrder: String(b.sortOrder),
    })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)
    const input = {
      title: form.title,
      subtitle: form.subtitle,
      badge: form.badge,
      finePrint: form.finePrint,
      theme: form.theme,
      linkType: form.linkType,
      linkProductId: numOrNull(form.linkProductId),
      linkCategoryId: numOrNull(form.linkCategoryId),
      linkUrl: form.linkUrl,
      buttonText: form.showButton ? form.buttonText : '',
      dateFrom: form.dateFrom || null,
      dateTo: form.dateTo || null,
      active: form.active,
      sortOrder: Number(form.sortOrder) || 0,
      productOffer: form.linkType === 'product'
        ? { webPrice: numOrNull(form.offerWebPrice), compareAtPrice: numOrNull(form.offerCompareAt) }
        : undefined,
    }
    try {
      const saved = editing ? await api.updateBanner(editing.id, input) : await api.createBanner(input)
      await load()
      // Queda abierto en edición para poder cargarle la imagen al recién creado.
      startEdit(saved)
      setMessage('✅ Guardado. Llega a la web en la próxima sincronización de la notebook.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(b: WebBanner) {
    if (!window.confirm(`¿Eliminar el banner "${b.title}"?`)) return
    try {
      await api.deleteBanner(b.id)
      if (editing?.id === b.id) await startNew()
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al eliminar')
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !editing) return
    setUploading(true)
    setError(null)
    try {
      setEditing(await api.uploadBannerImage(editing.id, await fileToBase64(file)))
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al subir la imagen')
    } finally {
      setUploading(false)
    }
  }

  async function handleRemoveImage() {
    if (!editing) return
    try {
      setEditing(await api.removeBannerImage(editing.id))
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al quitar la imagen')
    }
  }

  async function handleToggleEnabled(value: boolean) {
    try {
      setEnabled((await api.setBannersEnabled(value)).enabled)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al cambiar el interruptor')
    }
  }

  if (loading) return <p className="muted">Cargando...</p>

  const hasLink = form.linkType !== 'none'
  const offerNow = selectedProduct
    ? (Number(form.offerWebPrice) || selectedProduct.productPrice)
    : 0
  const offerBefore = Number(form.offerCompareAt)

  return (
    <div className="field-row" style={{ alignItems: 'flex-start' }}>
      <div className="panel" style={{ flex: 2, minWidth: 300 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2>Banners web</h2>
          <button className="btn btn-primary btn-sm" onClick={() => { void startNew() }}>+ Nuevo banner</button>
        </div>
        <p className="hint">
          Se muestran en la home de la tienda, debajo de la presentación. Con fechas de vigencia se
          prenden y se apagan solos.
        </p>
        <label className="toggle" style={{ margin: '10px 0' }}>
          <input type="checkbox" checked={enabled} onChange={e => { void handleToggleEnabled(e.target.checked) }} />
          <span className={`badge ${enabled ? 'badge--on' : 'badge--off'}`}>
            {enabled ? 'Banners activados en la web' : 'Banners desactivados (no se muestra ninguno)'}
          </span>
        </label>
        {banners.length === 0 ? (
          <p className="muted">No hay banners creados.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Orden</th><th>Banner</th><th>Lleva a</th><th>Vigencia</th><th>Estado</th><th></th></tr>
            </thead>
            <tbody>
              {banners.map(b => (
                <tr key={b.id}>
                  <td>{b.sortOrder}</td>
                  <td>
                    {b.badge && <span className="muted">{b.badge} · </span>}
                    <strong>{b.title}</strong>{b.imageFilename && ' 🖼️'}
                  </td>
                  <td className="hint">{linkDescription(b)}</td>
                  <td className="hint">{vigencia(b)}</td>
                  <td>{bannerStatus(b, today)}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => startEdit(b)}>Editar</button>
                    <button className="btn btn-sm btn-danger" onClick={() => { void handleDelete(b) }}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <form className="panel" style={{ flex: 1, minWidth: 300 }} onSubmit={e => { void handleSave(e) }}>
        <h2>{editing ? `Editar: ${editing.title}` : 'Nuevo banner'}</h2>
        <div className="field">
          <label>Título *</label>
          <input maxLength={80} value={form.title} onChange={e => set('title', e.target.value)}
            placeholder="Ej: 3 cuotas sin interés" required />
        </div>
        <div className="field">
          <label>Texto</label>
          <input maxLength={160} value={form.subtitle} onChange={e => set('subtitle', e.target.value)}
            placeholder="Ej: En toda la tienda pagando con Mercado Pago" />
        </div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>Etiqueta</label>
            <input maxLength={24} value={form.badge} onChange={e => set('badge', e.target.value)} placeholder="Ej: OFERTA" />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Estilo</label>
            <select value={form.theme} onChange={e => set('theme', e.target.value as WebBannerTheme)}>
              <option value="gold">Dorado (claro)</option>
              <option value="navy">Azul (oscuro)</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>Letra chica</label>
          <input maxLength={200} value={form.finePrint} onChange={e => set('finePrint', e.target.value)}
            placeholder="Ej: Válido hasta el 31/10 o hasta agotar stock" />
        </div>

        <div className="field">
          <label>Al hacer click lleva a</label>
          <select value={form.linkType} onChange={e => set('linkType', e.target.value as WebBannerLinkType)}>
            {(Object.keys(LINK_TYPE_LABELS) as WebBannerLinkType[]).map(t => (
              <option key={t} value={t}>{LINK_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        {form.linkType === 'product' && (
          <div className="field">
            <label>Producto</label>
            <select value={form.linkProductId} onChange={e => selectProduct(e.target.value)}>
              <option value="">Elegí un producto publicado…</option>
              {products.map(p => <option key={p.productId} value={p.productId}>{p.productName}</option>)}
            </select>
            <span className="hint">Si el producto se queda sin stock, el banner se oculta solo.</span>
          </div>
        )}
        {form.linkType === 'product' && selectedProduct && (
          <div className="field" style={{ background: '#f7f7f9', borderRadius: 8, padding: 10 }}>
            <label>💲 Precio de oferta del producto</label>
            <div className="field-row">
              <div className="field" style={{ flex: 1 }}>
                <span className="hint">Precio web (oferta)</span>
                <input type="number" step="0.01" value={form.offerWebPrice}
                  placeholder={`${money(selectedProduct.productPrice)} (catálogo)`}
                  onChange={e => set('offerWebPrice', e.target.value)} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <span className="hint">Precio anterior (tachado)</span>
                <input type="number" step="0.01" value={form.offerCompareAt} placeholder="Sin tachado"
                  onChange={e => set('offerCompareAt', e.target.value)} />
              </div>
            </div>
            {!offerBefore ? (
              <span className="hint">Precio web vacío = precio del catálogo ({money(selectedProduct.productPrice)}). Es lo que se cobra en la web.</span>
            ) : offerBefore <= offerNow ? (
              <span className="error">El precio anterior tiene que ser mayor a {money(offerNow)}.</span>
            ) : (
              <span className="hint">
                La web muestra <s>{money(offerBefore)}</s> {money(offerNow)} · OFERTA -{Math.round((1 - offerNow / offerBefore) * 100)}%.
                Cuando termine la oferta, vaciá ambos precios.
              </span>
            )}
          </div>
        )}
        {form.linkType === 'category' && (
          <div className="field">
            <label>Categoría</label>
            <select value={form.linkCategoryId} onChange={e => set('linkCategoryId', e.target.value)}>
              <option value="">Elegí una categoría…</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {form.linkType === 'url' && (
          <div className="field">
            <label>Link</label>
            <input value={form.linkUrl} onChange={e => set('linkUrl', e.target.value)} placeholder="/catalogo?search=cubo  o  https://..." />
            <span className="hint">Una página de la tienda (empieza con /) o una dirección completa.</span>
          </div>
        )}
        {hasLink && (
          <div className="field">
            <label className="toggle">
              <input type="checkbox" checked={form.showButton} onChange={e => set('showButton', e.target.checked)} />
              Mostrar botón
            </label>
            {form.showButton
              ? <input maxLength={24} value={form.buttonText} onChange={e => set('buttonText', e.target.value)} placeholder="Ej: Ver oferta" />
              : <span className="hint">Sin botón: todo el banner es clickeable.</span>}
          </div>
        )}

        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>Vigente desde</label>
            <input type="date" value={form.dateFrom} onChange={e => set('dateFrom', e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Vigente hasta</label>
            <input type="date" value={form.dateTo} onChange={e => set('dateTo', e.target.value)} />
          </div>
        </div>
        <p className="hint" style={{ marginTop: -6 }}>Vacías = sin límite. El día "hasta" se muestra completo.</p>

        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>Orden</label>
            <input type="number" value={form.sortOrder} onChange={e => set('sortOrder', e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1, justifyContent: 'flex-end' }}>
            <label className="toggle">
              <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} />
              Banner activo
            </label>
          </div>
        </div>

        <div className="field">
          <label>Imagen (opcional)</label>
          {!editing ? (
            <span className="hint">Guardá el banner para poder cargarle una imagen.</span>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {editing.imageFilename && (
                <div className="image-item" style={{ width: 64 }}>
                  <ProductImage filename={editing.imageFilename} alt="" />
                </div>
              )}
              <button type="button" className="btn btn-sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                {uploading ? 'Subiendo...' : editing.imageFilename ? 'Cambiar imagen' : '🖼️ Cargar imagen'}
              </button>
              {editing.imageFilename && (
                <button type="button" className="btn btn-sm btn-danger" onClick={() => { void handleRemoveImage() }}>Quitar</button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { void handleFile(e) }} />
            </div>
          )}
          <span className="hint">Se muestra cuadrada a la izquierda. Sin imagen, el banner es solo texto.</span>
        </div>

        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : '💾 Guardar'}
          </button>
          {editing && <button type="button" className="btn" onClick={() => { void startNew() }}>Cancelar</button>}
        </div>
      </form>
    </div>
  )
}
