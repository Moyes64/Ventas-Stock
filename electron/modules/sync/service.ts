import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import { URL } from 'url'

const httpsAgent = new https.Agent({ rejectUnauthorized: false })
import type { Database } from 'better-sqlite3'
import { app } from 'electron'
import { localToday } from '../../lib/date'
import type {
  SyncConfig, SyncPayload, SyncResult, SyncStockItem, SyncVentasHoy, SyncSaleHistory, SyncCaja,
  SyncWebCategory, SyncWebProduct, SyncWebImage, WebOrder, PullResult, SyncFinance,
} from './types'
import { SystemParamsService } from '../system-params/service'
import { FinanceService } from '../finance/service'

const CONFIG_FILENAME = 'sync-config.json'
const DEFAULT_CONFIG: SyncConfig = {
  enabled: false,
  apiUrl: '',
  apiKey: '',
  intervalMinutes: 15,
}

export class SyncService {
  private configPath: string
  private lastResult: SyncResult | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly financeService: FinanceService

  constructor(private readonly db: Database) {
    this.configPath = path.join(app.getPath('userData'), CONFIG_FILENAME)
    this.financeService = new FinanceService(db)
  }

  // ── Config ────────────────────────────────────────────────────────────────

  getConfig(): SyncConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8')
        return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<SyncConfig>) }
      }
    } catch {
      // fall through to default
    }
    return { ...DEFAULT_CONFIG }
  }

  saveConfig(config: SyncConfig): void {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
    this.restartTimer()
  }

  getLastResult(): SyncResult | null {
    return this.lastResult
  }

  // ── Timer ─────────────────────────────────────────────────────────────────

  startTimer(): void {
    this.restartTimer()
  }

  private restartTimer(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }

    const config = this.getConfig()
    if (!config.enabled || !config.apiUrl || !config.apiKey) return

    const intervalMs = Math.max(config.intervalMinutes, 1) * 60 * 1000
    this.timer = setInterval(() => {
      void this.sync()
    }, intervalMs)
  }

  // ── Sync ──────────────────────────────────────────────────────────────────

  async sync(): Promise<SyncResult> {
    const config = this.getConfig()

    if (!config.apiUrl || !config.apiKey) {
      const result: SyncResult = {
        success: false,
        timestamp: new Date().toISOString(),
        error: 'URL o API key no configurados',
      }
      this.lastResult = result
      return result
    }

    try {
      const payload = this.buildPayload()
      await this.postPayload(config, payload)
      // Subir imágenes después del sync principal (en segundo plano, no bloquea el resultado)
      setTimeout(() => { void this.syncImages(config).catch(() => {}) }, 2000)
      const result: SyncResult = {
        success: true,
        timestamp: new Date().toISOString(),
      }
      this.lastResult = result
      return result
    } catch (err) {
      const result: SyncResult = {
        success: false,
        timestamp: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      }
      this.lastResult = result
      return result
    }
  }

  // ── Payload builder ───────────────────────────────────────────────────────

  private buildPayload(): SyncPayload {
    const today = localToday()
    const empresa = process.env.VITE_EMPRESA_RAZON_SOCIAL ?? 'Empresa'

    const costoEnvioWeb = new SystemParamsService().get().costoEnvioWeb ?? 0

    return {
      timestamp: new Date().toISOString(),
      empresa,
      stock: this.buildStock(),
      ventasHoy: this.buildVentasHoy(today),
      salesHistory: this.buildSalesHistory(),
      caja: this.buildCaja(today),
      webCategories: this.buildWebCategories(),
      webProducts: this.buildWebProducts(),
      webParams: { costoEnvioWeb },
      finance: this.buildFinance(today),
    }
  }

  // ── Finanzas builder ──────────────────────────────────────────────────────

  private buildFinance(today: string): SyncFinance {
    const firstOfMonth = `${today.slice(0, 7)}-01`
    const balances = this.financeService.getAccountBalances()
    const [cashFlow] = this.financeService.getCashFlowSummary(firstOfMonth, today, 'month')
    const expenses = this.financeService.getExpensesByCategory(firstOfMonth, today)
    const equity = this.financeService.getPartnersEquity()

    return {
      accountBalances: balances.map(b => ({
        accountId: b.accountId,
        accountName: b.accountName,
        accountType: b.accountType,
        balance: b.balance,
      })),
      cashFlowMonth: {
        ingresos: cashFlow?.ingresos ?? 0,
        egresos: cashFlow?.egresos ?? 0,
        neto: cashFlow?.neto ?? 0,
      },
      expensesByCategoryMonth: expenses.map(e => ({
        categoriaName: e.categoriaName,
        total: e.total,
      })),
      partnersEquity: equity.map(p => ({
        partnerName: p.partnerName,
        ownershipPct: p.ownershipPct,
        utilidadAcumulada: p.utilidadAcumulada,
        retirosRealizados: p.retirosRealizados,
        saldoPendiente: p.saldoPendiente,
      })),
    }
  }

  // ── Web catalog builders ──────────────────────────────────────────────────

  private buildWebCategories(): SyncWebCategory[] {
    const rows = this.db.prepare(
      `SELECT id, name, slug, description, sort_order FROM web_categories WHERE active=1 ORDER BY sort_order ASC`
    ).all() as Array<{ id: number; name: string; slug: string; description: string; sort_order: number }>
    return rows.map(r => ({ id: r.id, name: r.name, slug: r.slug, description: r.description, sortOrder: r.sort_order }))
  }

  private buildWebProducts(): SyncWebProduct[] {
    const rows = this.db.prepare(`
      SELECT wp.*, p.name AS product_name, p.price AS product_price, p.stock_quantity AS product_stock
      FROM web_products wp
      JOIN products p ON p.id = wp.product_id
      ORDER BY wp.sort_order ASC, p.name ASC
    `).all() as Array<{
      product_id: number; product_name: string; product_price: number; product_stock: number
      web_category_id: number | null; featured: number; featured_order: number; web_price: number | null; visible: number
      short_description: string; long_description: string; age_min: number | null
      players_min: number | null; players_max: number | null; play_time_min: number | null
      difficulty: number | null; video_url: string; tags: string; sort_order: number
    }>

    const imagesDir = path.join(app.getPath('userData'), 'web-images')

    return rows.map(r => {
      const imgRows = this.db.prepare(
        `SELECT filename, sort_order FROM web_product_images WHERE product_id=? ORDER BY sort_order ASC`
      ).all(r.product_id) as Array<{ filename: string; sort_order: number }>

      const images: SyncWebImage[] = imgRows.map(img => ({
        sortOrder: img.sort_order,
        filename: img.filename,
      }))

      const slug = r.product_name.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        + '-' + r.product_id

      return {
        productId: r.product_id,
        name: r.product_name,
        slug,
        visible: r.visible === 1,
        featured: r.featured === 1,
        featuredOrder: r.featured_order,
        price: r.web_price ?? r.product_price,
        stock: r.product_stock,
        webCategoryId: r.web_category_id,
        shortDescription: r.short_description,
        longDescription: r.long_description,
        ageMin: r.age_min,
        playersMin: r.players_min,
        playersMax: r.players_max,
        playTimeMin: r.play_time_min,
        difficulty: r.difficulty,
        videoUrl: r.video_url,
        tags: r.tags,
        sortOrder: r.sort_order,
        images,
      }
    })
  }

  // ── Listar órdenes web locales ────────────────────────────────────────────

  listWebOrders(status?: string): unknown[] {
    const where = status ? `WHERE s.status = ?` : `WHERE s.status IN ('WEB_ORDER', 'PROCESSED')`
    const rows = this.db.prepare(`
      SELECT s.id, s.sale_date, s.total, s.payment_method, s.status, s.created_at,
             c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone,
             c.doc_type AS customer_doc_type, c.cuit_dni AS customer_doc_number,
             c.address AS delivery_address,
             w.external_id, w.processed_at
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN web_orders_processed w ON w.sale_id = s.id
      ${where}
      ORDER BY s.created_at DESC
      LIMIT 100
    `).all(...(status ? [status] : [])) as Array<Record<string, unknown>>

    return rows.map(r => {
      const items = this.db.prepare(`
        SELECT si.quantity, si.unit_price, p.name AS product_name, si.product_id
        FROM sale_items si
        JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = ?
      `).all(r['id']) as Array<Record<string, unknown>>

      return {
        id: r['id'],
        externalId: r['external_id'] ?? '',
        customerName: r['customer_name'] ?? 'Sin nombre',
        customerEmail: r['customer_email'] ?? '',
        customerPhone: r['customer_phone'] ?? '',
        customerDocType: r['customer_doc_type'] ?? undefined,
        customerDocNumber: r['customer_doc_number'] !== '0' ? r['customer_doc_number'] ?? undefined : undefined,
        deliveryType: r['delivery_address'] ? 'shipping' : 'pickup',
        deliveryAddress: r['delivery_address'] ?? '',
        total: r['total'],
        paymentMethod: r['payment_method'],
        status: r['status'],
        processedAt: r['processed_at'],
        createdAt: r['created_at'],
        items: items.map(i => ({
          productId: i['product_id'],
          productName: i['product_name'],
          quantity: i['quantity'],
          unitPrice: i['unit_price'],
        })),
      }
    })
  }

  // ── Pull de órdenes web ───────────────────────────────────────────────────

  async pullOrders(): Promise<PullResult> {
    const config = this.getConfig()
    const result: PullResult = { success: false, ordersProcessed: 0, errors: [], timestamp: new Date().toISOString() }

    if (!config.apiUrl || !config.apiKey) {
      result.errors.push('URL o API key no configurados')
      return result
    }

    try {
      const baseUrl = config.apiUrl.replace(/\/api\/sync\.php$/, '').replace(/\/sync\/?$/, '')
      const orders = await this.fetchOrders(config, baseUrl)

      for (const order of orders) {
        try {
          this.processWebOrder(order)
          await this.markOrderProcessed(config, baseUrl, order.externalId)
          result.ordersProcessed++
        } catch (err) {
          result.errors.push(`Orden ${order.externalId}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      result.success = true
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err))
    }

    return result
  }

  private fetchOrders(config: SyncConfig, baseUrl: string): Promise<WebOrder[]> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${baseUrl}/api/orders/pending`)
      const isHttps = url.protocol === 'https:'
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        headers: { 'X-Api-Key': config.apiKey },
        agent: isHttps ? httpsAgent : undefined,
      }
      const req = (isHttps ? https : http).request(options, res => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data) as WebOrder[])
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`))
          }
        })
      })
      req.on('error', reject)
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')) })
      req.end()
    })
  }

  private processWebOrder(order: WebOrder): void {
    // Idempotencia: si esta orden ya fue importada (p. ej. el servidor la
    // volvió a marcar 'paid' por un reenvío de webhook de MercadoPago),
    // no crear una venta ni descontar stock por segunda vez.
    const already = this.db.prepare(`SELECT 1 FROM web_orders_processed WHERE external_id=?`).get(order.externalId)
    if (already) return

    this.db.transaction(() => {
      // Crear o actualizar cliente
      let customerId: number | null = null
      if (order.customerEmail) {
        const existing = this.db.prepare(`SELECT id, address FROM customers WHERE email=?`).get(order.customerEmail) as { id: number; address: string | null } | undefined
        if (existing) {
          customerId = existing.id
          // Actualizar doc y dirección si hay datos nuevos
          const updates: string[] = []
          const params: unknown[] = []
          if (order.customerDocType && order.customerDocNumber) {
            updates.push('doc_type=?', 'cuit_dni=?')
            params.push(order.customerDocType, order.customerDocNumber)
          }
          if (order.deliveryAddress && order.deliveryAddress !== existing.address) {
            updates.push('address=?')
            params.push(order.deliveryAddress)
          }
          if (order.customerPhone) { updates.push('phone=?'); params.push(order.customerPhone) }
          if (updates.length > 0) {
            params.push(customerId)
            this.db.prepare(`UPDATE customers SET ${updates.join(',')} WHERE id=?`).run(...params)
          }
        } else {
          const docType = order.customerDocType ?? 'DNI'
          const docNumber = order.customerDocNumber ?? '0'
          const res = this.db.prepare(
            `INSERT INTO customers (name, email, phone, doc_type, cuit_dni, condicion_iva, address)
             VALUES (?,?,?,?,?,'Consumidor Final',?)`
          ).run(order.customerName, order.customerEmail, order.customerPhone, docType, docNumber, order.deliveryAddress)
          customerId = res.lastInsertRowid as number
        }
      }

      // Crear venta (mapear métodos de pago web a los valores locales aceptados)
      const saleDate = order.createdAt.slice(0, 10)
      const paymentMethodMap: Record<string, string> = {
        mercadopago: 'transferencia',
        credit_card: 'credito',
        debit_card: 'debito',
        cash: 'contado_efectivo',
        transferencia: 'transferencia',
      }
      const localPaymentMethod = paymentMethodMap[order.paymentMethod] ?? 'transferencia'
      const saleRes = this.db.prepare(`
        INSERT INTO sales (customer_id, sale_date, status, payment_method, total, is_black_sale, created_at)
        VALUES (?,?,'WEB_ORDER',?,?,0,datetime('now','localtime'))
      `).run(customerId, saleDate, localPaymentMethod, order.total)
      const saleId = saleRes.lastInsertRowid as number

      // Insertar items y descontar stock
      for (const item of order.items) {
        this.db.prepare(`
          INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, tax_rate, subtotal)
          VALUES (?,?,?,?,0,?)
        `).run(saleId, item.productId, item.quantity, item.unitPrice, item.quantity * item.unitPrice)

        this.db.prepare(`
          UPDATE products SET stock_quantity = MAX(0, stock_quantity - ?) WHERE id=?
        `).run(item.quantity, item.productId)

        this.db.prepare(`
          INSERT INTO stock_movements (product_id, type, quantity, reference_type, reference_id, notes)
          VALUES (?,'OUT',?,'WEB_ORDER',?,?)
        `).run(item.productId, item.quantity, saleId, `Venta web ${order.externalId}`)
      }

      // Guardar el external_id para no reprocesar
      this.db.prepare(`
        INSERT OR IGNORE INTO web_orders_processed (external_id, sale_id, processed_at)
        VALUES (?,?,datetime('now','localtime'))
      `).run(order.externalId, saleId)

      // Auto-registrar el ingreso a MP-Anabella si corresponde (no bloquea la importación si falla)
      try {
        this.financeService.registerSaleIncome({
          saleId, paymentMethod: localPaymentMethod, monto: order.total, fecha: saleDate,
        })
      } catch (err) {
        console.error('[sync] Error registrando ingreso financiero automático:', err)
      }
    })()
  }

  async markWebOrderProcessed(externalId: string): Promise<void> {
    const config = this.getConfig()
    if (!config.apiUrl || !config.apiKey) throw new Error('Sync no configurado')
    const baseUrl = config.apiUrl.replace(/\/api\/sync\.php$/, '').replace(/\/sync\/?$/, '')
    await this.markOrderProcessed(config, baseUrl, externalId)
    // Actualizar estado local en SQLite
    this.db.prepare(`UPDATE sales SET status='PROCESSED' WHERE id IN (
      SELECT sale_id FROM web_orders_processed WHERE external_id=?
    )`).run(externalId)
  }

  private markOrderProcessed(config: SyncConfig, baseUrl: string, externalId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ status: 'processed' })
      const url = new URL(`${baseUrl}/api/orders/${externalId}/status`)
      const isHttps = url.protocol === 'https:'
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-Api-Key': config.apiKey },
        agent: isHttps ? httpsAgent : undefined,
      }
      const req = (isHttps ? https : http).request(options, res => {
        res.resume()
        res.on('end', () => resolve())
      })
      req.on('error', reject)
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')) })
      req.write(body)
      req.end()
    })
  }

  private buildStock(): SyncStockItem[] {
    const rows = this.db
      .prepare(
        `SELECT p.id, p.name, p.price, p.cost, p.stock_quantity AS currentStock, p.stock_min AS stockMin,
                COALESCE(tr.percentage, 0) AS taxRate
         FROM products p
         LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
         WHERE p.active = 1 ORDER BY p.name ASC`
      )
      .all() as Array<{
        id: number
        name: string
        price: number
        cost: number
        currentStock: number
        stockMin: number
        taxRate: number
      }>

    return rows.map(r => {
      const taxMult    = 1 + r.taxRate / 100
      const precioSinIva = r.taxRate > 0 ? r.price / taxMult : r.price
      const costo      = Math.round(r.cost * taxMult * 100) / 100  // costo + IVA
      const margen     = r.cost > 0 ? Math.round(((precioSinIva / r.cost) - 1) * 10000) / 100 : 0
      return {
        id: r.id,
        name: r.name,
        precio: r.price,
        costo,
        margen,
        currentStock: r.currentStock,
        stockMin: r.stockMin,
        isLow: r.stockMin > 0 && r.currentStock <= r.stockMin,
      }
    })
  }

  private buildVentasHoy(date: string): SyncVentasHoy {
    const summary = this.db
      .prepare(
        `SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
         FROM sales WHERE sale_date = ? AND status != 'CANCELLED'`
      )
      .get(date) as { count: number; total: number }

    const byMethod = this.db
      .prepare(
        `SELECT payment_method, COALESCE(SUM(total), 0) AS total_amount
         FROM sales WHERE sale_date = ? AND status != 'CANCELLED'
         GROUP BY payment_method`
      )
      .all(date) as Array<{ payment_method: string; total_amount: number }>

    const byPaymentMethod: Record<string, number> = {
      contado_efectivo: 0,
      transferencia: 0,
      debito: 0,
      credito: 0,
    }
    for (const r of byMethod) {
      byPaymentMethod[r.payment_method] = r.total_amount
    }

    const recentRows = this.db
      .prepare(
        `SELECT id, created_at, total, payment_method, status
         FROM sales WHERE sale_date = ? AND status != 'CANCELLED'
         ORDER BY created_at DESC LIMIT 20`
      )
      .all(date) as Array<{
        id: number
        created_at: string
        total: number
        payment_method: string
        status: string
      }>

    return {
      count: summary.count,
      total: summary.total,
      byPaymentMethod,
      recentSales: recentRows.map(r => ({
        id: r.id,
        time: r.created_at.slice(11, 16),
        total: r.total,
        paymentMethod: r.payment_method,
        status: r.status,
        items: this.getSaleItems(r.id),
      })),
    }
  }

  private getSaleItems(saleId: number): Array<{ productName: string; quantity: number }> {
    const items = this.db.prepare(`
      SELECT si.quantity, p.name AS product_name
      FROM sale_items si
      JOIN products p ON p.id = si.product_id
      WHERE si.sale_id = ?
    `).all(saleId) as Array<{ quantity: number; product_name: string }>

    return items.map(i => ({ productName: i.product_name, quantity: i.quantity }))
  }

  private buildSalesHistory(): SyncSaleHistory[] {
    const rows = this.db
      .prepare(
        `SELECT id, sale_date, created_at, total, payment_method, status
         FROM sales WHERE status != 'CANCELLED'
         ORDER BY created_at DESC`
      )
      .all() as Array<{
        id: number
        sale_date: string
        created_at: string
        total: number
        payment_method: string
        status: string
      }>

    return rows.map(r => ({
      id: r.id,
      date: r.sale_date,
      time: r.created_at.slice(11, 16),
      total: r.total,
      paymentMethod: r.payment_method,
      status: r.status,
      items: this.getSaleItems(r.id),
    }))
  }

  private buildCaja(date: string): SyncCaja {
    const session = this.db
      .prepare(`SELECT * FROM cash_register_sessions WHERE session_date = ?`)
      .get(date) as {
        id: number
        session_date: string
        apertura_amount: number
        cierre_amount: number | null
        status: string
      } | undefined

    if (!session) {
      return {
        status: 'no_session',
        sessionDate: null,
        aperturaAmount: 0,
        efectivoVentas: 0,
        ingresosTotal: 0,
        egresosTotal: 0,
        expectedTotal: 0,
      }
    }

    const cajaAccount = this.financeService.getCashAccount()
    const allMovements = cajaAccount
      ? this.financeService.listMovements({ accountId: cajaAccount.id, dateFrom: date, dateTo: date })
      : []
    // Los movimientos generados automáticamente por una venta ya están contados
    // en efectivoVentas — solo los manuales entran en ingresos/egresos.
    const movements = allMovements.filter(m => m.saleId === null)

    const ingresosTotal = movements
      .filter(m => m.tipo === 'ingreso')
      .reduce((s, m) => s + m.monto, 0)
    const egresosTotal = movements
      .filter(m => m.tipo === 'egreso')
      .reduce((s, m) => s + m.monto, 0)

    const efectivoRow = this.db
      .prepare(
        `SELECT COALESCE(SUM(total), 0) AS total
         FROM sales WHERE sale_date = ? AND payment_method = 'contado_efectivo' AND status != 'CANCELLED'`
      )
      .get(date) as { total: number }

    const efectivoVentas = efectivoRow.total
    const expectedTotal =
      session.apertura_amount + efectivoVentas + ingresosTotal - egresosTotal

    return {
      status: session.status as 'open' | 'closed',
      sessionDate: session.session_date,
      aperturaAmount: session.apertura_amount,
      efectivoVentas,
      ingresosTotal,
      egresosTotal,
      expectedTotal,
    }
  }

  // ── HTTP POST ─────────────────────────────────────────────────────────────

  private postPayload(config: SyncConfig, payload: SyncPayload): Promise<void> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(payload)
      const parsed = new URL(config.apiUrl)
      const isHttps = parsed.protocol === 'https:'
      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-Api-Key': config.apiKey,
        },
        agent: isHttps ? httpsAgent : undefined,
      }

      const req = (isHttps ? https : http).request(options, res => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve()
          } else {
            reject(new Error(`HTTP ${res.statusCode ?? '?'}: ${data.slice(0, 200)}`))
          }
        })
      })

      req.on('error', reject)
      req.setTimeout(30000, () => {
        req.destroy()
        reject(new Error('Timeout al conectar con el servidor'))
      })
      req.write(body)
      req.end()
    })
  }

  // ── Subida de imágenes (separada del payload principal) ───────────────────

  private async syncImages(config: SyncConfig): Promise<void> {
    const imagesDir = path.join(app.getPath('userData'), 'web-images')
    const baseUrl = config.apiUrl.replace(/\/api\/sync\.php$/, '')
    const uploadUrl = new URL(`${baseUrl}/api/upload-image.php`)
    const isHttps = uploadUrl.protocol === 'https:'

    const rows = this.db.prepare(`
      SELECT wp.product_id, wpi.filename, wpi.sort_order
      FROM web_product_images wpi
      JOIN web_products wp ON wp.product_id = wpi.product_id
      WHERE wp.visible = 1
      ORDER BY wp.product_id, wpi.sort_order
    `).all() as Array<{ product_id: number; filename: string; sort_order: number }>

    for (const row of rows) {
      const filePath = path.join(imagesDir, row.filename)
      if (!fs.existsSync(filePath)) continue
      const ext = path.extname(row.filename).toLowerCase().replace('.', '') || 'jpeg'
      const mime = ext === 'jpg' ? 'jpeg' : ext
      const base64 = fs.readFileSync(filePath).toString('base64')
      const body = JSON.stringify({
        productId: row.product_id,
        sortOrder: row.sort_order,
        base64: `data:image/${mime};base64,${base64}`,
      })

      await new Promise<void>((resolve) => {
        const options = {
          hostname: uploadUrl.hostname,
          port: uploadUrl.port || (isHttps ? 443 : 80),
          path: uploadUrl.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'X-Api-Key': config.apiKey,
          },
          agent: isHttps ? httpsAgent : undefined,
        }
        const req = (isHttps ? https : http).request(options, res => { res.resume(); res.on('end', resolve) })
        req.on('error', () => resolve())
        req.setTimeout(30000, () => { req.destroy(); resolve() })
        req.write(body)
        req.end()
      })
    }
  }
}
