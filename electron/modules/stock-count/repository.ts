import type { Database } from 'better-sqlite3'
import type {
  StockCountSession,
  StockCountSessionStatus,
  StockCountProductForDownload,
  SubmitCountItemInput,
  ReconciliationRow,
} from './types'

interface SessionRow {
  id: number
  label: string
  web_category_id: number | null
  web_category_name: string | null
  status: StockCountSessionStatus
  item_count: number
  created_at: string
  uploaded_at: string | null
  reconciled_at: string | null
}

export class StockCountRepository {
  constructor(private readonly db: Database) {}

  createSession(label: string, webCategoryId: number | null): number {
    const result = this.db
      .prepare(`INSERT INTO stock_count_sessions (label, web_category_id) VALUES (?, ?)`)
      .run(label, webCategoryId)
    return result.lastInsertRowid as number
  }

  listSessions(statusFilter?: StockCountSessionStatus): StockCountSession[] {
    const where = statusFilter ? 'WHERE s.status = ?' : ''
    const rows = this.db
      .prepare(
        `SELECT s.id, s.label, s.web_category_id, wc.name AS web_category_name, s.status,
                (SELECT COUNT(*) FROM stock_count_items i WHERE i.session_id = s.id) AS item_count,
                s.created_at, s.uploaded_at, s.reconciled_at
         FROM stock_count_sessions s
         LEFT JOIN web_categories wc ON wc.id = s.web_category_id
         ${where}
         ORDER BY s.created_at DESC`
      )
      .all(...(statusFilter ? [statusFilter] : [])) as SessionRow[]
    return rows.map(r => this.mapSession(r))
  }

  getSession(id: number): StockCountSession | undefined {
    const row = this.db
      .prepare(
        `SELECT s.id, s.label, s.web_category_id, wc.name AS web_category_name, s.status,
                (SELECT COUNT(*) FROM stock_count_items i WHERE i.session_id = s.id) AS item_count,
                s.created_at, s.uploaded_at, s.reconciled_at
         FROM stock_count_sessions s
         LEFT JOIN web_categories wc ON wc.id = s.web_category_id
         WHERE s.id = ?`
      )
      .get(id) as SessionRow | undefined
    return row ? this.mapSession(row) : undefined
  }

  /** Productos que la app Android debe descargar para contar esta sesión. */
  listSessionProducts(sessionId: number): StockCountProductForDownload[] {
    const session = this.db
      .prepare('SELECT web_category_id FROM stock_count_sessions WHERE id = ?')
      .get(sessionId) as { web_category_id: number | null } | undefined
    if (!session) return []

    // Sin categoría: todo el catálogo activo. Con categoría: solo los productos
    // publicados en Catálogo Web bajo esa categoría (join por web_products) —
    // un producto sin fila en web_products no aparece en ningún filtro por
    // categoría, aunque siempre está disponible bajo "Todas las categorías".
    if (session.web_category_id === null) {
      return this.db
        .prepare(
          `SELECT id, sku, barcode, name, stock_quantity AS currentStock
           FROM products
           WHERE active = 1
           ORDER BY name ASC`
        )
        .all() as StockCountProductForDownload[]
    }

    return this.db
      .prepare(
        `SELECT p.id, p.sku, p.barcode, p.name, p.stock_quantity AS currentStock
         FROM products p
         JOIN web_products wp ON wp.product_id = p.id
         WHERE p.active = 1 AND wp.web_category_id = ?
         ORDER BY p.name ASC`
      )
      .all(session.web_category_id) as StockCountProductForDownload[]
  }

  /** Reemplaza los items contados de la sesión (idempotente ante reintentos del celular) y la marca 'uploaded'. */
  replaceSessionItems(sessionId: number, items: SubmitCountItemInput[]): void {
    const deleteItems = this.db.prepare('DELETE FROM stock_count_items WHERE session_id = ?')
    const insertItem = this.db.prepare(
      `INSERT INTO stock_count_items (session_id, product_id, counted_quantity, note)
       VALUES (@sessionId, @productId, @countedQuantity, @note)`
    )
    const markUploaded = this.db.prepare(
      `UPDATE stock_count_sessions SET status = 'uploaded', uploaded_at = datetime('now') WHERE id = ?`
    )

    this.db.transaction(() => {
      deleteItems.run(sessionId)
      for (const item of items) {
        insertItem.run({
          sessionId,
          productId: item.productId,
          countedQuantity: item.countedQuantity,
          note: item.note ?? '',
        })
      }
      markUploaded.run(sessionId)
    })()
  }

  getReconciliationRows(sessionId: number): ReconciliationRow[] {
    const rows = this.db
      .prepare(
        `SELECT i.id AS item_id, i.product_id, p.name AS product_name, p.sku,
                p.stock_quantity AS system_quantity, i.counted_quantity, i.note, i.reconciled
         FROM stock_count_items i
         JOIN products p ON p.id = i.product_id
         WHERE i.session_id = ?
         ORDER BY p.name ASC`
      )
      .all(sessionId) as Array<{
        item_id: number
        product_id: number
        product_name: string
        sku: string
        system_quantity: number
        counted_quantity: number
        note: string
        reconciled: number
      }>

    return rows.map(r => ({
      itemId: r.item_id,
      productId: r.product_id,
      productName: r.product_name,
      sku: r.sku,
      systemQuantity: r.system_quantity,
      countedQuantity: r.counted_quantity,
      diff: r.counted_quantity - r.system_quantity,
      note: r.note,
      reconciled: r.reconciled === 1,
    }))
  }

  getItem(itemId: number): { id: number; sessionId: number; productId: number; countedQuantity: number } | undefined {
    return this.db
      .prepare('SELECT id, session_id AS sessionId, product_id AS productId, counted_quantity AS countedQuantity FROM stock_count_items WHERE id = ?')
      .get(itemId) as { id: number; sessionId: number; productId: number; countedQuantity: number } | undefined
  }

  markItemReconciled(itemId: number): void {
    this.db.prepare('UPDATE stock_count_items SET reconciled = 1 WHERE id = ?').run(itemId)
  }

  /** Si ya no quedan items sin reconciliar, marca la sesión como 'reconciled'. */
  markSessionReconciledIfComplete(sessionId: number): void {
    const pending = this.db
      .prepare('SELECT COUNT(*) AS n FROM stock_count_items WHERE session_id = ? AND reconciled = 0')
      .get(sessionId) as { n: number }
    if (pending.n === 0) {
      this.db
        .prepare(`UPDATE stock_count_sessions SET status = 'reconciled', reconciled_at = datetime('now') WHERE id = ?`)
        .run(sessionId)
    }
  }

  cancelSession(id: number): void {
    this.db.prepare(`UPDATE stock_count_sessions SET status = 'cancelled' WHERE id = ?`).run(id)
  }

  deleteSession(id: number): void {
    this.db.prepare('DELETE FROM stock_count_sessions WHERE id = ?').run(id)
  }

  private mapSession(row: SessionRow): StockCountSession {
    return {
      id: row.id,
      label: row.label,
      webCategoryId: row.web_category_id,
      webCategoryName: row.web_category_name,
      status: row.status,
      itemCount: row.item_count,
      createdAt: row.created_at,
      uploadedAt: row.uploaded_at,
      reconciledAt: row.reconciled_at,
    }
  }
}
