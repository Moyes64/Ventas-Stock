import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { webCatalog, sync as syncApi } from '../../lib/ipc'
import type { WebBanner, WebBannerLinkType, WebBannerTheme, WebCategory, WebProduct } from '../../types/ipc'
import { useConfirm } from '../../hooks/useConfirm'
import { formatDate, localToday } from '../../lib/date'

const EMPTY_FORM = {
  title: '',
  subtitle: '',
  badge: '',
  finePrint: '',
  theme: 'gold' as WebBannerTheme,
  linkType: 'none' as WebBannerLinkType,
  linkProductId: null as number | null,
  linkCategoryId: null as number | null,
  linkUrl: '',
  offerPrice: '',
  offerCompareAt: '',
  showButton: true,
  buttonText: 'Ver oferta',
  dateFrom: '',
  dateTo: '',
  active: true,
  sortOrder: 0,
}

const LINK_TYPE_LABELS: Record<WebBannerLinkType, string> = {
  none: 'Sin link (solo informativo)',
  product: 'Un producto',
  category: 'Una categoría del catálogo',
  url: 'Otro link',
}

// Mismos colores que la web (recuadro de Pistas = dorado, header = azul).
const THEME_STYLES: Record<WebBannerTheme, { bg: string; border: string; text: string; accent: string; accentText: string }> = {
  gold: { bg: '#fff8e6', border: '#e8a020', text: '#23487f', accent: '#e8a020', accentText: '#23487f' },
  navy: { bg: '#23487f', border: '#23487f', text: '#ffffff', accent: '#e8a020', accentText: '#23487f' },
}

// Precios sin centavos y con separador de miles (ej. "$ 99.900"), igual que el banner en la web.
function money(n: number): string {
  return `$ ${Math.round(n).toLocaleString('es-AR')}`
}

function bannerStatus(b: WebBanner, today: string): { label: string; className: string } {
  if (!b.active) return { label: 'Inactivo', className: 'badge badge--neutral' }
  if (b.linkProductUnavailable) return { label: 'Producto no publicado', className: 'badge badge--danger' }
  if (b.dateTo && b.dateTo < today) return { label: 'Vencido', className: 'badge badge--neutral' }
  if (b.dateFrom && b.dateFrom > today) return { label: 'Programado', className: 'badge badge--info' }
  return { label: 'Activo', className: 'badge badge--success' }
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

export default function WebBannersPage() {
  const navigate = useNavigate()
  const { confirm, dialog: confirmDialog } = useConfirm()

  const [enabled, setEnabled]       = useState(true)
  const [banners, setBanners]       = useState<WebBanner[]>([])
  const [products, setProducts]     = useState<WebProduct[]>([])
  const [categories, setCategories] = useState<WebCategory[]>([])
  const [editing, setEditing]       = useState<WebBanner | null>(null)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [imageUrl, setImageUrl]     = useState<string | null>(null)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [publishMsg, setPublishMsg] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)

  const today = localToday()

  async function load() {
    const [config, list, prods, cats] = await Promise.all([
      webCatalog.getBannersConfig(),
      webCatalog.listBanners(),
      webCatalog.listProducts(),
      webCatalog.listCategories(),
    ])
    setEnabled(config.enabled)
    setBanners(list)
    setProducts(prods.filter(p => p.visible).sort((a, b) => a.productName.localeCompare(b.productName, 'es')))
    setCategories(cats.filter(c => c.active))
    return list
  }

  useEffect(() => { void load() }, [])

  // Banner de producto sin imagen propia: se usa la primera imagen web del producto.
  const productImage = form.linkType === 'product'
    ? products.find(p => p.productId === form.linkProductId)?.images[0]?.filename ?? null
    : null
  const ownImage = editing?.imageFilename ?? null
  const shownImage = ownImage ?? productImage

  useEffect(() => {
    if (!shownImage) { setImageUrl(null); return }
    void webCatalog.getImageDataUrl(shownImage).then(setImageUrl)
  }, [shownImage])

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // null/undefined → campo vacío (undefined llega si el proceso principal quedó en una versión vieja)
  const priceText = (n: number | null | undefined) => n != null ? String(n) : ''

  // Al elegir el producto se traen sus precios actuales para editar la oferta.
  function selectProduct(productId: number | null) {
    const p = products.find(x => x.productId === productId)
    setForm(prev => ({
      ...prev,
      linkProductId: productId,
      offerPrice: priceText(p?.offerPrice ?? null),
      offerCompareAt: priceText(p?.compareAtPrice ?? null),
    }))
  }

  const selectedProduct = products.find(p => p.productId === form.linkProductId) ?? null

  async function startAdd() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, sortOrder: await webCatalog.getNextBannerSortOrder() })
    setError(null)
  }

  function startEdit(b: WebBanner) {
    setEditing(b)
    setForm({
      title: b.title,
      subtitle: b.subtitle,
      badge: b.badge,
      finePrint: b.finePrint,
      theme: b.theme,
      linkType: b.linkType,
      linkProductId: b.linkProductId,
      linkCategoryId: b.linkCategoryId,
      linkUrl: b.linkUrl,
      offerPrice: priceText(b.linkProductOfferPrice),
      offerCompareAt: priceText(b.linkProductCompareAtPrice),
      showButton: b.buttonText !== '',
      buttonText: b.buttonText || 'Ver oferta',
      dateFrom: b.dateFrom ?? '',
      dateTo: b.dateTo ?? '',
      active: b.active,
      sortOrder: b.sortOrder,
    })
    setError(null)
  }

  function cancelEdit() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError(null)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const saved = await webCatalog.saveBanner(editing?.id ?? null, {
        title: form.title,
        subtitle: form.subtitle,
        badge: form.badge,
        finePrint: form.finePrint,
        theme: form.theme,
        linkType: form.linkType,
        linkProductId: form.linkProductId,
        linkCategoryId: form.linkCategoryId,
        linkUrl: form.linkUrl,
        buttonText: form.showButton ? form.buttonText : '',
        dateFrom: form.dateFrom || null,
        dateTo: form.dateTo || null,
        active: form.active,
        sortOrder: form.sortOrder,
        productOffer: form.linkType === 'product' ? {
          offerPrice: form.offerPrice !== '' ? parseFloat(form.offerPrice) : null,
          compareAtPrice: form.offerCompareAt !== '' ? parseFloat(form.offerCompareAt) : null,
        } : undefined,
      })
      await load()
      // Queda abierto en edición para poder cargarle la imagen al recién creado.
      startEdit(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(b: WebBanner) {
    if (!(await confirm(`¿Eliminar el banner "${b.title}"?`, { danger: true, confirmLabel: 'Eliminar' }))) return
    await webCatalog.deleteBanner(b.id)
    if (editing?.id === b.id) cancelEdit()
    void load()
  }

  async function handleUploadImage() {
    if (!editing) return
    const res = await webCatalog.uploadBannerImage(editing.id)
    if (res.success && res.banner) {
      setEditing(res.banner)
      void load()
    } else if (res.error) {
      setError(res.error)
    }
  }

  async function handleRemoveImage() {
    if (!editing) return
    setEditing(await webCatalog.removeBannerImage(editing.id))
    void load()
  }

  async function handleToggleEnabled(value: boolean) {
    const config = await webCatalog.setBannersEnabled(value)
    setEnabled(config.enabled)
  }

  async function handlePublishNow() {
    setPublishing(true)
    setPublishMsg(null)
    try {
      const res = await syncApi.triggerNow()
      setPublishMsg(res.success
        ? '✅ Enviado. La web lo muestra en menos de un minuto.'
        : `❌ No se pudo sincronizar: ${res.error ?? 'error desconocido'}`)
    } finally {
      setPublishing(false)
    }
  }

  const hasLink = form.linkType !== 'none'
  const previewTextOnly = !imageUrl && !(hasLink && form.showButton && form.buttonText)
  const theme = THEME_STYLES[form.theme]

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button className="btn btn-ghost" onClick={() => navigate('/web-catalog')}>← Volver</button>
          <h1 className="page-title" style={{ display: 'inline', marginLeft: 12 }}>📢 Banners web</h1>
        </div>
        <button className="btn btn-primary" onClick={() => void startAdd()}>+ Nuevo banner</button>
      </div>

      <p className="muted-text" style={{ maxWidth: 720 }}>
        Banners promocionales que se muestran en la home de la tienda web, debajo de la presentación:
        ofertas de productos, planes de pago, etc. Con fechas de vigencia se prenden y se apagan solos,
        aunque esta notebook esté apagada. Los cambios llegan a la web en la próxima sincronización.
      </p>

      {/* Interruptor general */}
      <div className="sync-status-card" style={{ maxWidth: 720, marginBottom: 20 }}>
        <div className="sync-status-row">
          <span className="sync-status-label">Banners en la web</span>
          <span className={`sync-badge ${enabled ? 'sync-badge--on' : 'sync-badge--off'}`}>
            {enabled ? 'Activados' : 'Desactivados'}
          </span>
        </div>
        <div className="form-row" style={{ marginTop: 8, alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <label className="wc-switch-label">
            <input type="checkbox" className="wc-switch-input" checked={enabled}
              onChange={e => { void handleToggleEnabled(e.target.checked) }} />
            <span className="wc-switch"></span>
            <span>{enabled ? 'Se muestran los banners activos' : 'No se muestra ningún banner'}</span>
          </label>
          <button className="btn btn-ghost btn-sm" disabled={publishing} onClick={() => void handlePublishNow()}>
            {publishing ? 'Enviando...' : '🔄 Publicar ahora'}
          </button>
        </div>
        {publishMsg && <p className="field-hint" style={{ marginTop: 6 }}>{publishMsg}</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 24, alignItems: 'start' }}>

        {/* Lista */}
        <div>
          {banners.length === 0 ? (
            <div className="empty-state"><p>No hay banners creados.</p></div>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Orden</th><th>Banner</th><th>Lleva a</th><th>Vigencia</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {banners.map(b => {
                  const status = bannerStatus(b, today)
                  return (
                    <tr key={b.id} style={editing?.id === b.id ? { background: '#f8fafc' } : undefined}>
                      <td>{b.sortOrder}</td>
                      <td>
                        {b.badge && <small className="muted">{b.badge} · </small>}
                        <strong>{b.title}</strong>
                        {b.imageFilename && <small className="muted"> 🖼️</small>}
                        {b.subtitle && <><br /><small className="muted">{b.subtitle}</small></>}
                      </td>
                      <td><small>{linkDescription(b)}</small></td>
                      <td><small>{vigencia(b)}</small></td>
                      <td><span className={status.className}>{status.label}</span></td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => startEdit(b)}>Editar</button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => void handleDelete(b)}>Eliminar</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {/* Vista previa */}
          {(form.title || editing) && (
            <div style={{ marginTop: 24 }}>
              <h3 className="sysparam-section-title">Vista previa</h3>
              <div style={{
                display: 'flex', gap: 16, alignItems: 'center', padding: 16, borderRadius: 16,
                background: theme.bg, border: `1px solid ${theme.border}`, color: theme.text,
              }}>
                {imageUrl && (
                  <img src={imageUrl} alt="" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 12, flexShrink: 0 }} />
                )}
                {/* Solo texto (sin imagen ni botón): centrado, igual que en la web */}
                <div style={{ flex: 1, textAlign: previewTextOnly ? 'center' : 'left' }}>
                  {form.badge && (
                    <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
                      padding: '2px 8px', borderRadius: 999, background: theme.accent, color: theme.accentText, marginBottom: 6 }}>
                      {form.badge}
                    </span>
                  )}
                  <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'Georgia, serif' }}>{form.title || 'Título del banner'}</div>
                  {form.subtitle && <div style={{ fontSize: 14, opacity: 0.8, marginTop: 4 }}>{form.subtitle}</div>}
                  {form.linkType === 'product' && selectedProduct && (() => {
                    const regular = selectedProduct.webPrice ?? selectedProduct.productPrice
                    const now = parseFloat(form.offerPrice) || regular
                    const before = parseFloat(form.offerCompareAt) || (form.offerPrice ? regular : 0)
                    return (
                      <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'baseline', justifyContent: previewTextOnly ? 'center' : 'flex-start' }}>
                        <span style={{ fontSize: 18, fontWeight: 700 }}>{money(now)}</span>
                        {before > now && <s style={{ fontSize: 13, opacity: 0.6 }}>{money(before)}</s>}
                      </div>
                    )
                  })()}
                  {form.finePrint && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>{form.finePrint}</div>}
                </div>
                {hasLink && form.showButton && form.buttonText && (
                  <span style={{ fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 999, background: theme.accent, color: theme.accentText, flexShrink: 0 }}>
                    {form.buttonText} →
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Formulario */}
        <div className="sysparam-section">
          <h2 className="sysparam-section-title">{editing ? `Editar: ${editing.title}` : 'Nuevo banner'}</h2>

          <div className="form-group">
            <label className="label">Título *</label>
            <input className="input" maxLength={80} value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="Ej: 3 cuotas sin interés" />
          </div>
          <div className="form-group">
            <label className="label">Texto</label>
            <input className="input" maxLength={160} value={form.subtitle} onChange={e => set('subtitle', e.target.value)}
              placeholder="Ej: En toda la tienda pagando con Mercado Pago" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label className="label">Etiqueta</label>
              <input className="input" maxLength={24} value={form.badge} onChange={e => set('badge', e.target.value)}
                placeholder="Ej: OFERTA" />
            </div>
            <div className="form-group">
              <label className="label">Estilo</label>
              <select className="select" value={form.theme} onChange={e => set('theme', e.target.value as WebBannerTheme)}>
                <option value="gold">Dorado (claro)</option>
                <option value="navy">Azul (oscuro)</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="label">Letra chica</label>
            <input className="input" maxLength={200} value={form.finePrint} onChange={e => set('finePrint', e.target.value)}
              placeholder="Ej: Válido hasta el 31/10 o hasta agotar stock" />
          </div>

          <div className="form-group">
            <label className="label">Al hacer click lleva a</label>
            <select className="select" value={form.linkType} onChange={e => set('linkType', e.target.value as WebBannerLinkType)}>
              {(Object.keys(LINK_TYPE_LABELS) as WebBannerLinkType[]).map(t => (
                <option key={t} value={t}>{LINK_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          {form.linkType === 'product' && (
            <div className="form-group">
              <label className="label">Producto</label>
              <select className="select" value={form.linkProductId ?? ''}
                onChange={e => selectProduct(e.target.value ? parseInt(e.target.value) : null)}>
                <option value="">Elegí un producto publicado…</option>
                {products.map(p => <option key={p.productId} value={p.productId}>{p.productName}</option>)}
              </select>
              <span className="field-hint">Si el producto se queda sin stock, el banner se oculta solo.</span>
            </div>
          )}
          {form.linkType === 'product' && selectedProduct && (
            <div className="form-group" style={{ background: '#f8fafc', border: '1px solid var(--color-border)', borderRadius: 8, padding: 10 }}>
              <label className="label">💲 Precio de oferta del producto</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <span className="field-hint">Precio de oferta</span>
                  <input className="input" type="number" min={0} step={0.01} value={form.offerPrice}
                    placeholder="Sin oferta"
                    onChange={e => set('offerPrice', e.target.value)} />
                </div>
                <div>
                  <span className="field-hint">Precio anterior (tachado)</span>
                  <input className="input" type="number" min={0} step={0.01} value={form.offerCompareAt}
                    placeholder={form.offerPrice ? `${money(selectedProduct.webPrice ?? selectedProduct.productPrice)} (normal)` : 'Sin tachado'}
                    onChange={e => set('offerCompareAt', e.target.value)} />
                </div>
              </div>
              {(() => {
                const regular = selectedProduct.webPrice ?? selectedProduct.productPrice
                const now = parseFloat(form.offerPrice) || regular
                // Sin precio anterior, se tacha el precio normal
                const before = parseFloat(form.offerCompareAt) || (form.offerPrice ? regular : 0)
                const until = form.dateTo ? `el ${formatDate(form.dateTo)}` : null
                if (!before) return <span className="field-hint">Precio normal en la web: {money(regular)}. Cargá un precio de oferta para que el banner la publique.</span>
                if (before <= now) return <span className="field-hint" style={{ color: 'var(--color-danger)' }}>El precio anterior tiene que ser mayor a {money(now)}.</span>
                return <span className="field-hint">
                  La web muestra <s>{money(before)}</s> {money(now)} · OFERTA -{Math.round((1 - now / before) * 100)}%.{' '}
                  {until
                    ? <>La oferta vence sola con el banner ({until}): después vuelve a {money(regular)}, sin tachado.</>
                    : <>Sin fecha "hasta", la oferta sigue hasta que vacíes los precios.</>}
                </span>
              })()}
            </div>
          )}
          {form.linkType === 'category' && (
            <div className="form-group">
              <label className="label">Categoría</label>
              <select className="select" value={form.linkCategoryId ?? ''}
                onChange={e => set('linkCategoryId', e.target.value ? parseInt(e.target.value) : null)}>
                <option value="">Elegí una categoría…</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          {form.linkType === 'url' && (
            <div className="form-group">
              <label className="label">Link</label>
              <input className="input" value={form.linkUrl} onChange={e => set('linkUrl', e.target.value)}
                placeholder="/catalogo?search=cubo  o  https://..." />
              <span className="field-hint">Una página de la tienda (empieza con /) o una dirección completa.</span>
            </div>
          )}
          {hasLink && (
            <div className="form-group">
              <label className="wc-switch-label">
                <input type="checkbox" className="wc-switch-input" checked={form.showButton}
                  onChange={e => set('showButton', e.target.checked)} />
                <span className="wc-switch"></span>
                <span>Mostrar botón</span>
              </label>
              {form.showButton ? (
                <input className="input" style={{ marginTop: 6 }} maxLength={24} value={form.buttonText}
                  onChange={e => set('buttonText', e.target.value)} placeholder="Ej: Ver oferta" />
              ) : (
                <span className="field-hint">Sin botón: todo el banner es clickeable.</span>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label className="label">Vigente desde</label>
              <input className="input" type="date" value={form.dateFrom} onChange={e => set('dateFrom', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">Vigente hasta</label>
              <input className="input" type="date" value={form.dateTo} onChange={e => set('dateTo', e.target.value)} />
            </div>
          </div>
          <span className="field-hint">Vacías = sin límite. El día "hasta" se muestra completo.</span>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 }}>
            <div className="form-group">
              <label className="label">Orden</label>
              <input className="input" type="number" min={0} value={form.sortOrder}
                onChange={e => set('sortOrder', parseInt(e.target.value) || 0)} />
            </div>
            <div className="form-group" style={{ alignSelf: 'end' }}>
              <label className="wc-switch-label">
                <input type="checkbox" className="wc-switch-input" checked={form.active}
                  onChange={e => set('active', e.target.checked)} />
                <span className="wc-switch"></span>
                <span>Banner activo</span>
              </label>
            </div>
          </div>

          <div className="form-group">
            <label className="label">Imagen {form.linkType === 'product' ? '' : '(opcional)'}</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {imageUrl && <img src={imageUrl} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />}
              {editing ? (
                <>
                  <button className="btn btn-ghost btn-sm" onClick={() => void handleUploadImage()}>
                    {ownImage ? 'Cambiar imagen' : form.linkType === 'product' ? '🖼️ Usar otra imagen' : '🖼️ Cargar imagen'}
                  </button>
                  {ownImage && (
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => void handleRemoveImage()}>
                      {form.linkType === 'product' ? 'Volver a la del producto' : 'Quitar'}
                    </button>
                  )}
                </>
              ) : form.linkType !== 'product' && (
                <span className="field-hint">Guardá el banner para poder cargarle una imagen.</span>
              )}
            </div>
            <span className="field-hint">
              {form.linkType === 'product' && !ownImage
                ? (productImage ? 'Se usa la primera imagen del producto en el catálogo web.' : 'El producto no tiene imágenes en el catálogo web.')
                : 'Se muestra cuadrada a la izquierda. Sin imagen, el banner es solo texto.'}
            </span>
          </div>

          {error && <p className="error">{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Guardando...' : '💾 Guardar'}
            </button>
            {editing && <button className="btn btn-ghost" onClick={cancelEdit}>Cancelar</button>}
          </div>
        </div>

      </div>

      {confirmDialog}
    </div>
  )
}
