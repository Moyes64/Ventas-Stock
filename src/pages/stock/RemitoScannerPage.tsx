import { useState, useEffect } from 'react'
import { remitoScanner, stock, catalog, suppliers } from '../../lib/ipc'
import { localToday } from '../../lib/date'
import { calcSalePrice, calcGainFromPrice } from '../../lib/pricing'
import type { RemitoExtracted, RemitoItem, MatchSource, Product, TaxRate, Supplier } from '../../types/ipc'

interface NewProductForm {
  name: string
  sku: string
  barcode: string
  price: string
  cost: string
  gainPercent: string
  taxRateId: string
  supplierId: number | null
}

interface MatchedItem extends RemitoItem {
  productId: number | null
  productName: string | null
  matchSource: MatchSource       // cómo se encontró la coincidencia
  confirmedQty: number
  include: boolean
}

const SOURCE_LABELS: Record<string, { label: string; cls: string }> = {
  barcode:  { label: '📊 Código barras', cls: 'badge--success' },
  mapping:  { label: '🔗 Mapeo guardado', cls: 'badge--info'    },
  name:     { label: '🔤 Nombre similar', cls: 'badge--warning' },
  manual:   { label: '✋ Manual',         cls: 'badge--warning' },
}

type Step = 'upload' | 'review' | 'done'

export default function RemitoScannerPage() {
  const [step, setStep] = useState<Step>('upload')
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  const [extracted, setExtracted] = useState<RemitoExtracted | null>(null)
  const [items, setItems] = useState<MatchedItem[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])

  const [voucherType, setVoucherType] = useState('Remito')
  const [voucherNumber, setVoucherNumber] = useState('')
  const [voucherDate, setVoucherDate] = useState(localToday())
  const [notes, setNotes] = useState('')
  const [supplierId, setSupplierId] = useState<number | null>(null)

  const [taxRates, setTaxRates] = useState<TaxRate[]>([])
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([])
  // índice del ítem que tiene abierto el formulario de alta, null = ninguno
  const [newProductIdx, setNewProductIdx] = useState<number | null>(null)
  const [newProductForm, setNewProductForm] = useState<NewProductForm>({ name: '', sku: '', barcode: '', price: '', cost: '', gainPercent: '0', taxRateId: '', supplierId: null })
  const [creatingProduct, setCreatingProduct] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState(0)
  const [newMappingsCount, setNewMappingsCount] = useState(0)

  // IVA% del formulario de alta de producto, usado para auto-calcular el precio de venta
  const newProductIvaPct = taxRates.find(t => t.id === Number(newProductForm.taxRateId))?.percentage ?? 0

  useEffect(() => {
    void catalog.getTaxRates().then(r => setTaxRates(r as TaxRate[]))
    void suppliers.list(true).then(setSuppliersList)
  }, [])

  async function handleSelectImage() {
    const p = await remitoScanner.selectImage()
    if (p) { setImagePath(p); setScanError(null) }
  }

  async function handleScan() {
    if (!imagePath) return
    setScanning(true)
    setScanError(null)
    try {
      const result = await remitoScanner.scan(imagePath)
      if (!result.success || !result.data) {
        setScanError(result.error ?? 'Error desconocido')
        return
      }
      const ext = result.data

      // Cargar productos del catálogo
      const products = await catalog.listProducts(true)
      setAllProducts(products)

      // Índices para matching
      const byBarcode = new Map(
        products.filter(p => p.barcode).map(p => [p.barcode!, p])
      )
      const byNameContains = (desc: string) => {
        const dl = desc.toLowerCase()
        return products.find(p => p.name.toLowerCase().includes(dl.slice(0, 25))) ?? null
      }

      // Consultar mappings guardados para los códigos de artículo del remito
      const supplierCodes = ext.items.map(i => i.articulo).filter(Boolean)
      const savedMappings = await remitoScanner.getMappings(supplierCodes)

      const matched: MatchedItem[] = ext.items.map(item => {
        // 1. Código de barras exacto
        const byBC = item.codigoBarras ? byBarcode.get(item.codigoBarras) : undefined
        if (byBC) {
          return { ...item, productId: byBC.id, productName: byBC.name,
                   matchSource: 'barcode', confirmedQty: item.cantidad, include: true }
        }
        // 2. Mapeo guardado
        const mapped = item.articulo ? savedMappings[item.articulo] : undefined
        if (mapped) {
          return { ...item, productId: mapped.productId, productName: mapped.productName,
                   matchSource: 'mapping', confirmedQty: item.cantidad, include: true }
        }
        // 3. Nombre similar (fallback)
        const byName = byNameContains(item.descripcion)
        if (byName) {
          return { ...item, productId: byName.id, productName: byName.name,
                   matchSource: 'name', confirmedQty: item.cantidad, include: true }
        }
        // 4. Sin coincidencia
        return { ...item, productId: null, productName: null,
                 matchSource: null, confirmedQty: item.cantidad, include: false }
      })

      // Buscar proveedor por nombre detectado en el remito
      let matchedSupplierId: number | null = null
      if (ext.proveedor) {
        const found = await suppliers.search(ext.proveedor)
        if (found.length > 0) matchedSupplierId = found[0].id
      }

      setExtracted(ext)
      setVoucherNumber(ext.numeroRemito)
      setVoucherDate(ext.fecha || localToday())
      setSupplierId(matchedSupplierId)
      setItems(matched)
      setStep('review')
    } catch (e) {
      setScanError(e instanceof Error ? e.message : String(e))
    } finally {
      setScanning(false)
    }
  }

  function updateItem(idx: number, patch: Partial<MatchedItem>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }

  function openNewProductForm(idx: number) {
    const item = items[idx]
    setNewProductIdx(idx)
    setCreateError(null)
    const defaultTaxRate = taxRates.find(t => t.percentage === 21) ?? taxRates[0]
    setNewProductForm({
      name: item.descripcion ?? '',
      sku: item.articulo ?? '',
      barcode: item.codigoBarras ?? '',
      price: '',
      cost: '',
      gainPercent: '0',
      taxRateId: defaultTaxRate?.id?.toString() ?? '',
      supplierId,
    })
  }

  async function handleCreateProduct() {
    if (newProductIdx === null) return
    const f = newProductForm
    const missing: string[] = []
    if (!f.name.trim()) missing.push('nombre')
    if (!f.sku.trim()) missing.push('SKU')
    if (!f.supplierId) missing.push('proveedor')
    if (!f.price) missing.push('precio')
    if (!f.cost) missing.push('costo')
    if (!f.taxRateId) missing.push('IVA')
    if (missing.length > 0) {
      setCreateError(`Completá: ${missing.join(', ')}.`)
      return
    }
    setCreatingProduct(true)
    setCreateError(null)
    try {
      const newId = await catalog.createProduct({
        name: f.name.trim(),
        sku: f.sku.trim(),
        barcode: f.barcode.trim() || null,
        price: parseFloat(f.price),
        cost: parseFloat(f.cost),
        taxRateId: parseInt(f.taxRateId),
        supplierId: f.supplierId,
        supplierCode: items[newProductIdx].articulo ?? '',
        gainPercent: parseFloat(f.gainPercent) || 0,
        stockMin: 0,
      }) as number
      // Recargar lista de productos
      const products = await catalog.listProducts(true)
      setAllProducts(products)
      const created = products.find(p => p.id === newId)
      if (created) {
        updateItem(newProductIdx, {
          productId: created.id,
          productName: created.name,
          matchSource: 'manual',
          include: true,
        })
      }
      setNewProductIdx(null)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreatingProduct(false)
    }
  }

  /** Cuando el usuario elige un producto manualmente */
  function handleManualSelect(idx: number, productId: number) {
    const product = allProducts.find(p => p.id === productId) ?? null
    updateItem(idx, {
      productId: product?.id ?? null,
      productName: product?.name ?? null,
      matchSource: product ? 'manual' : null,
      include: product !== null,
    })
  }

  async function handleConfirm() {
    const toSave = items.filter(it => it.include && it.productId !== null && it.confirmedQty > 0)
    if (toSave.length === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      // Guardar mappings nuevos (manual o name) — excluye barcode ya que no depende de articulo
      const newMappings = toSave
        .filter(it => it.articulo && (it.matchSource === 'manual' || it.matchSource === 'name'))
        .map(it => ({ supplierCode: it.articulo, productId: it.productId! }))
      if (newMappings.length > 0) {
        await remitoScanner.saveMappings(newMappings)
        setNewMappingsCount(newMappings.length)
      }

      // Crear movimientos de stock
      for (const it of toSave) {
        await stock.addMovement({
          productId: it.productId!,
          type: 'ENTRY',
          quantity: it.confirmedQty,
          notes: notes || `Remito ${voucherNumber}`,
          voucherType: voucherType || undefined,
          voucherNumber: voucherNumber || undefined,
          voucherDate: voucherDate || undefined,
          supplierId: supplierId ?? undefined,
        })
      }
      setSavedCount(toSave.length)
      setStep('done')
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function reset() {
    setStep('upload'); setImagePath(null); setExtracted(null)
    setItems([]); setScanError(null); setSaveError(null)
    setVoucherNumber(''); setVoucherDate(localToday()); setNotes('')
    setSupplierId(null)
    setSavedCount(0); setNewMappingsCount(0)
  }

  const includedCount  = items.filter(it => it.include && it.productId).length
  const unmatchedCount = items.filter(it => !it.productId).length

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">🤖 Escáner de Remitos</h1>
      </div>

      {/* ── PASO 1: Subir imagen ─────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="scanner-upload-section">
          <p className="page-subtitle">
            Seleccioná la foto o imagen del remito del proveedor. Claude AI extraerá
            los productos y cantidades automáticamente.
          </p>
          <div
            className={`scanner-dropzone ${imagePath ? 'scanner-dropzone--ready' : ''}`}
            onClick={() => void handleSelectImage()}
          >
            {imagePath ? (
              <>
                <div className="scanner-dropzone-icon">✅</div>
                <p className="scanner-dropzone-text">{imagePath.split(/[\\/]/).pop()}</p>
                <p className="scanner-dropzone-hint">Clic para cambiar</p>
              </>
            ) : (
              <>
                <div className="scanner-dropzone-icon">📄</div>
                <p className="scanner-dropzone-text">Clic para seleccionar imagen</p>
                <p className="scanner-dropzone-hint">JPG, PNG, WEBP</p>
              </>
            )}
          </div>
          {scanError && <p className="error" style={{ marginTop: '1rem' }}>{scanError}</p>}
          <button
            className="btn btn-primary btn-lg"
            onClick={() => void handleScan()}
            disabled={!imagePath || scanning}
            style={{ marginTop: '1.5rem' }}
          >
            {scanning ? '⏳ Procesando con Claude AI...' : '🔍 Analizar remito'}
          </button>
          {scanning && (
            <p className="scanner-scanning-msg">
              Claude está leyendo el documento. Esto puede tardar unos segundos...
            </p>
          )}
        </div>
      )}

      {/* ── PASO 2: Revisar y confirmar ─────────────────────────────────── */}
      {step === 'review' && extracted && (
        <div className="scanner-review-section">
          {/* Cabecera extraída */}
          <div className="scanner-header-card">
            <h3 className="scanner-header-title">📋 Datos del remito</h3>
            <div className="scanner-header-grid">
              <div className="form-group">
                <label className="label">Proveedor detectado</label>
                <input type="text" value={extracted.proveedor} readOnly className="input input--readonly" />
              </div>
              <div className="form-group">
                <label className="label">Proveedor (sistema) *</label>
                <select
                  className="input"
                  value={supplierId ?? ''}
                  onChange={e => setSupplierId(e.target.value === '' ? null : parseInt(e.target.value))}
                >
                  <option value="">— Sin coincidencia, seleccioná uno —</option>
                  {suppliersList.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="label">Tipo comprobante</label>
                <input type="text" value={voucherType} onChange={e => setVoucherType(e.target.value)} className="input" />
              </div>
              <div className="form-group">
                <label className="label">Número</label>
                <input type="text" value={voucherNumber} onChange={e => setVoucherNumber(e.target.value)} className="input" />
              </div>
              <div className="form-group">
                <label className="label">Fecha</label>
                <input type="date" value={voucherDate} onChange={e => setVoucherDate(e.target.value)} className="input" />
              </div>
              <div className="form-group">
                <label className="label">Notas</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className="input" placeholder="Observaciones del ingreso" />
              </div>
            </div>
          </div>

          {/* Leyenda de fuente de coincidencia */}
          <div className="scanner-legend">
            <span className="scanner-legend-title">Fuente de coincidencia:</span>
            {Object.entries(SOURCE_LABELS).map(([k, v]) => (
              <span key={k} className={`badge ${v.cls}`}>{v.label}</span>
            ))}
            <span className="badge badge--danger">❌ Sin coincidencia</span>
          </div>

          {/* Resumen */}
          <div className="scanner-match-summary">
            <span className="badge badge--success">{includedCount} a ingresar</span>
            {unmatchedCount > 0 && (
              <span className="badge badge--danger">{unmatchedCount} sin coincidencia — seleccioná el producto manualmente</span>
            )}
          </div>

          {/* Tabla de ítems */}
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>✓</th>
                  <th>Cód. Proveedor</th>
                  <th>Descripción extraída</th>
                  <th>Cód. Barras</th>
                  <th>Producto en sistema</th>
                  <th>Fuente</th>
                  <th>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx} className={!it.productId ? 'row--warning' : !it.include ? 'row--disabled' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={it.include && it.productId !== null}
                        disabled={it.productId === null}
                        onChange={e => updateItem(idx, { include: e.target.checked })}
                      />
                    </td>
                    <td className="text-muted" style={{ fontSize: '0.85em' }}>{it.articulo || '—'}</td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={it.descripcion}>{it.descripcion}</td>
                    <td className="text-muted" style={{ fontSize: '0.8em' }}>{it.codigoBarras || '—'}</td>
                    <td>
                      <select
                        className="input input--select-sm"
                        value={it.productId ?? ''}
                        onChange={e => handleManualSelect(idx, parseInt(e.target.value))}
                      >
                        <option value="">— Sin coincidencia —</option>
                        {allProducts.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      {/* Botón dar de alta — solo cuando no hay coincidencia */}
                      {!it.productId && newProductIdx !== idx && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ marginTop: 4, fontSize: '0.78em', padding: '2px 8px' }}
                          onClick={() => openNewProductForm(idx)}
                        >
                          ➕ Dar de alta
                        </button>
                      )}
                      {/* Formulario inline de alta */}
                      {newProductIdx === idx && (
                        <div style={{ marginTop: 6, padding: 8, border: '1px solid var(--color-primary)', borderRadius: 6, background: '#f9fafb', minWidth: 260 }}>
                          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: '0.85em' }}>Nuevo producto</div>
                          <div className="form-group" style={{ marginBottom: 4 }}>
                            <label className="label">Nombre *</label>
                            <input className="input" value={newProductForm.name}
                              onChange={e => setNewProductForm(f => ({ ...f, name: e.target.value }))} />
                          </div>
                          <div className="form-group" style={{ marginBottom: 4 }}>
                            <label className="label">Proveedor *</label>
                            <select className="input" value={newProductForm.supplierId ?? ''}
                              onChange={e => setNewProductForm(f => ({ ...f, supplierId: e.target.value === '' ? null : parseInt(e.target.value) }))}>
                              <option value="">— Seleccionar —</option>
                              {suppliersList.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                            <div className="form-group">
                              <label className="label">SKU *</label>
                              <input className="input" value={newProductForm.sku}
                                onChange={e => setNewProductForm(f => ({ ...f, sku: e.target.value }))} />
                            </div>
                            <div className="form-group">
                              <label className="label">Cód. Barras</label>
                              <input className="input" value={newProductForm.barcode}
                                onChange={e => setNewProductForm(f => ({ ...f, barcode: e.target.value }))} />
                            </div>
                            <div className="form-group">
                              <label className="label">Costo *</label>
                              <input className="input" type="number" min={0} value={newProductForm.cost}
                                onChange={e => {
                                  const val = e.target.value
                                  const newPrice = calcSalePrice(parseFloat(val) || 0, parseFloat(newProductForm.gainPercent) || 0, newProductIvaPct)
                                  setNewProductForm(f => ({ ...f, cost: val, price: String(newPrice) }))
                                }} />
                            </div>
                            <div className="form-group">
                              <label className="label">Ganancia (%)</label>
                              <input className="input" type="number" min={0} value={newProductForm.gainPercent}
                                onChange={e => {
                                  const val = e.target.value
                                  const newPrice = calcSalePrice(parseFloat(newProductForm.cost) || 0, parseFloat(val) || 0, newProductIvaPct)
                                  setNewProductForm(f => ({ ...f, gainPercent: val, price: String(newPrice) }))
                                }} />
                            </div>
                          </div>
                          <div className="form-group" style={{ marginBottom: 4 }}>
                            <label className="label">IVA *</label>
                            <select className="input" value={newProductForm.taxRateId}
                              onChange={e => {
                                const newId = e.target.value
                                const newPct = taxRates.find(t => t.id === Number(newId))?.percentage ?? 0
                                const newPrice = calcSalePrice(parseFloat(newProductForm.cost) || 0, parseFloat(newProductForm.gainPercent) || 0, newPct)
                                setNewProductForm(f => ({ ...f, taxRateId: newId, price: String(newPrice) }))
                              }}>
                              <option value="">— Seleccionar —</option>
                              {taxRates.map(t => (
                                <option key={t.id} value={t.id}>{t.name} ({t.percentage}%)</option>
                              ))}
                            </select>
                          </div>
                          <div className="form-group" style={{ marginBottom: 6 }}>
                            <label className="label">Precio venta (c/ IVA) *</label>
                            <input className="input" type="number" min={0} value={newProductForm.price}
                              onChange={e => {
                                const val = e.target.value
                                const newGain = calcGainFromPrice(parseFloat(newProductForm.cost) || 0, parseFloat(val) || 0, newProductIvaPct)
                                setNewProductForm(f => ({ ...f, price: val, gainPercent: String(newGain) }))
                              }} />
                          </div>
                          {createError && <p className="error" style={{ fontSize: '0.8em', marginBottom: 4 }}>{createError}</p>}
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button type="button" className="btn btn-primary"
                              style={{ fontSize: '0.8em', padding: '4px 10px' }}
                              onClick={() => void handleCreateProduct()}
                              disabled={creatingProduct}>
                              {creatingProduct ? '⏳ Creando...' : '✅ Crear'}
                            </button>
                            <button type="button" className="btn btn-secondary"
                              style={{ fontSize: '0.8em', padding: '4px 10px' }}
                              onClick={() => { setNewProductIdx(null); setCreateError(null) }}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      {it.matchSource ? (
                        <span className={`badge ${SOURCE_LABELS[it.matchSource]?.cls ?? ''}`} style={{ fontSize: '0.75em' }}>
                          {SOURCE_LABELS[it.matchSource]?.label}
                        </span>
                      ) : (
                        <span className="badge badge--danger" style={{ fontSize: '0.75em' }}>❌ Sin coincidencia</span>
                      )}
                    </td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        value={it.confirmedQty}
                        onChange={e => updateItem(idx, { confirmedQty: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="input input--qty"
                        disabled={!it.include || !it.productId}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {unmatchedCount > 0 && (
            <p className="scanner-hint">
              💡 Para los ítems sin coincidencia, seleccioná el producto correspondiente en el desplegable o usá <strong>➕ Dar de alta</strong> para crear el artículo nuevo.
              El sistema recordará esa asociación para futuros remitos del mismo proveedor.
            </p>
          )}

          {saveError && <p className="error">{saveError}</p>}

          <div className="scanner-actions">
            <button className="btn btn-secondary" onClick={reset} disabled={saving}>← Volver</button>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => void handleConfirm()}
              disabled={saving || includedCount === 0}
            >
              {saving ? '⏳ Ingresando stock...' : `✅ Confirmar ingreso (${includedCount} productos)`}
            </button>
          </div>
        </div>
      )}

      {/* ── PASO 3: Éxito ────────────────────────────────────────────────── */}
      {step === 'done' && (
        <div className="scanner-done-card">
          <div className="scanner-done-icon">✅</div>
          <h2 className="scanner-done-title">¡Stock ingresado correctamente!</h2>
          <p className="scanner-done-sub">
            Se registraron <strong>{savedCount} movimientos de entrada</strong>.
          </p>
          {newMappingsCount > 0 && (
            <p className="scanner-done-sub" style={{ color: 'var(--color-primary)' }}>
              🔗 Se guardaron <strong>{newMappingsCount} mapeos nuevos</strong> — el sistema los recordará en futuros remitos.
            </p>
          )}
          <div className="scanner-actions">
            <button className="btn btn-secondary" onClick={reset}>📄 Escanear otro remito</button>
          </div>
        </div>
      )}
    </div>
  )
}
