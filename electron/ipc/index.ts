import type { Database } from 'better-sqlite3'
import { registerAuthHandlers } from './auth.handlers'
import { registerCatalogHandlers } from './catalog.handlers'
import { registerCustomerHandlers } from './customers.handlers'
import { registerSupplierHandlers } from './suppliers.handlers'
import { registerStockHandlers } from './stock.handlers'
import { registerSalesHandlers } from './sales.handlers'
import { registerInvoicingHandlers } from './invoicing.handlers'
import { registerPrintingHandlers } from './printing.handlers'
import { registerReportingHandlers } from './reporting.handlers'
import { registerBackupHandlers } from './backup.handlers'
import { registerParameterHandlers } from './parameters.handlers'
import { registerCajaHandlers } from './caja.handlers'

export function registerAllIpcHandlers(db: Database): void {
  registerAuthHandlers(db)
  registerCatalogHandlers(db)
  registerCustomerHandlers(db)
  registerSupplierHandlers(db)
  registerStockHandlers(db)
  registerSalesHandlers(db)
  registerInvoicingHandlers(db)
  registerPrintingHandlers(db)
  registerReportingHandlers(db)
  registerBackupHandlers()
  registerParameterHandlers(db)
  registerCajaHandlers(db)
}
