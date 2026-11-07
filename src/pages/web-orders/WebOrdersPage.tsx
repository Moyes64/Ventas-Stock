import { useState, useEffect, useCallback } from 'react'
import { sync } from '../../lib/ipc'
import type { PullResult } from '../../types/ipc'
import { formatDateTime } from '../../lib/date'

interface WebOrder {
  id: number
  externalId: string
  customerName: string
  customerEmail: string
  customerPhone: string
  customerDocType?: string
  customerDocNumber?: string
  deliveryType: 'pickup' | 'shipping'
  deliveryAddress: string
  total: number
  paymentMethod: string
  status: string
  invoiceNumber: number | null
  puntoVenta: number | null
  fulfillmentStatus: 'pending' | 'ready' | 'shipped' | 'delivered'
  notifiedAt: string | null
  deliveredAt: string | null
  items: Array<{
    productId: number
    productName: string
    quantity: number
    unitPrice: number
  }>
  createdAt: string
}

type TabType = 'pending' | 'notified' | 'delivered'

export default function WebOrdersPage() {
  const [pulling, setPulling] = useState(false)
  const [loading, setLoading] = useState(true)
  const [lastResult, setLastResult] = useState<PullResult | null>(null)
  const [tab, setTab] = useState<TabType>('pending')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [allOrders, setAllOrders] = useState<WebOrder[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [printingId, setPrintingId] = useState<string | null>(null)
  // Texto opcional que se agrega al aviso (p. ej. cómo se envió y cuándo llega)
  const [notes, setNotes] = useState<Record<string, string>>({})

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await sync.listWebOrders()
      setAllOrders(rows as WebOrder[])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadOrders() }, [loadOrders])

  async function handlePull() {
    setPulling(true)
    try {
      const result = await sync.pullOrders()
      setLastResult(result)
      await loadOrders()
    } catch (err) {
      setLastResult({
        success: false,
        ordersProcessed: 0,
        errors: [err instanceof Error ? err.message : 'Error desconocido'],
        timestamp: new Date().toISOString(),
      })
    } finally {
      setPulling(false)
    }
  }

  async function handlePrintLabel(order: WebOrder) {
    setPrintingId(order.externalId)
    try {
      const res = await sync.printShippingLabel({
        customerName: order.customerName,
        deliveryAddress: order.deliveryAddress,
        externalId: order.externalId,
      })
      if (!res.success) alert(`Error al imprimir: ${res.error}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al imprimir etiqueta')
    } finally {
      setPrintingId(null)
    }
  }

  async function handleNotify(order: WebOrder) {
    const kind = order.deliveryType === 'shipping' ? 'shipped' : 'ready'
    const yaFacturada = order.status === 'AUTHORIZED'
    const accion = kind === 'ready' ? 'que el pedido está listo para retirar' : 'que el pedido fue despachado'
    if (!window.confirm(
      (yaFacturada
        ? `Se le va a avisar a ${order.customerEmail} ${accion}, con la factura adjunta.`
        : `Se va a emitir la factura AFIP por ${fmt(order.total)} (comprobante fiscal real, no se puede deshacer) ` +
          `y avisarle a ${order.customerEmail} ${accion}, con la factura adjunta.`) +
      '\n\n¿Continuar?'
    )) return
    setBusyId(order.externalId)
    try {
      const res = await sync.notifyWebOrder(order.externalId, kind, notes[order.externalId] ?? '')
      if (!res.success) alert(res.error ?? 'Error desconocido')
      await loadOrders()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al avisar al cliente')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelivered(order: WebOrder) {
    if (!window.confirm(`¿Marcar el pedido de ${order.customerName} como entregado? No se manda mail.`)) return
    setBusyId(order.externalId)
    try {
      await sync.markWebOrderDelivered(order.externalId)
      await loadOrders()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al marcar como entregado')
    } finally {
      setBusyId(null)
    }
  }

  const pendingOrders = allOrders.filter(o => o.fulfillmentStatus === 'pending')
  const notifiedOrders = allOrders.filter(o => o.fulfillmentStatus === 'ready' || o.fulfillmentStatus === 'shipped')
  const deliveredOrders = allOrders.filter(o => o.fulfillmentStatus === 'delivered')
  const orders = tab === 'pending' ? pendingOrders : tab === 'notified' ? notifiedOrders : deliveredOrders

  function badge(o: WebOrder): { text: string; bg: string; fg: string } {
    switch (o.fulfillmentStatus) {
      case 'ready':     return { text: 'LISTO PARA RETIRAR', bg: '#dbeafe', fg: '#1e40af' }
      case 'shipped':   return { text: 'DESPACHADO', bg: '#dbeafe', fg: '#1e40af' }
      case 'delivered': return { text: 'ENTREGADO', bg: '#dcfce7', fg: '#166534' }
      default:          return { text: 'PENDIENTE', bg: '#fef3c7', fg: '#92400e' }
    }
  }

  function fmt(n: number) {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">🛒 Órdenes Web</h1>
          <p className="page-subtitle">Pedidos recibidos desde la tienda online</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {lastResult && (
            <span style={{
              fontSize: '12px',
              color: lastResult.success ? '#16a34a' : '#dc2626',
              opacity: 0.8,
            }}>
              {lastResult.success
                ? `✓ ${lastResult.ordersProcessed} orden(es) procesada(s)`
                : `✗ ${lastResult.errors[0] ?? 'Error'}`}
            </span>
          )}
          <button
            className="btn btn-primary"
            onClick={handlePull}
            disabled={pulling}
          >
            {pulling ? '⏳ Verificando...' : '⬇️ Verificar nuevas órdenes'}
          </button>
        </div>
      </div>

      {/* Errores del pull */}
      {lastResult && lastResult.errors.length > 0 && (
        <div style={{
          margin: '0 0 16px',
          padding: '12px 16px',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          fontSize: '13px',
          color: '#dc2626',
        }}>
          {lastResult.errors.map((e, i) => <div key={i}>⚠️ {e}</div>)}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '2px solid #e5e7eb' }}>
        {([
          { key: 'pending',   label: 'Pendientes', count: pendingOrders.length },
          { key: 'notified',  label: 'Avisadas',   count: notifiedOrders.length },
          { key: 'delivered', label: 'Entregadas', count: deliveredOrders.length },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: tab === t.key ? 700 : 400,
              borderBottom: tab === t.key ? '2px solid #2563eb' : '2px solid transparent',
              color: tab === t.key ? '#2563eb' : '#6b7280',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              marginBottom: '-2px',
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span style={{
                marginLeft: '6px',
                backgroundColor: tab === t.key ? '#2563eb' : '#9ca3af',
                color: 'white',
                borderRadius: '9999px',
                fontSize: '11px',
                padding: '1px 7px',
              }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Lista de órdenes */}
      {orders.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: '#9ca3af',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>
            {tab === 'pending' ? '📭' : '📬'}
          </div>
          <p style={{ fontSize: '15px', marginBottom: '8px' }}>
            {tab === 'pending'
              ? 'No hay órdenes pendientes'
              : tab === 'notified' ? 'No hay pedidos esperando entrega' : 'No hay pedidos entregados'}
          </p>
          {tab === 'pending' && (
            <p style={{ fontSize: '13px' }}>
              Hacé click en <strong>"Verificar nuevas órdenes"</strong> para descargar pedidos pagados de la tienda web.
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {orders.map(order => (
            <div
              key={order.externalId}
              style={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                overflow: 'hidden',
              }}
            >
              {/* Cabecera orden */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
                onClick={() => setExpandedId(expandedId === order.externalId ? null : order.externalId)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{order.customerName}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{order.customerEmail}</div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    {order.deliveryType === 'pickup' ? '🏪 Retiro en local' : '🚚 Envío a domicilio'}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: '15px' }}>{fmt(order.total)}</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>{formatDateTime(order.createdAt)}</div>
                  </div>
                  {order.status === 'AUTHORIZED' && (
                    <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '9999px', backgroundColor: '#ede9fe', color: '#5b21b6' }}>
                      🧾 FACTURADA
                    </span>
                  )}
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '9999px',
                    backgroundColor: badge(order).bg,
                    color: badge(order).fg,
                  }}>
                    {badge(order).text}
                  </span>
                  <span style={{ color: '#9ca3af' }}>{expandedId === order.externalId ? '▾' : '▸'}</span>
                </div>
              </div>

              {/* Detalle expandido */}
              {expandedId === order.externalId && (
                <div style={{
                  borderTop: '1px solid #f3f4f6',
                  padding: '14px 16px',
                  backgroundColor: '#f9fafb',
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '14px' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase' }}>
                        Datos del cliente
                      </div>
                      <div style={{ fontSize: '13px' }}>{order.customerName}</div>
                      <div style={{ fontSize: '13px', color: '#6b7280' }}>{order.customerEmail}</div>
                      {order.customerPhone && <div style={{ fontSize: '13px', color: '#6b7280' }}>{order.customerPhone}</div>}
                      {order.customerDocNumber && (
                        <div style={{ fontSize: '13px', color: '#6b7280' }}>
                          {order.customerDocType ?? 'Doc'}: {order.customerDocNumber}
                        </div>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase' }}>
                        Entrega
                      </div>
                      <div style={{ fontSize: '13px' }}>
                        {order.deliveryType === 'pickup' ? '🏪 Retiro en local' : '🚚 Envío a domicilio'}
                      </div>
                      {order.deliveryAddress && (
                        <div style={{ fontSize: '13px', color: '#6b7280' }}>{order.deliveryAddress}</div>
                      )}
                    </div>
                  </div>

                  {/* Items */}
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Productos
                  </div>
                  <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: '#6b7280' }}>Producto</th>
                        <th style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 600, color: '#6b7280' }}>Cant.</th>
                        <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600, color: '#6b7280' }}>Precio unit.</th>
                        <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600, color: '#6b7280' }}>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '6px 8px' }}>{item.productName}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>{item.quantity}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmt(item.unitPrice)}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{fmt(item.unitPrice * item.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700 }}>Total</td>
                        <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700 }}>{fmt(order.total)}</td>
                      </tr>
                    </tfoot>
                  </table>

                  {order.fulfillmentStatus === 'pending' && (
                    <div style={{ marginTop: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: '4px', textTransform: 'uppercase' }}>
                        Nota para el cliente (opcional, va en el aviso)
                      </div>
                      <textarea
                        value={notes[order.externalId] ?? ''}
                        onChange={e => setNotes(n => ({ ...n, [order.externalId]: e.target.value }))}
                        rows={2}
                        placeholder={order.deliveryType === 'shipping'
                          ? 'Ej.: Lo enviamos por moto, llega hoy entre las 16 y las 19 hs.'
                          : 'Ej.: Te lo dejamos separado hasta el sábado.'}
                        style={{ width: '100%', fontSize: '13px', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '6px', resize: 'vertical', boxSizing: 'border-box' }}
                      />
                    </div>
                  )}
                  {(order.status === 'AUTHORIZED' || order.notifiedAt || order.deliveredAt) && (
                    <div style={{ marginTop: '10px', fontSize: '12px', color: '#4b5563', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                      {order.status === 'AUTHORIZED' && (
                        <span>🧾 Factura {order.puntoVenta && order.invoiceNumber
                          ? `${String(order.puntoVenta).padStart(5, '0')}-${String(order.invoiceNumber).padStart(8, '0')}`
                          : `venta #${order.id}`}</span>
                      )}
                      {order.notifiedAt && <span>📧 Avisado el {formatDateTime(order.notifiedAt)}</span>}
                      {order.deliveredAt && <span>📦 Entregado el {formatDateTime(order.deliveredAt)}</span>}
                    </div>
                  )}

                  <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#9ca3af' }}>Ref: {order.externalId}</div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {order.deliveryType === 'shipping' && (
                        <button
                          onClick={() => { void handlePrintLabel(order) }}
                          disabled={printingId === order.externalId}
                          style={{
                            padding: '6px 14px',
                            fontSize: '13px',
                            fontWeight: 600,
                            backgroundColor: printingId === order.externalId ? '#9ca3af' : '#2563eb',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: printingId === order.externalId ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {printingId === order.externalId ? '⏳ Imprimiendo...' : '🏷️ Imprimir etiqueta'}
                        </button>
                      )}
                      {order.fulfillmentStatus === 'pending' && (
                        <button
                          onClick={() => { void handleNotify(order) }}
                          disabled={busyId === order.externalId}
                          style={{
                            padding: '6px 14px',
                            fontSize: '13px',
                            fontWeight: 600,
                            backgroundColor: busyId === order.externalId ? '#9ca3af' : '#7c3aed',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: busyId === order.externalId ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {busyId === order.externalId
                            ? '⏳ Facturando y enviando...'
                            : (order.status === 'AUTHORIZED' ? '📧 Avisar: ' : '🧾 Facturar y avisar: ') +
                              (order.deliveryType === 'shipping' ? 'despachado' : 'listo para retirar')}
                        </button>
                      )}
                      {(order.fulfillmentStatus === 'ready' || order.fulfillmentStatus === 'shipped') && (
                        <button
                          onClick={() => { void handleDelivered(order) }}
                          disabled={busyId === order.externalId}
                          style={{
                            padding: '6px 14px',
                            fontSize: '13px',
                            fontWeight: 600,
                            backgroundColor: busyId === order.externalId ? '#9ca3af' : '#16a34a',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: busyId === order.externalId ? 'not-allowed' : 'pointer',
                          }}
                        >
                          📦 Marcar {order.deliveryType === 'shipping' ? 'entregado' : 'retirado'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
