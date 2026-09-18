import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { SystemParamsService } from '../modules/system-params/service'
import { StockService } from '../modules/stock/service'
import { FinanceService } from '../modules/finance/service'
import { localToday } from '../lib/date'

const REFUND_CATEGORIA = 'Devolución a Cliente'

/** Medios que efectivamente mueven dinero cuando el cliente paga una diferencia
 *  a favor del comercio. 'credito_cliente' se resuelve aparte (consume saldo). */
const MONEY_PAYMENT_METHODS = new Set([
  'contado_efectivo', 'transferencia', 'debito', 'credito', 'qr', 'mercadopago',
])

export interface QrPayload {
  v: number
  saleId: number
  productId: number
  customerId: number
  qty: number
  amount: number
  date: string   // YYYY-MM-DD
}

export interface ExchangePreview {
  ok: boolean
  error?: string
  saleId?: number
  saleDate?: string
  productId?: number
  productName?: string
  customerId?: number | null
  customerName?: string
  qty?: number
  amount?: number
  alreadyExchanged?: boolean
  expired?: boolean
  diasCambio?: number
  vencimiento?: string
}

export interface ConfirmExchangeInput {
  rawQr: string
  notes?: string
  /** Producto que el cliente se lleva a cambio (opcional, igual que en "sin ticket"). */
  newItem?: { productId: number; quantity: number; unitPrice: number } | null
  /** Requerido solo si hay newItem y la diferencia favorece al comercio. */
  settlementMethod?: string
}

export interface ConfirmExchangeResult {
  ok: boolean
  error?: string
  creditId?: number
  difference?: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Algunos lectores de código de barras/QR emulan un teclado con layout "US" mientras
 * Windows tiene activo el layout "Español (Latinoamérica)". Windows traduce cada
 * pulsación según su propio layout, así que los símbolos de puntuación del JSON
 * (que no son letras ni dígitos) llegan cambiados por otro carácter, siempre el mismo
 * para cada tecla física. Si el parseo directo falla, se intenta revertir esa
 * sustitución conocida antes de descartar el QR como inválido.
 */
const QR_LAYOUT_MISMATCH_MAP: Record<string, string> = {
  '¨': '{',
  '[': '"',
  'Ñ': ':',
  "'": '-',
  '*': '}',
}

function parseQrPayload(rawQr: string): QrPayload | null {
  try {
    return JSON.parse(rawQr) as QrPayload
  } catch {
    // sigue abajo con el intento de corrección
  }
  const fixed = rawQr.replace(/[¨[Ñ'*]/g, ch => QR_LAYOUT_MISMATCH_MAP[ch] ?? ch)
  try {
    return JSON.parse(fixed) as QrPayload
  } catch {
    return null
  }
}

export function registerCambiosHandlers(db: Database): void {
  const stockService = new StockService(db)
  const financeService = new FinanceService(db)

  // ── Parsear QR y devolver preview sin confirmar ────────────────────────────
  ipcMain.handle('cambios:preview', (_event, rawQr: string): ExchangePreview => {
    const payload = parseQrPayload(rawQr)
    if (!payload || !payload.v || !payload.saleId || !payload.productId) {
      return { ok: false, error: payload ? 'QR inválido: datos incompletos' : 'QR no reconocido. Escaneá un ticket de cambio válido.' }
    }

    // Verificar que la venta existe
    const sale = db.prepare(
      `SELECT s.id, s.sale_date, s.customer_id, c.name AS customer_name
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.id = ?`
    ).get(payload.saleId) as { id: number; sale_date: string; customer_id: number | null; customer_name: string | null } | undefined

    if (!sale) return { ok: false, error: `Venta #${payload.saleId} no encontrada` }

    // Verificar que el producto pertenece a esa venta
    const item = db.prepare(
      `SELECT si.quantity, si.unit_price, p.name AS product_name
       FROM sale_items si
       JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = ? AND si.product_id = ?`
    ).get(payload.saleId, payload.productId) as {
      quantity: number; unit_price: number; product_name: string
    } | undefined

    if (!item) return { ok: false, error: 'El producto no pertenece a esa venta' }

    // Verificar si ya fue cambiado
    const already = db.prepare(
      `SELECT id FROM exchanges WHERE sale_id = ? AND product_id = ?`
    ).get(payload.saleId, payload.productId)

    if (already) return {
      ok: false,
      error: 'Este producto ya fue cambiado o devuelto anteriormente',
      alreadyExchanged: true,
    }

    // Verificar plazo
    const params = new SystemParamsService().get()
    const diasCambio = params.diasCambio ?? 30
    const saleMs = new Date(sale.sale_date + 'T00:00:00').getTime()
    const vencimiento = new Date(saleMs + diasCambio * 86400000)
    const vencimientoStr = vencimiento.toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
    const expired = new Date() > vencimiento

    return {
      ok: true,
      saleId: sale.id,
      saleDate: sale.sale_date,
      productId: payload.productId,
      productName: item.product_name,
      customerId: sale.customer_id,
      customerName: sale.customer_name ?? 'Consumidor Final',
      qty: payload.qty,
      amount: payload.amount,
      alreadyExchanged: false,
      expired,
      diasCambio,
      vencimiento: vencimientoStr,
    }
  })

  // ── Confirmar cambio/devolución ────────────────────────────────────────────
  ipcMain.handle('cambios:confirm', (_event, input: ConfirmExchangeInput): ConfirmExchangeResult => {
    const payload = parseQrPayload(input.rawQr)
    if (!payload) {
      return { ok: false, error: 'QR inválido' }
    }

    const newItem = input.newItem ?? null

    try {
      if (newItem) {
        if (!newItem.productId || newItem.quantity <= 0) {
          return { ok: false, error: 'Cantidad inválida en el producto de reemplazo' }
        }
        stockService.validateAvailability([{ productId: newItem.productId, quantity: newItem.quantity }])
      }

      const newTotal = newItem ? round2(newItem.quantity * newItem.unitPrice) : 0
      const difference = round2(newTotal - payload.amount)

      if (newItem && difference > 0.009) {
        if (!input.settlementMethod) {
          return { ok: false, error: 'Indicá cómo paga el cliente la diferencia a favor del comercio' }
        }
        if (input.settlementMethod === 'credito_cliente') {
          if (!payload.customerId) {
            return { ok: false, error: 'Para pagar con crédito de cliente hay que identificar al cliente' }
          }
          const balanceRow = db.prepare(
            `SELECT COALESCE(SUM(amount), 0) AS balance FROM customer_credits WHERE customer_id = ?`
          ).get(payload.customerId) as { balance: number }
          if (difference > balanceRow.balance + 0.01) {
            return {
              ok: false,
              error: `Saldo de crédito insuficiente. Disponible: $${balanceRow.balance.toFixed(2)}, necesario: $${difference.toFixed(2)}`,
            }
          }
        } else if (!MONEY_PAYMENT_METHODS.has(input.settlementMethod)) {
          return { ok: false, error: `Medio de pago no reconocido: ${input.settlementMethod}` }
        }
      }

      const fecha = localToday()
      let creditId: number | undefined
      let financeMovementId: number | null = null

      db.transaction(() => {
        // Registrar el cambio
        const exRes = db.prepare(`
          INSERT INTO exchanges (
            sale_id, product_id, customer_id, quantity, amount, notes,
            new_product_id, new_quantity, new_unit_price, new_total, difference, settlement_method
          )
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          payload.saleId,
          payload.productId,
          payload.customerId || null,
          payload.qty,
          payload.amount,
          input.notes ?? null,
          newItem?.productId ?? null,
          newItem?.quantity ?? null,
          newItem?.unitPrice ?? null,
          newItem ? newTotal : null,
          newItem ? difference : 0,
          newItem && Math.abs(difference) > 0.009 ? input.settlementMethod ?? null : null,
        )
        const exchangeId = exRes.lastInsertRowid as number

        // Reponer stock del producto devuelto
        db.prepare(`
          UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?
        `).run(payload.qty, payload.productId)

        db.prepare(`
          INSERT INTO stock_movements (product_id, type, quantity, reference_type, reference_id, notes)
          VALUES (?,'IN',?,'CAMBIO',?,?)
        `).run(
          payload.productId,
          payload.qty,
          payload.saleId,
          `Cambio/devolución de venta #${payload.saleId}`,
        )

        // Entregar el producto de reemplazo, si lo hay
        if (newItem) {
          stockService.addManualMovement({
            productId: newItem.productId,
            type: 'EXIT',
            quantity: newItem.quantity,
            referenceType: 'CAMBIO',
            referenceId: exchangeId,
            notes: `Entrega por cambio con ticket de venta #${payload.saleId}`,
          })
        }

        if (!newItem) {
          // Sin reemplazo: comportamiento histórico — crédito al cliente si está identificado.
          if (payload.customerId) {
            const crRes = db.prepare(`
              INSERT INTO customer_credits (customer_id, amount, type, reference_id, notes)
              VALUES (?,?,'CAMBIO',?,?)
            `).run(
              payload.customerId,
              payload.amount,
              exchangeId,
              `Crédito por cambio venta #${payload.saleId}`,
            )
            creditId = crRes.lastInsertRowid as number
          }
        } else if (difference < -0.009) {
          // Con reemplazo, diferencia a favor del cliente: se devuelve en efectivo desde Caja.
          const cashAccount = financeService.getCashAccount()
          if (!cashAccount) throw new Error('No se encontró la cuenta Caja para devolver la diferencia')
          const categorias = financeService.listCategories('egreso')
          const categoria = categorias.find(c => c.name === REFUND_CATEGORIA)
          const movement = financeService.createMovement({
            accountId: cashAccount.id,
            tipo: 'egreso',
            categoriaId: categoria?.id ?? null,
            monto: Math.abs(difference),
            descripcion: `Devolución diferencia - Cambio con ticket #${exchangeId}`,
            fecha,
          })
          financeMovementId = movement.id
        } else if (difference > 0.009) {
          // Con reemplazo, diferencia a favor del comercio.
          if (input.settlementMethod === 'credito_cliente') {
            const crRes = db.prepare(`
              INSERT INTO customer_credits (customer_id, amount, type, reference_id, notes)
              VALUES (?, ?, 'USO', ?, ?)
            `).run(payload.customerId, -difference, exchangeId, `Uso de crédito - cambio con ticket #${exchangeId}`)
            creditId = crRes.lastInsertRowid as number
          } else {
            const movement = financeService.registerExchangeDifferenceIncome({
              exchangeId,
              sourceLabel: 'con ticket',
              paymentMethod: input.settlementMethod!,
              monto: difference,
              fecha,
            })
            financeMovementId = movement?.id ?? null
          }
        }

        if (financeMovementId) {
          db.prepare(`UPDATE exchanges SET finance_movement_id = ? WHERE id = ?`).run(financeMovementId, exchangeId)
        }
      })()

      return { ok: true, creditId, difference: newItem ? difference : undefined }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ── Listar últimos cambios ─────────────────────────────────────────────────
  ipcMain.handle('cambios:list', (_event, limit = 50): unknown[] => {
    return db.prepare(`
      SELECT e.id, e.sale_id, e.quantity, e.amount, e.notes, e.created_at,
             e.new_quantity, e.new_unit_price, e.new_total, e.difference, e.settlement_method,
             p.name AS product_name,
             np.name AS new_product_name,
             c.name AS customer_name
      FROM exchanges e
      JOIN products p ON p.id = e.product_id
      LEFT JOIN products np ON np.id = e.new_product_id
      LEFT JOIN customers c ON c.id = e.customer_id
      ORDER BY e.created_at DESC
      LIMIT ?
    `).all(limit)
  })
}
