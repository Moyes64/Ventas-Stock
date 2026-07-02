import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'

export function registerCreditsHandlers(db: Database): void {

  // ── Saldo de crédito de un cliente ────────────────────────────────────────
  ipcMain.handle('credits:getBalance', (_event, customerId: number): number => {
    const row = db.prepare(
      `SELECT COALESCE(SUM(amount), 0) AS balance FROM customer_credits WHERE customer_id = ?`
    ).get(customerId) as { balance: number }
    return Math.max(0, row.balance)
  })

  // ── Historial de movimientos de crédito ───────────────────────────────────
  ipcMain.handle('credits:getHistory', (_event, customerId: number): unknown[] => {
    return db.prepare(`
      SELECT id, amount, type, reference_id, notes, created_at
      FROM customer_credits
      WHERE customer_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).all(customerId)
  })

  // ── Usar crédito en una venta (descuenta del saldo) ───────────────────────
  ipcMain.handle('credits:use', (_event, customerId: number, amount: number, saleId: number): { ok: boolean; error?: string; newBalance: number } => {
    try {
      const balanceRow = db.prepare(
        `SELECT COALESCE(SUM(amount), 0) AS balance FROM customer_credits WHERE customer_id = ?`
      ).get(customerId) as { balance: number }
      const balance = balanceRow.balance

      if (amount > balance + 0.01) {
        return { ok: false, error: `Saldo insuficiente. Disponible: $${balance.toFixed(2)}`, newBalance: balance }
      }

      db.prepare(`
        INSERT INTO customer_credits (customer_id, amount, type, reference_id, notes)
        VALUES (?, ?, 'USO', ?, ?)
      `).run(customerId, -amount, saleId, `Uso de crédito en venta #${saleId}`)

      const newBalanceRow = db.prepare(
        `SELECT COALESCE(SUM(amount), 0) AS balance FROM customer_credits WHERE customer_id = ?`
      ).get(customerId) as { balance: number }

      return { ok: true, newBalance: Math.max(0, newBalanceRow.balance) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), newBalance: 0 }
    }
  })

  // ── Ajuste manual de crédito (suma o resta) ───────────────────────────────
  ipcMain.handle('credits:adjust', (_event, customerId: number, amount: number, notes: string): { ok: boolean; error?: string } => {
    try {
      db.prepare(`
        INSERT INTO customer_credits (customer_id, amount, type, notes)
        VALUES (?, ?, 'AJUSTE', ?)
      `).run(customerId, amount, notes)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
