import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { StockService } from '../modules/stock/service'
import { FinanceService } from '../modules/finance/service'
import { localToday } from '../lib/date'

const REFERENCE_TYPE = 'DEVOLUCION_SIN_TICKET'
const REFUND_CATEGORIA = 'Devolución a Cliente'

/** Medios que efectivamente mueven dinero cuando el cliente paga una diferencia
 *  a favor del comercio. 'credito_cliente' se resuelve aparte (consume saldo). */
const MONEY_PAYMENT_METHODS = new Set([
  'contado_efectivo', 'transferencia', 'debito', 'credito', 'qr', 'mercadopago',
])

export interface FreeExchangeItemInput {
  productId: number
  quantity: number
  unitPrice: number
}

export interface ConfirmFreeExchangeInput {
  customerId?: number | null
  returnedItems: FreeExchangeItemInput[]
  newItems: FreeExchangeItemInput[]
  /** Solo requerido si difference > 0 (paga el cliente). Ignorado si difference <= 0
   *  (una diferencia a favor del cliente siempre se devuelve en efectivo desde Caja). */
  settlementMethod?: string
  notes?: string
}

export interface ConfirmFreeExchangeResult {
  ok: boolean
  error?: string
  id?: number
  returnedTotal?: number
  newTotal?: number
  difference?: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function registerFreeExchangeHandlers(db: Database): void {
  const stockService = new StockService(db)
  const financeService = new FinanceService(db)

  ipcMain.handle(
    'free-exchange:confirm',
    (_event, input: ConfirmFreeExchangeInput): ConfirmFreeExchangeResult => {
      try {
        if (!input.returnedItems?.length) {
          return { ok: false, error: 'Escaneá al menos un producto devuelto' }
        }
        for (const item of [...input.returnedItems, ...input.newItems ?? []]) {
          if (!item.productId || item.quantity <= 0) {
            return { ok: false, error: 'Cantidad inválida en alguno de los productos' }
          }
        }

        const newItems = input.newItems ?? []

        // Validar stock disponible para los productos nuevos (igual que una venta)
        stockService.validateAvailability(
          newItems.map(i => ({ productId: i.productId, quantity: i.quantity }))
        )

        const returnedTotal = round2(
          input.returnedItems.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0)
        )
        const newTotal = round2(newItems.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0))
        const difference = round2(newTotal - returnedTotal)

        if (difference > 0.009) {
          if (!input.settlementMethod) {
            return { ok: false, error: 'Indicá cómo paga el cliente la diferencia a favor del comercio' }
          }
          if (input.settlementMethod === 'credito_cliente') {
            if (!input.customerId) {
              return { ok: false, error: 'Para pagar con crédito de cliente hay que identificar al cliente' }
            }
            const balanceRow = db.prepare(
              `SELECT COALESCE(SUM(amount), 0) AS balance FROM customer_credits WHERE customer_id = ?`
            ).get(input.customerId) as { balance: number }
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
        let freeExchangeId = 0
        let financeMovementId: number | null = null
        let creditId: number | null = null

        db.transaction(() => {
          // 1. Cabecera (placeholder de settlement_method, se actualiza abajo si aplica)
          const headerRes = db.prepare(`
            INSERT INTO free_exchanges (customer_id, returned_total, new_total, difference, settlement_method, notes)
            VALUES (?,?,?,?,?,?)
          `).run(
            input.customerId ?? null,
            returnedTotal,
            newTotal,
            difference,
            difference > 0.009 ? input.settlementMethod ?? null : difference < -0.009 ? 'contado_efectivo' : null,
            input.notes?.trim() || null,
          )
          freeExchangeId = headerRes.lastInsertRowid as number

          // 2. Ítems + movimientos de stock
          const insertItem = db.prepare(`
            INSERT INTO free_exchange_items (free_exchange_id, product_id, direction, quantity, unit_price, subtotal)
            VALUES (?,?,?,?,?,?)
          `)

          for (const item of input.returnedItems) {
            insertItem.run(freeExchangeId, item.productId, 'RETURN', item.quantity, item.unitPrice, round2(item.quantity * item.unitPrice))
            stockService.addManualMovement({
              productId: item.productId,
              type: 'ENTRY',
              quantity: item.quantity,
              referenceType: REFERENCE_TYPE,
              referenceId: freeExchangeId,
              notes: `Devolución sin ticket #${freeExchangeId}`,
            })
          }

          for (const item of newItems) {
            insertItem.run(freeExchangeId, item.productId, 'NEW', item.quantity, item.unitPrice, round2(item.quantity * item.unitPrice))
            stockService.addManualMovement({
              productId: item.productId,
              type: 'EXIT',
              quantity: item.quantity,
              referenceType: REFERENCE_TYPE,
              referenceId: freeExchangeId,
              notes: `Entrega por cambio sin ticket #${freeExchangeId}`,
            })
          }

          // 3. Movimiento de dinero por la diferencia
          if (difference > 0.009) {
            if (input.settlementMethod === 'credito_cliente') {
              const crRes = db.prepare(`
                INSERT INTO customer_credits (customer_id, amount, type, reference_id, notes)
                VALUES (?, ?, 'USO', ?, ?)
              `).run(input.customerId, -difference, freeExchangeId, `Uso de crédito - cambio sin ticket #${freeExchangeId}`)
              creditId = crRes.lastInsertRowid as number
            } else {
              const movement = financeService.registerExchangeDifferenceIncome({
                freeExchangeId,
                paymentMethod: input.settlementMethod!,
                monto: difference,
                fecha,
              })
              financeMovementId = movement?.id ?? null
            }
          } else if (difference < -0.009) {
            const cashAccount = financeService.getCashAccount()
            if (!cashAccount) throw new Error('No se encontró la cuenta Caja para devolver la diferencia')
            const categorias = financeService.listCategories('egreso')
            const categoria = categorias.find(c => c.name === REFUND_CATEGORIA)
            const movement = financeService.createMovement({
              accountId: cashAccount.id,
              tipo: 'egreso',
              categoriaId: categoria?.id ?? null,
              monto: Math.abs(difference),
              descripcion: `Devolución diferencia - Cambio sin ticket #${freeExchangeId}`,
              fecha,
            })
            financeMovementId = movement.id
          }

          if (financeMovementId || creditId) {
            db.prepare(`
              UPDATE free_exchanges SET finance_movement_id = ?, credit_id = ? WHERE id = ?
            `).run(financeMovementId, creditId, freeExchangeId)
          }
        })()

        return { ok: true, id: freeExchangeId, returnedTotal, newTotal, difference }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // ── Historial ────────────────────────────────────────────────────────────
  ipcMain.handle('free-exchange:list', (_event, limit = 50): unknown[] => {
    const headers = db.prepare(`
      SELECT fe.id, fe.customer_id, fe.returned_total, fe.new_total, fe.difference,
             fe.settlement_method, fe.notes, fe.created_at,
             c.name AS customer_name
      FROM free_exchanges fe
      LEFT JOIN customers c ON c.id = fe.customer_id
      ORDER BY fe.created_at DESC
      LIMIT ?
    `).all(limit) as Array<{ id: number } & Record<string, unknown>>

    if (headers.length === 0) return []

    const ids = headers.map(h => h.id)
    const placeholders = ids.map(() => '?').join(',')
    const items = db.prepare(`
      SELECT fei.free_exchange_id, fei.direction, fei.quantity, fei.unit_price, fei.subtotal,
             p.name AS product_name
      FROM free_exchange_items fei
      JOIN products p ON p.id = fei.product_id
      WHERE fei.free_exchange_id IN (${placeholders})
    `).all(...ids) as Array<{ free_exchange_id: number } & Record<string, unknown>>

    return headers.map(h => ({
      ...h,
      items: items.filter(i => i.free_exchange_id === h.id),
    }))
  })
}
