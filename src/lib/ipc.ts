/**
 * Typed helpers for calling window.electron IPC methods.
 * All methods return typed Promises.
 */

import type {
  SystemParams,
  PrinterConfig,
  PrinterTestResult,
  ConnectionType,
  PedidoProduct,
  LoginResult,
  User,
  Role,
  Product,
  Category,
  TaxRate,
  Customer,
  Supplier,
  StockItem,
  StockMovement,
  Sale,
  BackupInfo,
  DailySummaryReport,
  SalesSummary,
  SearchAnalyticsReport,
  RankingItem,
  PurchasesReport,
  IncompleteEntry,
  Parameter,
  CashSession,
  CierreSummary,
  PaymentMethod,
  SyncConfig,
  SyncResult,
  RemitoScanResult,
  RemitoMapping,
  FinancePartner,
  FinanceAccount,
  FinanceCategory,
  FinanceCategoryAppliesTo,
  FinanceMovement,
  CreateFinanceMovementInput,
  FinanceMovementFilters,
  CreateFinanceCategoryInput,
  FinanceAccountBalance,
  FinanceCashFlowPoint,
  FinanceCategoryExpense,
  FinancePartnerEquity,
  FinancePendingAccreditation,
  FinanceTransfer,
  CreateFinanceTransferInput,
  FinanceTransferFilters,
  MpFeePaymentMethod,
  FinanceMpFeeRate,
  CreateMpFeeRateInput,
  FinanceMpReconciliation,
  SaveMpReconciliationInput,
  MpReconciliationRow,
  StockCountSession,
  StockCountSessionStatus,
  ReconciliationRow,
  ApplyReconciliationDecision,
  StockCountServerStatus,
} from '../types/ipc'

// Access the electron bridge exposed by preload
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
const electron = (window as any).electron as Record<string, Record<string, (...args: any[]) => Promise<unknown>>>

// Auth
export const auth = {
  login: (username: string, password: string) =>
    electron.auth.login(username, password) as Promise<LoginResult>,
  listUsers: () => electron.auth.listUsers() as Promise<User[]>,
  createUser: (data: Omit<User, 'id' | 'createdAt' | 'updatedAt'> & { password: string }) =>
    electron.auth.createUser(data) as Promise<number>,
  updateUser: (id: number, data: Partial<User & { password: string }>) =>
    electron.auth.updateUser(id, data) as Promise<void>,
  deleteUser: (id: number) => electron.auth.deleteUser(id) as Promise<void>,
  listRoles: () => electron.auth.listRoles() as Promise<Role[]>,
}

// Catalog
export const catalog = {
  listProducts: (activeOnly?: boolean) =>
    electron.catalog.listProducts(activeOnly) as Promise<Product[]>,
  searchProducts: (query: string) =>
    electron.catalog.searchProducts(query) as Promise<Product[]>,
  getProduct: (id: number) =>
    electron.catalog.getProduct(id) as Promise<Product | undefined>,
  getByBarcode: (barcode: string) =>
    electron.catalog.getByBarcode(barcode) as Promise<Product | undefined>,
  createProduct: (data: Partial<Product>) =>
    electron.catalog.createProduct(data) as Promise<Product>,
  updateProduct: (id: number, data: Partial<Product>) =>
    electron.catalog.updateProduct(id, data) as Promise<Product>,
  deleteProduct: (id: number) => electron.catalog.deleteProduct(id) as Promise<void>,
  hardDeleteProduct: (id: number) => electron.catalog.hardDeleteProduct(id) as Promise<void>,
  getTaxRates: () => electron.catalog.getTaxRates() as Promise<TaxRate[]>,
  getCategories: () => electron.catalog.getCategories() as Promise<Category[]>,
  listLowStock: () => electron.catalog.listLowStock() as Promise<Product[]>,
}

// Customers
export const customers = {
  list: () => electron.customers.list() as Promise<Customer[]>,
  search: (query: string) => electron.customers.search(query) as Promise<Customer[]>,
  get: (id: number) => electron.customers.get(id) as Promise<Customer | undefined>,
  create: (data: Partial<Customer>) => electron.customers.create(data) as Promise<Customer>,
  update: (id: number, data: Partial<Customer>) =>
    electron.customers.update(id, data) as Promise<Customer>,
  delete: (id: number) => electron.customers.delete(id) as Promise<void>,
}

// Suppliers
export const suppliers = {
  list: (activeOnly?: boolean) =>
    electron.suppliers.list(activeOnly) as Promise<Supplier[]>,
  search: (query: string) => electron.suppliers.search(query) as Promise<Supplier[]>,
  get: (id: number) => electron.suppliers.get(id) as Promise<Supplier | undefined>,
  create: (data: Partial<Supplier>) => electron.suppliers.create(data) as Promise<Supplier>,
  update: (id: number, data: Partial<Supplier>) =>
    electron.suppliers.update(id, data) as Promise<Supplier>,
  delete: (id: number) => electron.suppliers.delete(id) as Promise<void>,
}

// Stock
export const stock = {
  getItems: () => electron.stock.getItems() as Promise<StockItem[]>,
  getCurrent: (productId: number) =>
    electron.stock.getCurrent(productId) as Promise<number>,
  getMovements: (filters: {
    productId?: number
    supplierId?: number | 'none'
    dateFrom?: string
    dateTo?: string
    limit?: number
  }) => electron.stock.getMovements(filters) as Promise<StockMovement[]>,
  addMovement: (data: {
    productId: number
    type: string
    quantity: number
    notes?: string
    userId?: number
    voucherType?: string
    voucherNumber?: string
    voucherDate?: string
    supplierId?: number
  }) => electron.stock.addMovement(data) as Promise<number>,
  updateMovement: (
    id: number,
    data: {
      quantity?: number
      voucherType?: string | null
      voucherNumber?: string | null
      voucherDate?: string | null
      supplierId?: number | null
      notes?: string
    }
  ) => electron.stock.updateMovement(id, data) as Promise<void>,
  deleteMovement: (id: number) => electron.stock.deleteMovement(id) as Promise<void>,
  adjustStock: (productId: number, newQuantity: number, userId?: number) =>
    electron.stock.adjustStock(productId, newQuantity, userId) as Promise<number>,
}

// Sales
export const sales = {
  create: (input: {
    customerId?: number
    userId?: number
    invoiceType?: number
    isBlackSale?: boolean
    paymentMethod?: PaymentMethod
    parameterIds?: number[]
    items: Array<{
      productId: number
      quantity: number
      unitPrice: number
      taxRate: number
    }>
  }) => electron.sales.create(input) as Promise<Sale>,
  get: (id: number) => electron.sales.get(id) as Promise<Sale | undefined>,
  list: (filters: { dateFrom?: string; dateTo?: string; status?: string; limit?: number }) =>
    electron.sales.list(filters) as Promise<Sale[]>,
  listPendingCAE: () => electron.sales.listPendingCAE() as Promise<Sale[]>,
  updatePaymentMethod: (id: number, paymentMethod: PaymentMethod) =>
    electron.sales.updatePaymentMethod(id, paymentMethod) as Promise<Sale>,
  cancelSale: (id: number) => electron.sales.cancelSale(id) as Promise<Sale>,
}

// Invoicing
export const invoicing = {
  list: (filters: { dateFrom?: string; dateTo?: string; status?: string }) =>
    electron.invoicing.list(filters) as Promise<Sale[]>,
  retryCAE: (saleId: number) =>
    electron.invoicing.retryCAE(saleId) as Promise<{ success: boolean; error?: string }>,
}

// Printing
export const printing = {
  printSale: (saleId: number) =>
    electron.printing.printSale(saleId) as Promise<{ success: boolean; error?: string }>,
  buildTicketData: (saleId: number) =>
    electron.printing.buildTicketData(saleId),
  printInvoiceSystem: (saleId: number, includeChangeTicket = true) =>
    electron.printing.printInvoiceSystem(saleId, includeChangeTicket) as Promise<{ success: boolean; error?: string }>,
  printDeliveryNoteSystem: (saleId: number) =>
    electron.printing.printDeliveryNoteSystem(saleId) as Promise<{ success: boolean; error?: string }>,
  exportInvoicePdf: (saleId: number) =>
    electron.printing.exportInvoicePdf(saleId) as Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>,
  printBatch: (saleIds: number[]) =>
    electron.printing.printBatch(saleIds) as Promise<{ success: boolean; printed: number; errors: string[] }>,
  listForReprint: (filters: {
    dateFrom?: string; dateTo?: string; status?: string
    customerName?: string; customerDoc?: string; invoiceNumber?: number
  }) => electron.printing.listForReprint(filters) as Promise<Sale[]>,
  printChangeTicket: (saleId: number) =>
    electron.printing.printChangeTicket(saleId) as Promise<{ success: boolean; error?: string }>,
  printStockReport: () =>
    electron.printing.printStockReport() as Promise<{ success: boolean; error?: string; count?: number }>,
  printPriceReport: () =>
    electron.printing.printPriceReport() as Promise<{ success: boolean; error?: string; count?: number }>,
}

// Reporting
export const reporting = {
  salesByDateRange: (filters: { dateFrom?: string; dateTo?: string }) =>
    electron.reporting.salesByDateRange(filters) as Promise<SalesSummary[]>,
  topProducts: (filters: { dateFrom?: string; dateTo?: string }) =>
    electron.reporting.topProducts(filters) as Promise<unknown[]>,
  lowStock: () => electron.reporting.lowStock() as Promise<unknown[]>,
  stockMovements: (filters: { dateFrom?: string; dateTo?: string; productId?: number }) =>
    electron.reporting.stockMovements(filters) as Promise<unknown[]>,
  dailySummary: (filters: { dateFrom?: string; dateTo?: string }) =>
    electron.reporting.dailySummary(filters) as Promise<DailySummaryReport[]>,
  rankingPorCantidad: (filters: { dateFrom?: string; dateTo?: string }) =>
    electron.reporting.rankingPorCantidad(filters) as Promise<RankingItem[]>,
  rankingPorGanancia: (filters: { dateFrom?: string; dateTo?: string }) =>
    electron.reporting.rankingPorGanancia(filters) as Promise<RankingItem[]>,
  purchasesBySupplier: (filters: { dateFrom?: string; dateTo?: string; supplierId?: number }) =>
    electron.reporting.purchasesBySupplier(filters) as Promise<PurchasesReport>,
  incompleteEntries: (filters: { dateFrom?: string; dateTo?: string }) =>
    electron.reporting.incompleteEntries(filters) as Promise<IncompleteEntry[]>,
}

// Search analytics (buscador rápido de pandorabox-web)
export const searchAnalytics = {
  getReport: (filters: { dateFrom?: string; dateTo?: string; includeInternal?: boolean }) =>
    electron.searchAnalytics.getReport(filters) as Promise<SearchAnalyticsReport>,
}

// Backup
export const backup = {
  create: () => electron.backup.create() as Promise<{ success: boolean; backup?: BackupInfo; error?: string }>,
  list: () => electron.backup.list() as Promise<BackupInfo[]>,
  restore: (filename: string) =>
    electron.backup.restore(filename) as Promise<{ success: boolean; error?: string }>,
  purge: (retentionDays: number) =>
    electron.backup.purge(retentionDays) as Promise<number>,
}

// Parameters
export const parameters = {
  list: () => electron.parameters.list() as Promise<Parameter[]>,
  get: (id: number) => electron.parameters.get(id) as Promise<Parameter | undefined>,
  create: (data: { descripcion: string; porcentaje: number; tipo: '+' | '-' }) =>
    electron.parameters.create(data) as Promise<Parameter>,
  update: (id: number, data: Partial<{ descripcion: string; porcentaje: number; tipo: '+' | '-' }>) =>
    electron.parameters.update(id, data) as Promise<Parameter>,
  delete: (id: number) => electron.parameters.delete(id) as Promise<void>,
}

// System Params
export const systemParams = {
  get: () => electron.systemParams.get() as Promise<SystemParams>,
  save: (params: SystemParams) => electron.systemParams.save(params) as Promise<void>,
}

// Pedido de Reposición
export const pedido = {
  getSupplierProducts: (supplierId: number) =>
    electron.pedido.getSupplierProducts(supplierId) as Promise<PedidoProduct[]>,
  saveFile: (content: string, defaultName: string) =>
    electron.pedido.saveFile(content, defaultName) as Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>,
}

// Label Config
export const labelConfig = {
  get: () => electron.labelConfig.get() as Promise<import('../types/ipc').LabelConfig>,
  save: (config: import('../types/ipc').LabelConfig) =>
    electron.labelConfig.save(config) as Promise<void>,
  print: (config: import('../types/ipc').LabelConfig, copies: number) =>
    electron.labelConfig.print(config, copies) as Promise<{ success: boolean; error?: string }>,
  feed: (mm: number) =>
    electron.labelConfig.feed(mm) as Promise<{ success: boolean; error?: string }>,
}

// Printer Config
export const printerConfig = {
  get: () => electron.printerConfig.get() as Promise<PrinterConfig>,
  save: (config: PrinterConfig) => electron.printerConfig.save(config) as Promise<void>,
  testConnection: (config: PrinterConfig) =>
    electron.printerConfig.testConnection(config) as Promise<PrinterTestResult>,
  printTest: (config: PrinterConfig) =>
    electron.printerConfig.printTest(config) as Promise<PrinterTestResult>,
  listPrinters: () => electron.printerConfig.listPrinters() as Promise<string[]>,
}

// Re-export type for page use
export type { ConnectionType }

// Remito Scanner
export const remitoScanner = {
  selectImage: () => electron.remitoScanner.selectImage() as Promise<string | null>,
  scan: (imagePath: string) => electron.remitoScanner.scan(imagePath) as Promise<RemitoScanResult>,
  getMappings: (codes: string[]) =>
    electron.remitoScanner.getMappings(codes) as Promise<Record<string, { productId: number; productName: string }>>,
  saveMappings: (mappings: Array<{ supplierCode: string; productId: number }>) =>
    electron.remitoScanner.saveMappings(mappings) as Promise<void>,
  listMappings: () => electron.remitoScanner.listMappings() as Promise<RemitoMapping[]>,
  deleteMapping: (supplierCode: string) => electron.remitoScanner.deleteMapping(supplierCode) as Promise<void>,
}

// Sync
export const sync = {
  getConfig: () => electron.sync.getConfig() as Promise<SyncConfig>,
  saveConfig: (config: SyncConfig) => electron.sync.saveConfig(config) as Promise<void>,
  triggerNow: () => electron.sync.triggerNow() as Promise<SyncResult>,
  getLastResult: () => electron.sync.getLastResult() as Promise<SyncResult | null>,
  pullOrders: () => electron.sync.pullOrders() as Promise<import('../types/ipc').PullResult>,
  listWebOrders: () => electron.sync.listWebOrders() as Promise<unknown[]>,
  markOrderProcessed: (externalId: string) => electron.sync.markOrderProcessed(externalId) as Promise<void>,
  printShippingLabel: (order: { customerName: string; deliveryAddress: string; externalId: string }) =>
    electron.sync.printShippingLabel(order) as Promise<{ success: boolean; error?: string }>,
}

// Web Catalog
import type { WebCategory, WebProduct, WebProductImage, UnpublishedProduct } from '../types/ipc'

export const webCatalog = {
  listCategories:  () => electron.webCatalog.listCategories() as Promise<WebCategory[]>,
  saveCategory:    (id: number | null, input: Partial<WebCategory>) =>
    electron.webCatalog.saveCategory(id, input) as Promise<WebCategory>,
  deleteCategory:  (id: number) => electron.webCatalog.deleteCategory(id) as Promise<void>,
  listProducts:    () => electron.webCatalog.listProducts() as Promise<WebProduct[]>,
  getProduct:      (productId: number) => electron.webCatalog.getProduct(productId) as Promise<WebProduct | null>,
  saveProduct:     (input: Partial<WebProduct>) => electron.webCatalog.saveProduct(input) as Promise<WebProduct>,
  listUnpublished:  () => electron.webCatalog.listUnpublished() as Promise<UnpublishedProduct[]>,
  getNextSortOrder: (webCategoryId: number | null) => electron.webCatalog.getNextSortOrder(webCategoryId) as Promise<number>,
  getNextFeaturedOrder: () => electron.webCatalog.getNextFeaturedOrder() as Promise<number>,
  uploadImage:     (productId: number, sortOrder: number) =>
    electron.webCatalog.uploadImage(productId, sortOrder) as Promise<{ success: boolean; image?: WebProductImage; error?: string }>,
  deleteImage:     (imageId: number) => electron.webCatalog.deleteImage(imageId) as Promise<{ success: boolean }>,
  reorderImages:   (productId: number, orderedIds: number[]) =>
    electron.webCatalog.reorderImages(productId, orderedIds) as Promise<{ success: boolean }>,
  getImageDataUrl: (filename: string) => electron.webCatalog.getImageDataUrl(filename) as Promise<string | null>,
  getImagesDir:    () => electron.webCatalog.getImagesDir() as Promise<string>,
}

// Servidor LAN del catálogo web
import type { WebCatalogServerStatus, WebCatalogPairingInfo } from '../types/ipc'

export const webCatalogServer = {
  getStatus: () => electron.webCatalogServer.getStatus() as Promise<WebCatalogServerStatus>,
  setEnabled: (enabled: boolean) => electron.webCatalogServer.setEnabled(enabled) as Promise<WebCatalogServerStatus>,
  regenerateToken: () => electron.webCatalogServer.regenerateToken() as Promise<WebCatalogServerStatus>,
  getPairingInfo: () => electron.webCatalogServer.getPairingInfo() as Promise<WebCatalogPairingInfo>,
}

// Mail
export const mail = {
  sendInvoice: (saleId: number, toEmail: string) =>
    electron.mail.sendInvoice(saleId, toEmail) as Promise<{ success: boolean; error?: string }>,
}

// Crédito de clientes
export const credits = {
  getBalance: (customerId: number) =>
    electron.credits.getBalance(customerId) as Promise<number>,
  getHistory: (customerId: number) =>
    electron.credits.getHistory(customerId) as Promise<import('../types/ipc').CreditRecord[]>,
  use: (customerId: number, amount: number, saleId: number) =>
    electron.credits.use(customerId, amount, saleId) as Promise<{ ok: boolean; error?: string; newBalance: number }>,
  adjust: (customerId: number, amount: number, notes: string) =>
    electron.credits.adjust(customerId, amount, notes) as Promise<{ ok: boolean; error?: string }>,
}

// Cambios y Devoluciones
export const cambios = {
  preview: (rawQr: string) =>
    electron.cambios.preview(rawQr) as Promise<import('../types/ipc').ExchangePreview>,
  confirm: (rawQr: string, notes?: string) =>
    electron.cambios.confirm(rawQr, notes) as Promise<{ ok: boolean; error?: string; creditId?: number }>,
  list: (limit?: number) =>
    electron.cambios.list(limit) as Promise<import('../types/ipc').ExchangeRecord[]>,
}

// Caja
export const caja = {
  openSession: (input: { sessionDate: string; aperturaAmount: number }) =>
    electron.caja.openSession(input) as Promise<CashSession>,
  getOpenSession: () =>
    electron.caja.getOpenSession() as Promise<CashSession | undefined>,
  getSessionByDate: (date: string) =>
    electron.caja.getSessionByDate(date) as Promise<CashSession | undefined>,
  listSessions: (limit?: number) =>
    electron.caja.listSessions(limit) as Promise<CashSession[]>,
  getCierreSummary: (date: string) =>
    electron.caja.getCierreSummary(date) as Promise<CierreSummary>,
  closeSession: (date: string, cierreAmount: number) =>
    electron.caja.closeSession(date, cierreAmount) as Promise<CashSession>,
  reopenSession: (date: string) =>
    electron.caja.reopenSession(date) as Promise<CashSession>,
}

// Finanzas (ingresos/egresos multi-cuenta y patrimonio de socios)
export const finance = {
  listPartners: () => electron.finance.listPartners() as Promise<FinancePartner[]>,
  listAccounts: () => electron.finance.listAccounts() as Promise<FinanceAccount[]>,
  getFoundingDate: () => electron.finance.getFoundingDate() as Promise<string>,
  listCategories: (appliesTo?: FinanceCategoryAppliesTo) =>
    electron.finance.listCategories(appliesTo) as Promise<FinanceCategory[]>,
  createCategory: (input: CreateFinanceCategoryInput) =>
    electron.finance.createCategory(input) as Promise<FinanceCategory>,
  listMovements: (filters?: FinanceMovementFilters) =>
    electron.finance.listMovements(filters) as Promise<FinanceMovement[]>,
  createMovement: (input: CreateFinanceMovementInput) =>
    electron.finance.createMovement(input) as Promise<FinanceMovement>,
  deleteMovement: (id: number) => electron.finance.deleteMovement(id) as Promise<void>,
  getPendingAccreditations: (accountId?: number) =>
    electron.finance.getPendingAccreditations(accountId) as Promise<FinancePendingAccreditation[]>,
  accreditMovement: (movementId: number, fecha?: string) =>
    electron.finance.accreditMovement(movementId, fecha) as Promise<FinanceMovement>,
  listTransfers: (filters?: FinanceTransferFilters) =>
    electron.finance.listTransfers(filters) as Promise<FinanceTransfer[]>,
  createTransfer: (input: CreateFinanceTransferInput) =>
    electron.finance.createTransfer(input) as Promise<FinanceTransfer>,
  deleteTransfer: (id: number) => electron.finance.deleteTransfer(id) as Promise<void>,
  getAccountBalances: () => electron.finance.getAccountBalances() as Promise<FinanceAccountBalance[]>,
  getCashFlowSummary: (dateFrom: string, dateTo: string, groupBy?: 'day' | 'month', accountId?: number) =>
    electron.finance.getCashFlowSummary(dateFrom, dateTo, groupBy, accountId) as Promise<FinanceCashFlowPoint[]>,
  getExpensesByCategory: (dateFrom: string, dateTo: string, accountId?: number) =>
    electron.finance.getExpensesByCategory(dateFrom, dateTo, accountId) as Promise<FinanceCategoryExpense[]>,
  getPartnersEquity: () => electron.finance.getPartnersEquity() as Promise<FinancePartnerEquity[]>,
  listMpFeeRates: (paymentMethod?: MpFeePaymentMethod) =>
    electron.finance.listMpFeeRates(paymentMethod) as Promise<FinanceMpFeeRate[]>,
  createMpFeeRate: (input: CreateMpFeeRateInput) =>
    electron.finance.createMpFeeRate(input) as Promise<FinanceMpFeeRate>,
  deleteMpFeeRate: (id: number) => electron.finance.deleteMpFeeRate(id) as Promise<void>,
  getMpReconciliationRows: (fecha: string, paymentMethod?: MpFeePaymentMethod) =>
    electron.finance.getMpReconciliationRows(fecha, paymentMethod) as Promise<MpReconciliationRow[]>,
  listMpReconciliations: (dateFrom?: string, dateTo?: string) =>
    electron.finance.listMpReconciliations(dateFrom, dateTo) as Promise<FinanceMpReconciliation[]>,
  saveMpReconciliation: (input: SaveMpReconciliationInput) =>
    electron.finance.saveMpReconciliation(input) as Promise<FinanceMpReconciliation>,
  confirmMpReconciliationAdjustment: (id: number) =>
    electron.finance.confirmMpReconciliationAdjustment(id) as Promise<FinanceMpReconciliation>,
  ignoreMpReconciliation: (id: number) =>
    electron.finance.ignoreMpReconciliation(id) as Promise<FinanceMpReconciliation>,
  reopenMpReconciliation: (id: number) =>
    electron.finance.reopenMpReconciliation(id) as Promise<FinanceMpReconciliation>,
}

// Conteo de stock
export const stockCount = {
  getServerStatus: () => electron.stockCount.getServerStatus() as Promise<StockCountServerStatus>,
  setServerEnabled: (enabled: boolean) =>
    electron.stockCount.setServerEnabled(enabled) as Promise<StockCountServerStatus>,
  regenerateToken: () => electron.stockCount.regenerateToken() as Promise<StockCountServerStatus>,
  getSessionPairingQr: (sessionId: number) =>
    electron.stockCount.getSessionPairingQr(sessionId) as Promise<string | null>,
  createSession: (label: string, webCategoryId: number | null) =>
    electron.stockCount.createSession(label, webCategoryId) as Promise<number>,
  listSessions: (statusFilter?: StockCountSessionStatus) =>
    electron.stockCount.listSessions(statusFilter) as Promise<StockCountSession[]>,
  getSession: (id: number) => electron.stockCount.getSession(id) as Promise<StockCountSession | undefined>,
  getReconciliation: (sessionId: number) =>
    electron.stockCount.getReconciliation(sessionId) as Promise<ReconciliationRow[]>,
  applyReconciliation: (sessionId: number, decisions: ApplyReconciliationDecision[]) =>
    electron.stockCount.applyReconciliation(sessionId, decisions) as Promise<void>,
  cancelSession: (id: number) => electron.stockCount.cancelSession(id) as Promise<void>,
  deleteSession: (id: number) => electron.stockCount.deleteSession(id) as Promise<void>,
}
