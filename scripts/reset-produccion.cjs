#!/usr/bin/env node
'use strict'
/**
 * RESET PARA PRODUCCIÓN
 * =====================
 * Borra todos los datos de prueba conservando solo el stock real:
 *   - Ventas y sus ítems / parámetros
 *   - Sesiones y movimientos de caja
 *   - Movimientos de stock generados por ventas (tipo SALE)
 *   - Clientes
 *
 * Recalcula stock_quantity en products a partir de los movimientos restantes.
 * Hace un backup automático antes de tocar nada.
 *
 * Uso:
 *   electron scripts/reset-produccion.cjs
 *
 * O bien doble-clic en reset-produccion.bat
 */

const { app, dialog } = require('electron')
const fs   = require('fs')
const path = require('path')

// Sin esto, app.getPath('userData') devuelve .../Electron en vez de .../Ventas-Stock
app.setName('Ventas-Stock')

app.whenReady().then(() => {
  // ── Ruta a la DB ──────────────────────────────────────────────────────────
  const dbPath = path.join(app.getPath('userData'), 'ventas.db')

  if (!fs.existsSync(dbPath)) {
    dialog.showErrorBox(
      'Reset producción',
      `No se encontró la base de datos en:\n${dbPath}\n\nVerificá que el programa haya sido iniciado al menos una vez.`
    )
    app.quit()
    return
  }

  // ── Confirmación ──────────────────────────────────────────────────────────
  const confirm1 = dialog.showMessageBoxSync({
    type: 'warning',
    title: 'Reset para producción',
    message: '⚠️ Esta operación es IRREVERSIBLE (salvo el backup automático).',
    detail:
      'Se borrarán:\n' +
      '  • Todas las ventas y sus ítems\n' +
      '  • Todas las sesiones y movimientos de caja\n' +
      '  • Los movimientos de stock generados por ventas\n' +
      '  • Todos los clientes\n\n' +
      'Se conservarán:\n' +
      '  • Catálogo de productos y precios\n' +
      '  • Stock actual (recalculado)\n' +
      '  • Proveedores\n' +
      '  • Usuarios y configuración\n\n' +
      'Se hará un backup automático antes de comenzar.\n\n' +
      '¿Querés continuar?',
    buttons: ['Cancelar', 'Sí, continuar'],
    defaultId: 0,
    cancelId: 0,
  })

  if (confirm1 !== 1) {
    console.log('[reset] Cancelado por el usuario.')
    app.quit()
    return
  }

  const confirm2 = dialog.showMessageBoxSync({
    type: 'warning',
    title: 'Confirmación final',
    message: '¿Estás seguro? Esta acción no se puede deshacer.',
    buttons: ['Cancelar', 'Confirmar y ejecutar reset'],
    defaultId: 0,
    cancelId: 0,
  })

  if (confirm2 !== 1) {
    console.log('[reset] Cancelado en confirmación final.')
    app.quit()
    return
  }

  // ── Backup automático ─────────────────────────────────────────────────────
  const backupDir  = path.join(app.getPath('userData'), 'backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const ts         = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupPath = path.join(backupDir, `ventas_PRE-RESET_${ts}.db`)
  fs.copyFileSync(dbPath, backupPath)
  console.log(`[reset] Backup creado: ${backupPath}`)

  // ── Ejecutar reset ────────────────────────────────────────────────────────
  let db
  try {
    // better-sqlite3 compilado para Electron — requiere ABI de Electron, no Node
    const Database = require('better-sqlite3')
    db = new Database(dbPath)
  } catch (/** @type {any} */ err) {
    dialog.showErrorBox('Error al abrir la DB', String(err))
    app.quit()
    return
  }

  try {
    db.pragma('foreign_keys = OFF')

    const reset = db.transaction(() => {
      // 1. Tablas de venta (en orden por foreign keys)
      const delSaleParams = db.prepare('DELETE FROM sale_parameters').run()
      const delSaleItems  = db.prepare('DELETE FROM sale_items').run()
      const delSales      = db.prepare('DELETE FROM sales').run()

      // 2. Caja
      const delCashMov     = db.prepare('DELETE FROM cash_movements').run()
      const delCashSess    = db.prepare('DELETE FROM cash_register_sessions').run()
      const delFinanceMov  = db.prepare('DELETE FROM finance_movements').run()

      // 3. Clientes
      const delCustomers   = db.prepare('DELETE FROM customers').run()

      // 4. Movimientos de stock generados por ventas
      const delStockSales  = db.prepare("DELETE FROM stock_movements WHERE reference_type = 'SALE'").run()

      // 5. Recalcular stock_quantity para todos los productos
      //    (suma de quantity en los movimientos restantes, que ya son siempre positivos o negativos)
      db.prepare(`
        UPDATE products
        SET stock_quantity = COALESCE((
          SELECT SUM(quantity)
          FROM stock_movements
          WHERE product_id = products.id
        ), 0)
      `).run()

      // 6. Resetear autoincrements (sqlite_sequence)
      const tables = ['sales', 'sale_items', 'sale_parameters',
                      'cash_register_sessions', 'cash_movements', 'finance_movements', 'customers']
      for (const t of tables) {
        db.prepare("UPDATE sqlite_sequence SET seq = 0 WHERE name = ?").run(t)
      }

      return {
        sales:        delSales.changes,
        saleItems:    delSaleItems.changes,
        saleParams:   delSaleParams.changes,
        cashSessions: delCashSess.changes,
        cashMov:      delCashMov.changes,
        financeMov:   delFinanceMov.changes,
        customers:    delCustomers.changes,
        stockSaleMov: delStockSales.changes,
      }
    })

    const result = reset()
    db.pragma('foreign_keys = ON')
    db.close()

    const summary =
      `✅ Reset completado correctamente.\n\n` +
      `Registros eliminados:\n` +
      `  • Ventas:                    ${result.sales}\n` +
      `  • Ítems de venta:            ${result.saleItems}\n` +
      `  • Parámetros de venta:       ${result.saleParams}\n` +
      `  • Sesiones de caja:          ${result.cashSessions}\n` +
      `  • Movimientos de caja (histórico): ${result.cashMov}\n` +
      `  • Movimientos de Finanzas:   ${result.financeMov}\n` +
      `  • Clientes:                  ${result.customers}\n` +
      `  • Movimientos de stock (ventas): ${result.stockSaleMov}\n\n` +
      `Stock recalculado a partir de los movimientos de compra/ajuste restantes.\n\n` +
      `Backup guardado en:\n${backupPath}`

    console.log('[reset]', summary)
    dialog.showMessageBoxSync({
      type: 'info',
      title: 'Reset completado',
      message: summary,
      buttons: ['Cerrar'],
    })
  } catch (/** @type {any} */ err) {
    db.close()
    const msg = `Error durante el reset — la base de datos NO fue modificada.\n\n${String(err)}`
    console.error('[reset]', msg)
    dialog.showErrorBox('Error en el reset', msg)
  }

  app.quit()
})
