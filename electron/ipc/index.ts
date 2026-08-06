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
import { registerSyncHandlers } from './sync.handlers'
import { registerSystemParamsHandlers } from './system-params.handlers'
import { registerRemitoScannerHandlers } from './remito-scanner.handlers'
import { registerPrinterConfigHandlers } from './printer-config.handlers'
import { registerLabelConfigHandlers } from './label-config.handlers'
import { registerCsrHandlers } from './csr.handlers'
import { registerMailHandlers } from './mail.handlers'
import { registerWebCatalogHandlers } from './web-catalog.handlers'
import { registerCambiosHandlers } from './cambios.handlers'
import { registerCreditsHandlers } from './credits.handlers'
import { registerFinanceHandlers } from './finance.handlers'
import { registerStockCountHandlers } from './stock-count.handlers'
import type { StockCountService } from '../modules/stock-count/service'

export function registerAllIpcHandlers(db: Database): { stockCountService: StockCountService } {
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
  registerSyncHandlers(db)
  registerSystemParamsHandlers(db)
  registerRemitoScannerHandlers(db)
  registerPrinterConfigHandlers()
  registerLabelConfigHandlers()
  registerCsrHandlers()
  registerMailHandlers(db)
  registerWebCatalogHandlers(db)
  registerCambiosHandlers(db)
  registerCreditsHandlers(db)
  registerFinanceHandlers(db)
  const stockCountService = registerStockCountHandlers(db)

  return { stockCountService }
}
