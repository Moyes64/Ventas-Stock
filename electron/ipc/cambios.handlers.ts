import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { SystemParamsService } from '../modules/system-params/service'

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
  customerName?: string
  qty?: number
  amount?: number
  alreadyExchanged?: boolean
  expired?: boolean
  diasCambio?: number
  vencimiento?: string
}

export function registerCambiosHandlers(db: Database): void {

  // ── Parsear QR y devolver preview sin confirmar ────────────────────────────
  ipcMain.handle('cambios:preview', (_event, rawQr: string): ExchangePreview => {
    let payload: QrPayload
    try {
      payload = JSON.parse(rawQr) as QrPayload
      if (!payload.v || !payload.saleId || !payload.productId) {
        return { ok: false, error: 'QR inválido: datos incompletos' }
      }
    } catch {
      return { ok: false, error: 'QR no reconocido. Escaneá un ticket de cambio válido.' }
    }

    // Verificar que la venta existe
    const sale = db.prepare(
      `SELECT s.id, s.sale_date, c.name AS customer_name
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.id = ?`
    ).get(payload.saleId) as { id: number; sale_date: string; customer_name: string | null } | undefined

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
  ipcMain.handle('cambios:confirm', (_event, rawQr: string, notes?: string): { ok: boolean; error?: string; creditId?: number } => {
    let payload: QrPayload
    try {
      payload = JSON.parse(rawQr) as QrPayload
    } catch {
      return { ok: false, error: 'QR inválido' }
    }

    try {
      let creditId: number | undefined

      db.transaction(() => {
        // Registrar el cambio
        const exRes = db.prepare(`
          INSERT INTO exchanges (sale_id, product_id, customer_id, quantity, amount, notes)
          VALUES (?,?,?,?,?,?)
        `).run(
          payload.saleId,
          payload.productId,
          payload.customerId || null,
          payload.qty,
          payload.amount,
          notes ?? null,
        )
        const exchangeId = exRes.lastInsertRowid as number

        // Reponer stock
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

        // Generar crédito si hay cliente identificado
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
      })()

      return { ok: true, creditId }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ── Listar últimos cambios ─────────────────────────────────────────────────
  ipcMain.handle('cambios:list', (_event, limit = 50): unknown[] => {
    return db.prepare(`
      SELECT e.id, e.sale_id, e.quantity, e.amount, e.notes, e.created_at,
             p.name AS product_name,
             c.name AS customer_name
      FROM exchanges e
      JOIN products p ON p.id = e.product_id
      LEFT JOIN customers c ON c.id = e.customer_id
      ORDER BY e.created_at DESC
      LIMIT ?
    `).all(limit)
  })
}
