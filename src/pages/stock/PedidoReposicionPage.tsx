import { useEffect, useState } from 'react'
import { suppliers as suppliersApi, pedido as pedidoApi, systemParams as systemParamsApi } from '../../lib/ipc'
import { localToday } from '../../lib/date'
import type { Supplier, PedidoProduct, PedidoItem, SystemParams } from '../../types/ipc'

type Step = 'selector' | 'pedido' | 'resumen'

export default function PedidoReposicionPage() {
  const [step, setStep] = useState<Step>('selector')

  // Selector de proveedor
  const [supplierList, setSupplierList] = useState<Supplier[]>([])
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)

  // Productos del proveedor
  const [products, setProducts] = useState<PedidoProduct[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [productError, setProductError] = useState<string | null>(null)

  // Items del pedido: productId → cantidad draft
  const [items, setItems] = useState<Record<number, PedidoItem>>({})
  const [cantidadDraft, setCantidadDraft] = useState<Record<number, string>>({})

  // Guardar archivo
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  // Parámetros del sistema (para el encabezado del archivo)
  const [sysParams, setSysParams] = useState<SystemParams | null>(null)

  useEffect(() => {
    void suppliersApi.list(true).then(setSupplierList)
    void systemParamsApi.get().then(setSysParams)
  }, [])

  async function handleSelectSupplier(supplier: Supplier) {
    setSelectedSupplier(supplier)
    setItems({})
    setCantidadDraft({})
    setProductError(null)
    setLoadingProducts(true)
    try {
      const prods = await pedidoApi.getSupplierProducts(supplier.id)
      setProducts(prods)
      setStep('pedido')
    } catch (err) {
      setProductError(err instanceof Error ? err.message : 'Error al cargar productos')
    } finally {
      setLoadingProducts(false)
    }
  }

  function setCantidad(product: PedidoProduct, raw: string) {
    setCantidadDraft(prev => ({ ...prev, [product.id]: raw }))
    const n = parseInt(raw, 10)
    if (!isNaN(n) && n > 0) {
      setItems(prev => ({ ...prev, [product.id]: { product, cantidad: n } }))
    } else {
      setItems(prev => {
        const next = { ...prev }
        delete next[product.id]
        return next
      })
    }
  }

  const pedidoItems = Object.values(items).filter(i => i.cantidad > 0)
  const totalCosto = pedidoItems.reduce((s, i) => s + i.product.cost * i.cantidad, 0)

  const currency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  // ── Generar contenido del archivo de texto ────────────────────────────────
  function buildFileContent(): string {
    const now = new Date()
    const fecha = now.toLocaleDateString('es-AR')
    const hora  = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    const sep   = '='.repeat(60)
    const sep2  = '-'.repeat(60)

    const lines: string[] = []

    lines.push(sep)
    lines.push('        PEDIDO DE REPOSICIÓN')
    lines.push(sep)
    lines.push('')

    // Encabezado con datos del comercio
    if (sysParams) {
      lines.push('DATOS DEL COMERCIO')
      lines.push(sep2)
      if (sysParams.denominacion) lines.push(`Denominación  : ${sysParams.denominacion}`)
      const dir = [sysParams.calle, sysParams.numero, sysParams.codigoPostal].filter(Boolean).join(' ')
      if (dir) lines.push(`Dirección     : ${dir}`)
      if (sysParams.contactoNombre) lines.push(`Contacto      : ${sysParams.contactoNombre}`)
      if (sysParams.contactoEmail)  lines.push(`Email         : ${sysParams.contactoEmail}`)
      if (sysParams.telefonoContacto) lines.push(`Teléfono      : ${sysParams.telefonoContacto}`)
      if (sysParams.cuitCuil)       lines.push(`CUIT/CUIL     : ${sysParams.cuitCuil}`)
      if (sysParams.categoriaIva)   lines.push(`Categoría     : ${sysParams.categoriaIva}`)
      lines.push('')
    }

    lines.push('PROVEEDOR')
    lines.push(sep2)
    lines.push(`Nombre        : ${selectedSupplier?.name ?? ''}`)
    if (selectedSupplier?.cuit)    lines.push(`CUIT          : ${selectedSupplier.cuit}`)
    if (selectedSupplier?.contact) lines.push(`Contacto      : ${selectedSupplier.contact}`)
    if (selectedSupplier?.email)   lines.push(`Email         : ${selectedSupplier.email}`)
    if (selectedSupplier?.phone)   lines.push(`Teléfono      : ${selectedSupplier.phone}`)
    lines.push('')

    lines.push(`Fecha         : ${fecha}   Hora: ${hora}`)
    lines.push('')

    lines.push('DETALLE DEL PEDIDO')
    lines.push(sep2)

    // Encabezado de tabla
    const col1 = 'Producto'.padEnd(35)
    const col2 = 'Cód. Proveedor'.padEnd(18)
    const col3 = 'Cantidad'.padStart(8)
    lines.push(`${col1} ${col2} ${col3}`)
    lines.push(sep2)

    for (const item of pedidoItems) {
      const name = item.product.name.slice(0, 34).padEnd(35)
      const code = (item.product.supplierCode || '---').slice(0, 17).padEnd(18)
      const qty  = String(item.cantidad).padStart(8)
      lines.push(`${name} ${code} ${qty}`)
    }

    lines.push(sep2)
    lines.push(`${'Total de ítems:'.padEnd(54)} ${String(pedidoItems.length).padStart(8)}`)
    lines.push(sep)
    lines.push('')
    lines.push('Generado por Ventas-Stock')

    return lines.join('\r\n')
  }

  async function handleSaveFile() {
    setSaving(true)
    setSaveMsg(null)
    setSaveErr(null)
    try {
      const content = buildFileContent()
      const fecha = localToday()
      const provNombre = (selectedSupplier?.name ?? 'proveedor').replace(/\s+/g, '_')
      const defaultName = `Pedido_${provNombre}_${fecha}.txt`
      const result = await pedidoApi.saveFile(content, defaultName)
      if (result.canceled) {
        // user cancelled dialog — do nothing
      } else if (result.success) {
        setSaveMsg(`✅ Archivo guardado en: ${result.filePath ?? ''}`)
      } else {
        setSaveErr(result.error ?? 'Error al guardar el archivo')
      }
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setSaving(false)
    }
  }

  function handleNuevoPedido() {
    setStep('selector')
    setSelectedSupplier(null)
    setProducts([])
    setItems({})
    setCantidadDraft({})
    setSaveMsg(null)
    setSaveErr(null)
  }

  // ── PASO 1: Selección de proveedor ────────────────────────────────────────
  if (step === 'selector') {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">📋 Pedido de Reposición</h1>
        </div>

        <p className="pedido-hint">Seleccioná el proveedor para ver sus productos y armar el pedido:</p>

        {loadingProducts && <p>Cargando productos...</p>}
        {productError && <p className="error">{productError}</p>}

        <div className="pedido-supplier-grid">
          {supplierList.map(s => (
            <button
              key={s.id}
              className="pedido-supplier-card"
              onClick={() => { void handleSelectSupplier(s) }}
              disabled={loadingProducts}
            >
              <span className="pedido-supplier-name">🏭 {s.name}</span>
              {s.contact && <span className="pedido-supplier-sub">{s.contact}</span>}
              {s.phone   && <span className="pedido-supplier-sub">📞 {s.phone}</span>}
            </button>
          ))}
          {supplierList.length === 0 && (
            <p className="muted-text">No hay proveedores cargados.</p>
          )}
        </div>
      </div>
    )
  }

  // ── PASO 2: Armar pedido ──────────────────────────────────────────────────
  if (step === 'pedido') {
    return (
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">📋 Pedido — {selectedSupplier?.name}</h1>
          <button className="btn btn-ghost" onClick={handleNuevoPedido}>← Cambiar proveedor</button>
        </div>

        <div className="pedido-layout">
          {/* Tabla de productos */}
          <div className="pedido-products">
            <p className="pedido-hint">
              Ingresá la cantidad para los productos que querés pedir.
              Los marcados con ⚠️ tienen stock bajo.
            </p>

            {products.length === 0 ? (
              <p className="muted-text">Este proveedor no tiene productos activos asignados.</p>
            ) : (
              <table className="table pedido-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Cód. Proveedor</th>
                    <th className="text-right">Stock actual</th>
                    <th className="text-right">Stock mín.</th>
                    <th className="text-right" style={{ width: 110 }}>Cantidad a pedir</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => {
                    const inPedido = !!items[p.id]
                    return (
                      <tr key={p.id} className={`${p.isLow ? 'pedido-row--low' : ''} ${inPedido ? 'pedido-row--selected' : ''}`}>
                        <td>
                          {p.isLow && <span className="pedido-low-badge">⚠️</span>}
                          {p.name}
                        </td>
                        <td className="muted-text">{p.supplierCode || '—'}</td>
                        <td className={`text-right ${p.stockQuantity === 0 ? 'text-danger' : p.isLow ? 'text-warn' : ''}`}>
                          {p.stockQuantity}
                        </td>
                        <td className="text-right muted-text">{p.stockMin}</td>
                        <td className="text-right">
                          <input
                            type="number"
                            min={0}
                            value={cantidadDraft[p.id] ?? ''}
                            onChange={e => setCantidad(p, e.target.value)}
                            onFocus={e => e.target.select()}
                            placeholder="0"
                            className="input input--qty"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Panel lateral de resumen */}
          <div className="pedido-sidebar">
            <div className="pedido-summary-card">
              <h3 className="pedido-summary-title">Resumen del pedido</h3>

              {pedidoItems.length === 0 ? (
                <p className="muted-text">Aún no seleccionaste productos.</p>
              ) : (
                <>
                  <ul className="pedido-summary-list">
                    {pedidoItems.map(item => (
                      <li key={item.product.id} className="pedido-summary-item">
                        <span className="pedido-summary-name">{item.product.name}</span>
                        <span className="pedido-summary-qty">× {item.cantidad}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="pedido-summary-total">
                    <span>Ítems:</span>
                    <strong>{pedidoItems.length}</strong>
                  </div>
                  <div className="pedido-summary-total">
                    <span>Costo estimado:</span>
                    <strong>{currency(totalCosto)}</strong>
                  </div>
                </>
              )}

              <button
                className="btn btn-primary btn-block"
                disabled={pedidoItems.length === 0}
                onClick={() => setStep('resumen')}
                style={{ marginTop: 16 }}
              >
                Ver resumen →
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── PASO 3: Resumen y cierre ──────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">📋 Confirmar Pedido</h1>
        <button className="btn btn-ghost" onClick={() => setStep('pedido')}>← Modificar pedido</button>
      </div>

      <div className="pedido-resumen">
        {/* Encabezado comercio */}
        {sysParams?.denominacion && (
          <div className="pedido-resumen-header">
            <div className="pedido-resumen-comercio">
              <strong>{sysParams.denominacion}</strong>
              {(sysParams.calle || sysParams.numero) && (
                <span>{[sysParams.calle, sysParams.numero, sysParams.codigoPostal].filter(Boolean).join(' ')}</span>
              )}
              {sysParams.telefonoContacto && <span>📞 {sysParams.telefonoContacto}</span>}
              {sysParams.contactoEmail    && <span>✉️ {sysParams.contactoEmail}</span>}
            </div>
          </div>
        )}

        <div className="pedido-resumen-proveedor">
          <strong>Proveedor:</strong> {selectedSupplier?.name}
          {selectedSupplier?.contact && <span> — {selectedSupplier.contact}</span>}
        </div>

        <table className="table" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cód. Proveedor</th>
              <th className="text-right">Cantidad</th>
              <th className="text-right">Costo unit.</th>
              <th className="text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {pedidoItems.map(item => (
              <tr key={item.product.id}>
                <td>{item.product.name}</td>
                <td className="muted-text">{item.product.supplierCode || '—'}</td>
                <td className="text-right">{item.cantidad}</td>
                <td className="text-right">{currency(item.product.cost)}</td>
                <td className="text-right">{currency(item.product.cost * item.cantidad)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="pedido-resumen-tfoot">
              <td colSpan={2}><strong>TOTAL</strong></td>
              <td className="text-right"><strong>{pedidoItems.length} ítems</strong></td>
              <td></td>
              <td className="text-right"><strong>{currency(totalCosto)}</strong></td>
            </tr>
          </tfoot>
        </table>

        {saveMsg && <p className="pedido-save-ok">{saveMsg}</p>}
        {saveErr && <p className="error">{saveErr}</p>}

        <div className="pedido-resumen-actions">
          <button className="btn btn-ghost" onClick={handleNuevoPedido}>
            🔄 Nuevo pedido
          </button>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => { void handleSaveFile() }}
            disabled={saving}
          >
            {saving ? '⏳ Guardando...' : '💾 Cerrar pedido y guardar archivo'}
          </button>
        </div>
      </div>
    </div>
  )
}
