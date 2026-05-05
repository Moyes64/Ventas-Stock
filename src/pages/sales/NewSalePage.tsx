import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { catalog, customers, sales, printing } from '../../lib/ipc'
import type { Product, Customer, Sale } from '../../types/ipc'
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
  const [processing, setProcessing] = useState(false)
  const [isBlackSale, setIsBlackSale] = useState(false)
  const [result, setResult] = useState<Sale | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [printError, setPrintError] = useState<string | null>(null)
  const [isPrinting, setIsPrinting] = useState(false)
  const { isHiddenOptionsVisible } = useHiddenOptions()

  useEffect(() => {
    // eslint-disable-next-line no-console
    customers.list().then(setCustomerList).catch(console.error)
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
          taxRate: 21, // Will be fetched from product's taxRate
          subtotal: product.price,
        },
      ]
    })
    setProductResults([])
    setSearchQuery('')
  }

  function removeFromCart(productId: number) {
    setCart(prev => prev.filter(item => item.product.id !== productId))
  }

  function updateQuantity(productId: number, quantity: number) {
    if (quantity <= 0) {
      removeFromCart(productId)
      return
    }
    setCart(prev =>
      prev.map(item =>
        item.product.id === productId
          ? { ...item, quantity, subtotal: quantity * item.unitPrice }
          : item
      )
    )
  }

  const cartTotal = cart.reduce((sum, item) => sum + item.subtotal, 0)
  const cartTax = cart.reduce((sum, item) => {
    const base = item.subtotal / (1 + item.taxRate / 100)
    return sum + (item.subtotal - base)
  }, 0)
  // For black sales, the total is the base price (no IVA)
  const cartTotalBlack = cartTotal - cartTax

  async function handleCheckout() {
    if (cart.length === 0) {
      setError('El carrito está vacío')
      return
    }
    setProcessing(true)
    setError(null)
    try {
      const saleResult = await sales.create({
        customerId: selectedCustomerId ?? undefined,
        invoiceType: 11, // Factura C por defecto
        isBlackSale,
        items: cart.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate,
        })),
      })
      setResult(saleResult)
      setCart([])
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

  // Show result screen after successful sale
  if (result) {
    return (
      <div className="page">
        <div className="sale-result">
          {result.isBlackSale ? (
            <div className="sale-result--black">
              <h2>📄 Venta N — Comprobante Interno</h2>
              <p>Venta en negro registrada como comprobante interno (sin IVA).</p>
              <p><strong>Remito Interno N°:</strong> {result.id}</p>
              <p><strong>Total (sin IVA):</strong> {currency(result.total)}</p>
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
                <span className="black-sale-toggle__label">🅽 Venta N (sin IVA)</span>
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
                          value={item.quantity}
                          min="1"
                          onChange={e => updateQuantity(item.product.id, parseInt(e.target.value, 10))}
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
                {isBlackSale ? (
                  <>
                    <div className="cart-total-row">
                      <span>Subtotal (sin IVA):</span>
                      <span>{currency(cartTotalBlack)}</span>
                    </div>
                    <div className="cart-total-row">
                      <span>IVA:</span>
                      <span>{currency(0)}</span>
                    </div>
                    <div className="cart-total-row cart-total-row--total cart-total-row--black">
                      <span>TOTAL N:</span>
                      <span>{currency(cartTotalBlack)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="cart-total-row">
                      <span>Subtotal (sin IVA):</span>
                      <span>{currency(cartTotal - cartTax)}</span>
                    </div>
                    <div className="cart-total-row">
                      <span>IVA:</span>
                      <span>{currency(cartTax)}</span>
                    </div>
                    <div className="cart-total-row cart-total-row--total">
                      <span>TOTAL:</span>
                      <span>{currency(cartTotal)}</span>
                    </div>
                  </>
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
                    ? `💵 Confirmar Venta N ${currency(cartTotalBlack)}`
                    : `💳 Confirmar Venta ${currency(cartTotal)}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
