import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { catalog, customers, sales, printing, parameters as parametersApi } from '../../lib/ipc'
import type { Product, Customer, Sale, Parameter, PaymentMethod } from '../../types/ipc'
import { useHiddenOptions } from '../../context/HiddenOptionsContext'

interface CartItem {
  product: Product
  quantity: number
  unitPrice: number
  taxRate: number
  subtotal: number
}

export default function NewSalePage() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [productResults, setProductResults] = useState<Product[]>([])
  const [customerList, setCustomerList] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [quantityDrafts, setQuantityDrafts] = useState<Record<number, string>>({})
  const [processing, setProcessing] = useState(false)
  const [isBlackSale, setIsBlackSale] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('contado_efectivo')
  const [result, setResult] = useState<Sale | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [printError, setPrintError] = useState<string | null>(null)
  const [isPrinting, setIsPrinting] = useState(false)
  const { isHiddenOptionsVisible } = useHiddenOptions()

  // Parameters
  const [parameterList, setParameterList] = useState<Parameter[]>([])
  const [selectedParameters, setSelectedParameters] = useState<Parameter[]>([])
  const [paramSelectValue, setParamSelectValue] = useState('')

  useEffect(() => {
    // eslint-disable-next-line no-console
    customers.list().then(setCustomerList).catch(console.error)
    // eslint-disable-next-line no-console
    parametersApi.list().then(setParameterList).catch(console.error)
  }, [])

  // Reset black sale mode when hidden options become invisible
  useEffect(() => {
    if (!isHiddenOptionsVisible) setIsBlackSale(false)
  }, [isHiddenOptionsVisible])

  async function handleSearch(query: string) {
    setSearchQuery(query)
    if (query.length < 2) {
      setProductResults([])
      return
    }
    try {
      // Try barcode first
      const byBarcode = await catalog.getByBarcode(query)
      if (byBarcode) {
        addToCart(byBarcode)
        setSearchQuery('')
        setProductResults([])
        return
      }
      const results = await catalog.searchProducts(query)
      setProductResults(results)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err)
    }
  }

  function addToCart(product: Product) {
    setQuantityDrafts(prev => {
      const next = { ...prev }
      delete next[product.id]
      return next
    })
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id)
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.unitPrice }
            : item
        )
      }
      return [
        ...prev,
        {
          product,
          quantity: 1,
          unitPrice: product.price,
          taxRate: 21,
          subtotal: product.price,
        },
      ]
    })
    setError(null)
    setProductResults([])
    setSearchQuery('')
  }

  function removeFromCart(productId: number) {
    setCart(prev => prev.filter(item => item.product.id !== productId))
    setQuantityDrafts(prev => {
      const next = { ...prev }
      delete next[productId]
      return next
    })
    setError(null)
  }

  function updateQuantity(productId: number, quantity: number) {
    if (Number.isNaN(quantity) || quantity < 0) return
    setCart(prev =>
      prev.map(item =>
        item.product.id === productId
          ? { ...item, quantity, subtotal: quantity * item.unitPrice }
          : item
      )
    )
    setError(null)
  }

  // ── Parameter management ──────────────────────────────────────────────────

  function addParameter(paramId: string) {
    if (!paramId) return
    const id = Number(paramId)
    const param = parameterList.find(p => p.id === id)
    if (!param) return
    // Avoid duplicates
    if (selectedParameters.some(p => p.id === id)) return
    setSelectedParameters(prev => [...prev, param])
    setParamSelectValue('')
  }

  function removeParameter(paramId: number) {
    setSelectedParameters(prev => prev.filter(p => p.id !== paramId))
  }

  // ── Totals calculation ────────────────────────────────────────────────────

  // Catalog total: sum of item subtotals (unitPrice includes IVA)
  const catalogSubtotal = cart.reduce((sum, item) => sum + item.subtotal, 0)

  // Base totals from cart items (unitPrice includes IVA)
  const baseSubtotal = cart.reduce((sum, item) => {
    const taxFactor = item.taxRate / 100
    return sum + item.subtotal / (1 + taxFactor)
  }, 0)
  const baseTaxAmount = cart.reduce((sum, item) => {
    const taxFactor = item.taxRate / 100
    const base = item.subtotal / (1 + taxFactor)
    return sum + (item.subtotal - base)
  }, 0)

  // Apply parameters sequentially on the base subtotal
  let adjustedSubtotal = baseSubtotal
  for (const param of selectedParameters) {
    if (param.tipo === '-') {
      adjustedSubtotal *= 1 - param.porcentaje / 100
    } else {
      adjustedSubtotal *= 1 + param.porcentaje / 100
    }
  }

  const adjustmentFactor = baseSubtotal > 0 ? adjustedSubtotal / baseSubtotal : 1
  const adjustedTaxAmount = baseTaxAmount * adjustmentFactor
  const cartTotal = adjustedSubtotal + adjustedTaxAmount

  // ── Checkout ──────────────────────────────────────────────────────────────

  async function handleCheckout() {
    const itemsForCheckout = cart.filter(item => item.quantity > 0)
    if (itemsForCheckout.length === 0) {
      setError('El carrito está vacío')
      return
    }
    if (itemsForCheckout.length !== cart.length) {
      setCart(itemsForCheckout)
      setQuantityDrafts(prev => {
        const next: Record<number, string> = {}
        for (const item of itemsForCheckout) {
          if (prev[item.product.id] !== undefined) next[item.product.id] = prev[item.product.id]
        }
        return next
      })
    }
    setProcessing(true)
    setError(null)
    try {
      const saleResult = await sales.create({
        customerId: selectedCustomerId ?? undefined,
        invoiceType: 11, // Factura C por defecto
        isBlackSale,
        paymentMethod,
        parameterIds: selectedParameters.map(p => p.id),
        items: itemsForCheckout.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate,
        })),
      })
      setResult(saleResult)
      setCart([])
      setSelectedParameters([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar la venta')
    } finally {
      setProcessing(false)
    }
  }

  const currency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  async function handlePrintInvoice(saleId: number) {
    setIsPrinting(true)
    setPrintError(null)
    try {
      const res = await printing.printInvoiceSystem(saleId)
      if (!res.success) setPrintError(res.error ?? 'Error al imprimir')
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Error al imprimir')
    } finally {
      setIsPrinting(false)
    }
  }

  async function handlePrintDelivery(saleId: number) {
    setIsPrinting(true)
    setPrintError(null)
    try {
      const res = await printing.printDeliveryNoteSystem(saleId)
      if (!res.success) setPrintError(res.error ?? 'Error al imprimir')
    } catch (err) {
      setPrintError(err instanceof Error ? err.message : 'Error al imprimir')
    } finally {
      setIsPrinting(false)
    }
  }

  // ── Result screen ─────────────────────────────────────────────────────────

  if (result) {
    return (
      <div className="page">
        <div className="sale-result">
          {result.isBlackSale ? (
            <div className="sale-result--black">
              <h2>📄 Venta N — Comprobante Interno</h2>
              <p>Venta en negro registrada como comprobante interno (sin CAE).</p>
              <p><strong>Remito Interno N°:</strong> {result.id}</p>
              <p><strong>Total:</strong> {currency(result.total)}</p>
            </div>
          ) : result.status === 'AUTHORIZED' ? (
            <div className="sale-result--success">
              <h2>✅ Factura Autorizada por AFIP</h2>
              <p><strong>Venta N°:</strong> {result.id}</p>
              <p><strong>CAE:</strong> {result.cae}</p>
              <p><strong>Vto. CAE:</strong> {result.caeVto}</p>
              <p><strong>Total:</strong> {currency(result.total)}</p>
            </div>
          ) : (
            <div className="sale-result--internal">
              <h2>📄 Comprobante Interno</h2>
              <p>La factura no pudo ser autorizada por AFIP en este momento.</p>
              {result.afipError && (
                <p className="error"><small>Error AFIP: {result.afipError}</small></p>
              )}
              <p><strong>Remito Interno N°:</strong> {result.id}</p>
              <p><strong>Total:</strong> {currency(result.total)}</p>
            </div>
          )}
          {printError && <p className="error">{printError}</p>}
          <div className="action-buttons">
            {result.status === 'AUTHORIZED' ? (
              <button
                className="btn btn-secondary"
                onClick={() => void handlePrintInvoice(result.id)}
                disabled={isPrinting}
              >
                {isPrinting ? '⏳' : '🖨️'} Imprimir Factura
              </button>
            ) : (
              <button
                className="btn btn-secondary"
                onClick={() => void handlePrintDelivery(result.id)}
                disabled={isPrinting}
              >
                {isPrinting ? '⏳' : '🖨️'} Imprimir Remito
              </button>
            )}
            <button className="btn btn-primary" onClick={() => navigate('/sales')}>
              Ver Ventas
            </button>
            <button className="btn btn-secondary" onClick={() => setResult(null)}>
              Nueva Venta
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main sale form ────────────────────────────────────────────────────────

  const availableParameters = parameterList.filter(
    p => !selectedParameters.some(s => s.id === p.id)
  )

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Nueva Venta</h1>
        <button className="btn btn-ghost" onClick={() => navigate('/sales')}>← Volver</button>
      </div>

      <div className="sale-layout">
        {/* Left: Product Search */}
        <div className="sale-search">
          <label className="label">Buscar producto (nombre o código de barras)</label>
          <input
            type="text"
            value={searchQuery}
            onChange={e => { void handleSearch(e.target.value) }}
            placeholder="Escanear código o buscar por nombre..."
            className="input input--large"
            autoFocus
          />
          {productResults.length > 0 && (
            <ul className="product-results">
              {productResults.map(p => (
                <li key={p.id}>
                  <button className="product-result-item" onClick={() => addToCart(p)}>
                    <span className="product-result-name">{p.name}</span>
                    <span className="product-result-sku">{p.sku}</span>
                    <span className="product-result-price">{currency(p.price)}</span>
                    <span className="product-result-stock">Stock: {p.stockQuantity}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="customer-select">
            <label className="label">Cliente</label>
            <select
              value={selectedCustomerId ?? ''}
              onChange={e => setSelectedCustomerId(e.target.value ? Number(e.target.value) : null)}
              className="select"
            >
              <option value="">Consumidor Final</option>
              {customerList.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.cuitDni ? `(${c.cuitDni})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="customer-select">
            <label className="label">Tipo de pago</label>
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
              className="select"
            >
              <option value="contado_efectivo">💵 Contado Efectivo</option>
              <option value="transferencia">🏦 Transferencia</option>
              <option value="debito">💳 Débito</option>
              <option value="credito">💳 Crédito</option>
            </select>
          </div>

          {/* Parameters */}
          <div className="sale-params">
            <label className="label">Parámetros (descuentos / recargos)</label>
            <div className="sale-params-add">
              <select
                value={paramSelectValue}
                onChange={e => addParameter(e.target.value)}
                className="select"
              >
                <option value="">— Agregar parámetro —</option>
                {availableParameters.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.tipo}{p.porcentaje}% — {p.descripcion}
                  </option>
                ))}
              </select>
            </div>
            {selectedParameters.length > 0 && (
              <ul className="sale-params-list">
                {selectedParameters.map(p => (
                  <li key={p.id} className="sale-params-item">
                    <span className={`sale-params-badge sale-params-badge--${p.tipo === '-' ? 'discount' : 'surcharge'}`}>
                      {p.tipo}{p.porcentaje}%
                    </span>
                    <span className="sale-params-name">{p.descripcion}</span>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => removeParameter(p.id)}
                    >✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: Cart */}
        <div className="sale-cart">
          <div className="cart-header">
            <h2>Carrito</h2>
            {isHiddenOptionsVisible && (
              <label className="black-sale-toggle">
                <input
                  type="checkbox"
                  checked={isBlackSale}
                  onChange={e => setIsBlackSale(e.target.checked)}
                />
                <span className="black-sale-toggle__label">🅽 Venta N (sin CAE)</span>
              </label>
            )}
          </div>
          {cart.length === 0 ? (
            <p className="empty-cart">No hay productos. Busque y agregue productos.</p>
          ) : (
            <>
              <table className="table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Precio</th>
                    <th>Cant.</th>
                    <th>Subtotal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map(item => (
                    <tr key={item.product.id}>
                      <td>{item.product.name}</td>
                      <td>{currency(item.unitPrice)}</td>
                      <td>
                        <input
                          type="number"
                          value={quantityDrafts[item.product.id] ?? String(item.quantity)}
                          min="0"
                          onChange={e => {
                            const raw = e.target.value
                            setQuantityDrafts(prev => ({ ...prev, [item.product.id]: raw }))
                            if (raw.trim() === '') return
                            const parsed = parseInt(raw, 10)
                            if (!Number.isNaN(parsed) && parsed >= 0) updateQuantity(item.product.id, parsed)
                          }}
                          onBlur={() => {
                            const raw = quantityDrafts[item.product.id]
                            if (raw === undefined) return
                            if (raw.trim() === '') {
                              setQuantityDrafts(prev => ({ ...prev, [item.product.id]: '0' }))
                              updateQuantity(item.product.id, 0)
                              return
                            }
                            const parsed = parseInt(raw, 10)
                            const normalized = Number.isNaN(parsed) ? 0 : Math.max(0, parsed)
                            setQuantityDrafts(prev => ({ ...prev, [item.product.id]: String(normalized) }))
                            updateQuantity(item.product.id, normalized)
                          }}
                          onFocus={e => e.target.select()}
                          className="input input--qty"
                        />
                      </td>
                      <td>{currency(item.subtotal)}</td>
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => removeFromCart(item.product.id)}
                        >✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="cart-totals">
                {selectedParameters.length > 0 ? (
                  <>
                    <div className="cart-total-row">
                      <span>Subtotal:</span>
                      <span>{currency(catalogSubtotal)}</span>
                    </div>
                    {selectedParameters.map((p, idx) => {
                      // Recalculate running base (catalog price with IVA) up to this parameter
                      let runBase = catalogSubtotal
                      for (let i = 0; i < idx; i++) {
                        const pp = selectedParameters[i]
                        runBase *= pp.tipo === '-' ? 1 - pp.porcentaje / 100 : 1 + pp.porcentaje / 100
                      }
                      const amount = runBase * (p.porcentaje / 100)
                      return (
                        <div key={p.id} className={`cart-total-row ${p.tipo === '-' ? 'cart-total-row--discount' : 'cart-total-row--surcharge'}`}>
                          <span>{p.tipo === '-' ? 'Dto.' : 'Rec.'} {p.descripcion} ({p.porcentaje}%):</span>
                          <span>{p.tipo === '-' ? '-' : '+'}{currency(amount)}</span>
                        </div>
                      )
                    })}
                    <div className={`cart-total-row cart-total-row--total${isBlackSale ? ' cart-total-row--black' : ''}`}>
                      <span>{isBlackSale ? 'TOTAL N:' : 'TOTAL:'}</span>
                      <span>{currency(cartTotal)}</span>
                    </div>
                  </>
                ) : (
                  <div className={`cart-total-row cart-total-row--total${isBlackSale ? ' cart-total-row--black' : ''}`}>
                    <span>{isBlackSale ? 'TOTAL N:' : 'TOTAL:'}</span>
                    <span>{currency(cartTotal)}</span>
                  </div>
                )}
              </div>

              {error && <p className="error">{error}</p>}

              <button
                className={`btn btn-lg btn-block ${isBlackSale ? 'btn-black-sale' : 'btn-primary'}`}
                onClick={() => { void handleCheckout() }}
                disabled={processing}
              >
                {processing
                  ? '⏳ Procesando...'
                  : isBlackSale
                    ? `💵 Confirmar Venta N ${currency(cartTotal)}`
                    : `💳 Confirmar Venta ${currency(cartTotal)}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
