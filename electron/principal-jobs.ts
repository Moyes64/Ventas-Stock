import type { Database } from 'better-sqlite3'
import { isPrincipalPc } from './modules/principal/service'
import { getSyncService } from './ipc/sync.handlers'
import type { StockCountService } from './modules/stock-count/service'
import type { WebCatalogServerService } from './modules/web-catalog-server/service'

/** Cada cuánto cada PC revisa si es la principal (el cambio se hace desde otra PC). */
const CHECK_INTERVAL_MS = 60 * 1000

let recheck: (() => Promise<void>) | null = null

/** Revisa ya mismo (p. ej. justo después de marcar esta PC como principal). */
export function recheckPrincipalJobs(): Promise<void> {
  return recheck ? recheck() : Promise.resolve()
}

/**
 * Arranca en la PC principal las tareas que deben correr en una sola PC — la
 * sincronización periódica con la web y los servidores locales (conteo de
 * stock, catálogo en la red local) — y las frena si deja de serlo.
 */
export function startPrincipalJobs(
  db: Database,
  services: { stockCountService: StockCountService; webCatalogServerService: WebCatalogServerService }
): void {
  let running = false
  let first = true

  const apply = async () => {
    const principal = isPrincipalPc()
    if (first && !principal) console.log('[principal] Esta PC no es la principal: no sincroniza ni factura')
    first = false
    if (principal === running) return
    running = principal
    if (principal) {
      console.log('[principal] Esta PC es la principal: arrancan sync y servidores locales')
      getSyncService()?.startTimer()
      await services.stockCountService.autoStartIfEnabled()
      await services.webCatalogServerService.autoStartIfEnabled()
      fixRejectedSales(db)
    } else {
      console.log('[principal] Esta PC no es la principal: sync y servidores locales detenidos')
      getSyncService()?.stopTimer()
      await services.stockCountService.suspend()
      await services.webCatalogServerService.suspend()
    }
  }

  recheck = apply
  void apply()
  setInterval(() => {
    apply().catch(err => console.error('[principal] Error revisando la PC principal:', err))
  }, CHECK_INTERVAL_MS)
}

/**
 * One-time fix: ventas marcadas como REJECTED por bug en updateAfipError
 * (la función sobreescribía el status a REJECTED después de setearlo a INTERNAL_RECEIPT).
 * Las ventas rechazadas realmente por AFIP aún no existen en este sistema,
 * así que es seguro convertir todos los REJECTED → INTERNAL_RECEIPT.
 */
function fixRejectedSales(db: Database): void {
  try {
    const fixed = db
      .prepare(`UPDATE sales SET status = 'INTERNAL_RECEIPT' WHERE status = 'REJECTED'`)
      .run()
    if (fixed.changes > 0) {
      console.log(`[main] Corregidas ${fixed.changes} ventas de REJECTED → INTERNAL_RECEIPT`)
    }
  } catch (fixErr) {
    console.warn('[main] No se pudo corregir ventas REJECTED:', fixErr)
  }
}
