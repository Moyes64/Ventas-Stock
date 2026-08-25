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
import { registerSearchAnalyticsHandlers } from './search-analytics.handlers'
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
import { registerWebCatalogServerHandlers } from './web-catalog-server.handlers'
import type { StockCountService } from '../modules/stock-count/service'
import type { WebCatalogServerService } from '../modules/web-catalog-server/service'

export function registerAllIpcHandlers(
  db: Database
): { stockCountService: StockCountService; webCatalogServerService: WebCatalogServerService } {
  registerAuthHandlers(db)
  registerCatalogHandlers(db)
  registerCustomerHandlers(db)
  registerSupplierHandlers(db)
  registerStockHandlers(db)
  registerSalesHandlers(db)
  registerInvoicingHandlers(db)
  registerPrintingHandlers(db)
  registerReportingHandlers(db)
  registerSearchAnalyticsHandlers(db)
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
  const webCatalogService = registerWebCatalogHandlers(db)
  registerCambiosHandlers(db)
  registerCreditsHandlers(db)
  registerFinanceHandlers(db)
  const stockCountService = registerStockCountHandlers(db)
  const webCatalogServerService = registerWebCatalogServerHandlers(webCatalogService)

  return { stockCountService, webCatalogServerService }
}
