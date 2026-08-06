import { contextBridge, ipcRenderer } from 'electron'

/**
 * Electron preload script.
 * Exposes a safe, typed IPC bridge to the renderer via contextBridge.
 * The renderer accesses everything through window.electron.
 */

// Helper: creates a typed invoke wrapper
function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>
}

const electronAPI = {
  // Auth
  auth: {
    login: (username: string, password: string) =>
      invoke('auth:login', username, password),
    listUsers: () => invoke('auth:listUsers'),
    createUser: (data: unknown) => invoke('auth:createUser', data),
    updateUser: (id: number, data: unknown) => invoke('auth:updateUser', id, data),
    deleteUser: (id: number) => invoke('auth:deleteUser', id),
    listRoles: () => invoke('auth:listRoles'),
  },

  // Catalog
  catalog: {
    listProducts: (activeOnly?: boolean) => invoke('catalog:listProducts', activeOnly),
    searchProducts: (query: string) => invoke('catalog:searchProducts', query),
    getProduct: (id: number) => invoke('catalog:getProduct', id),
    getByBarcode: (barcode: string) => invoke('catalog:getByBarcode', barcode),
    createProduct: (data: unknown) => invoke('catalog:createProduct', data),
    updateProduct: (id: number, data: unknown) => invoke('catalog:updateProduct', id, data),
    deleteProduct: (id: number) => invoke('catalog:deleteProduct', id),
    getTaxRates: () => invoke('catalog:getTaxRates'),
    getCategories: () => invoke('catalog:getCategories'),
    listLowStock: () => invoke('catalog:listLowStock'),
  },

  // Customers
  customers: {
    list: () => invoke('customers:list'),
    search: (query: string) => invoke('customers:search', query),
    get: (id: number) => invoke('customers:get', id),
    create: (data: unknown) => invoke('customers:create', data),
    update: (id: number, data: unknown) => invoke('customers:update', id, data),
    delete: (id: number) => invoke('customers:delete', id),
  },

  // Suppliers
  suppliers: {
    list: (activeOnly?: boolean) => invoke('suppliers:list', activeOnly),
    search: (query: string) => invoke('suppliers:search', query),
    get: (id: number) => invoke('suppliers:get', id),
    create: (data: unknown) => invoke('suppliers:create', data),
    update: (id: number, data: unknown) => invoke('suppliers:update', id, data),
    delete: (id: number) => invoke('suppliers:delete', id),
  },

  // Stock
  stock: {
    getItems: () => invoke('stock:getItems'),
    getCurrent: (productId: number) => invoke('stock:getCurrent', productId),
    getMovements: (filters: unknown) => invoke('stock:getMovements', filters),
    addMovement: (data: unknown) => invoke('stock:addMovement', data),
    updateMovement: (id: number, data: unknown) => invoke('stock:updateMovement', id, data),
    deleteMovement: (id: number) => invoke('stock:deleteMovement', id),
    adjustStock: (productId: number, newQuantity: number, userId?: number) =>
      invoke('stock:adjustStock', productId, newQuantity, userId),
  },

  // Sales
  sales: {
    create: (input: unknown) => invoke('sales:create', input),
    get: (id: number) => invoke('sales:get', id),
    list: (filters: unknown) => invoke('sales:list', filters),
    listPendingCAE: () => invoke('sales:listPendingCAE'),
    updatePaymentMethod: (id: number, paymentMethod: string) =>
      invoke('sales:updatePaymentMethod', id, paymentMethod),
    cancelSale: (id: number) => invoke('sales:cancelSale', id),
  },

  // Invoicing
  invoicing: {
    list: (filters: unknown) => invoke('invoicing:list', filters),
    retryCAE: (saleId: number) => invoke('invoicing:retryCAE', saleId),
  },

  // Printing
  printing: {
    printSale: (saleId: number) => invoke('printing:printSale', saleId),
    buildTicketData: (saleId: number) => invoke('printing:buildTicketData', saleId),
    printInvoiceSystem: (saleId: number) => invoke('printing:printInvoiceSystem', saleId),
    printDeliveryNoteSystem: (saleId: number) => invoke('printing:printDeliveryNoteSystem', saleId),
    printBatch: (saleIds: number[]) => invoke('printing:printBatch', saleIds),
    listForReprint: (filters: unknown) => invoke('printing:listForReprint', filters),
    printChangeTicket: (saleId: number) => invoke('printing:printChangeTicket', saleId),
    printStockReport: () => invoke('printing:printStockReport'),
    printPriceReport: () => invoke('printing:printPriceReport'),
  },

  // Reporting
  reporting: {
    salesByDateRange: (filters: unknown) => invoke('reporting:salesByDateRange', filters),
    topProducts: (filters: unknown) => invoke('reporting:topProducts', filters),
    lowStock: () => invoke('reporting:lowStock'),
    stockMovements: (filters: unknown) => invoke('reporting:stockMovements', filters),
    dailySummary: (filters: unknown) => invoke('reporting:dailySummary', filters),
    rankingPorCantidad: (filters: unknown) => invoke('reporting:rankingPorCantidad', filters),
    rankingPorGanancia: (filters: unknown) => invoke('reporting:rankingPorGanancia', filters),
    purchasesBySupplier: (filters: unknown) => invoke('reporting:purchasesBySupplier', filters),
    incompleteEntries: (filters: unknown) => invoke('reporting:incompleteEntries', filters),
  },

  // Backup
  backup: {
    create: () => invoke('backup:create'),
    list: () => invoke('backup:list'),
    restore: (filename: string) => invoke('backup:restore', filename),
    purge: (retentionDays: number) => invoke('backup:purge', retentionDays),
  },

  // Parameters
  parameters: {
    list: () => invoke('parameters:list'),
    get: (id: number) => invoke('parameters:get', id),
    create: (data: unknown) => invoke('parameters:create', data),
    update: (id: number, data: unknown) => invoke('parameters:update', id, data),
    delete: (id: number) => invoke('parameters:delete', id),
  },

  // System Params
  systemParams: {
    get: () => invoke('systemParams:get'),
    save: (params: unknown) => invoke('systemParams:save', params),
  },

  // Pedido de Reposición
  pedido: {
    getSupplierProducts: (supplierId: number) => invoke('pedido:getSupplierProducts', supplierId),
    saveFile: (content: string, defaultName: string) => invoke('pedido:saveFile', content, defaultName),
  },

  // Sync
  sync: {
    getConfig: () => invoke('sync:getConfig'),
    saveConfig: (config: unknown) => invoke('sync:saveConfig', config),
    triggerNow: () => invoke('sync:triggerNow'),
    getLastResult: () => invoke('sync:getLastResult'),
    pullOrders: () => invoke('sync:pullOrders'),
    listWebOrders: () => invoke('sync:listWebOrders'),
    markOrderProcessed: (externalId: string) => invoke('sync:markOrderProcessed', externalId),
    printShippingLabel: (order: { customerName: string; deliveryAddress: string; externalId: string }) => invoke('sync:printShippingLabel', order),
  },

  // Remito Scanner
  remitoScanner: {
    selectImage: () => invoke<string | null>('remitoScanner:selectImage'),
    scan: (imagePath: string) => invoke('remitoScanner:scan', imagePath),
    getMappings: (supplierCodes: string[]) => invoke('remitoScanner:getMappings', supplierCodes),
    saveMappings: (mappings: Array<{ supplierCode: string; productId: number }>) => invoke('remitoScanner:saveMappings', mappings),
    listMappings: () => invoke('remitoScanner:listMappings'),
    deleteMapping: (supplierCode: string) => invoke('remitoScanner:deleteMapping', supplierCode),
  },

  // Printer Config
  printerConfig: {
    get: () => invoke('printerConfig:get'),
    save: (config: unknown) => invoke('printerConfig:save', config),
    testConnection: (config: unknown) => invoke('printerConfig:testConnection', config),
    printTest: (config: unknown) => invoke('printerConfig:printTest', config),
    listPrinters: () => invoke('printerConfig:listPrinters'),
  },

  // Label Config
  labelConfig: {
    get: () => invoke('labelConfig:get'),
    save: (config: unknown) => invoke('labelConfig:save', config),
    print: (config: unknown, copies: number) => invoke('labelConfig:print', config, copies),
    feed: (mm: number) => invoke('labelConfig:feed', mm),
  },

  // CSR / Certificados ARCA
  csr: {
    generate: (input: unknown) => invoke('csr:generate', input),
    importCert: (ambiente: string) => invoke('csr:importCert', ambiente),
  },

  // Web Catalog
  webCatalog: {
    listCategories:   () => invoke('webCatalog:listCategories'),
    saveCategory:     (id: number | null, input: unknown) => invoke('webCatalog:saveCategory', id, input),
    deleteCategory:   (id: number) => invoke('webCatalog:deleteCategory', id),
    listProducts:     () => invoke('webCatalog:listProducts'),
    getProduct:       (productId: number) => invoke('webCatalog:getProduct', productId),
    saveProduct:      (input: unknown) => invoke('webCatalog:saveProduct', input),
    listUnpublished:   () => invoke('webCatalog:listUnpublished'),
    getNextSortOrder:  (webCategoryId: number | null) => invoke('webCatalog:getNextSortOrder', webCategoryId),
    getNextFeaturedOrder: () => invoke('webCatalog:getNextFeaturedOrder'),
    uploadImage:      (productId: number, sortOrder: number) => invoke('webCatalog:uploadImage', productId, sortOrder),
    deleteImage:      (imageId: number) => invoke('webCatalog:deleteImage', imageId),
    reorderImages:    (productId: number, orderedIds: number[]) => invoke('webCatalog:reorderImages', productId, orderedIds),
    getImageDataUrl:  (filename: string) => invoke<string | null>('webCatalog:getImageDataUrl', filename),
    getImagesDir:     () => invoke<string>('webCatalog:getImagesDir'),
  },

  // Mail
  mail: {
    sendInvoice: (saleId: number, toEmail: string) => invoke('mail:sendInvoice', saleId, toEmail),
  },

  // Caja
  caja: {
    openSession: (input: unknown) => invoke('caja:openSession', input),
    getOpenSession: () => invoke('caja:getOpenSession'),
    getSessionByDate: (date: string) => invoke('caja:getSessionByDate', date),
    listSessions: (limit?: number) => invoke('caja:listSessions', limit),
    getCierreSummary: (date: string) => invoke('caja:getCierreSummary', date),
    closeSession: (date: string, cierreAmount: number) =>
      invoke('caja:closeSession', date, cierreAmount),
    reopenSession: (date: string) => invoke('caja:reopenSession', date),
  },

  // Crédito de clientes
  credits: {
    getBalance: (customerId: number) => invoke('credits:getBalance', customerId),
    getHistory: (customerId: number) => invoke('credits:getHistory', customerId),
    use: (customerId: number, amount: number, saleId: number) => invoke('credits:use', customerId, amount, saleId),
    adjust: (customerId: number, amount: number, notes: string) => invoke('credits:adjust', customerId, amount, notes),
  },

  // Cambios y Devoluciones
  cambios: {
    preview: (rawQr: string) => invoke('cambios:preview', rawQr),
    confirm: (rawQr: string, notes?: string) => invoke('cambios:confirm', rawQr, notes),
    list: (limit?: number) => invoke('cambios:list', limit),
  },

  // Finanzas (ingresos/egresos multi-cuenta y patrimonio de socios)
  finance: {
    listPartners: () => invoke('finance:listPartners'),
    listAccounts: () => invoke('finance:listAccounts'),
    getFoundingDate: () => invoke('finance:getFoundingDate'),
    listCategories: (appliesTo?: string) => invoke('finance:listCategories', appliesTo),
    createCategory: (input: unknown) => invoke('finance:createCategory', input),
    listMovements: (filters?: unknown) => invoke('finance:listMovements', filters),
    createMovement: (input: unknown) => invoke('finance:createMovement', input),
    deleteMovement: (id: number) => invoke('finance:deleteMovement', id),
    getPendingAccreditations: (accountId?: number) => invoke('finance:getPendingAccreditations', accountId),
    accreditMovement: (movementId: number, fecha?: string) => invoke('finance:accreditMovement', movementId, fecha),
    listTransfers: (filters?: unknown) => invoke('finance:listTransfers', filters),
    createTransfer: (input: unknown) => invoke('finance:createTransfer', input),
    deleteTransfer: (id: number) => invoke('finance:deleteTransfer', id),
    getAccountBalances: () => invoke('finance:getAccountBalances'),
    getCashFlowSummary: (dateFrom: string, dateTo: string, groupBy?: 'day' | 'month', accountId?: number) =>
      invoke('finance:getCashFlowSummary', dateFrom, dateTo, groupBy, accountId),
    getExpensesByCategory: (dateFrom: string, dateTo: string, accountId?: number) =>
      invoke('finance:getExpensesByCategory', dateFrom, dateTo, accountId),
    getPartnersEquity: () => invoke('finance:getPartnersEquity'),
    listMpFeeRates: (paymentMethod?: string) => invoke('finance:listMpFeeRates', paymentMethod),
    createMpFeeRate: (input: unknown) => invoke('finance:createMpFeeRate', input),
    deleteMpFeeRate: (id: number) => invoke('finance:deleteMpFeeRate', id),
    getMpReconciliationRows: (fecha: string, paymentMethod?: string) =>
      invoke('finance:getMpReconciliationRows', fecha, paymentMethod),
    listMpReconciliations: (dateFrom?: string, dateTo?: string) =>
      invoke('finance:listMpReconciliations', dateFrom, dateTo),
    saveMpReconciliation: (input: unknown) => invoke('finance:saveMpReconciliation', input),
    confirmMpReconciliationAdjustment: (id: number) => invoke('finance:confirmMpReconciliationAdjustment', id),
    ignoreMpReconciliation: (id: number) => invoke('finance:ignoreMpReconciliation', id),
    reopenMpReconciliation: (id: number) => invoke('finance:reopenMpReconciliation', id),
  },

  // Conteo de stock (servidor local + sesiones de conciliación)
  stockCount: {
    getServerStatus: () => invoke('stockCount:getServerStatus'),
    setServerEnabled: (enabled: boolean) => invoke('stockCount:setServerEnabled', enabled),
    regenerateToken: () => invoke('stockCount:regenerateToken'),
    getSessionPairingQr: (sessionId: number) => invoke('stockCount:getSessionPairingQr', sessionId),
    createSession: (label: string, webCategoryId: number | null) =>
      invoke('stockCount:createSession', label, webCategoryId),
    listSessions: (statusFilter?: string) => invoke('stockCount:listSessions', statusFilter),
    getSession: (id: number) => invoke('stockCount:getSession', id),
    getReconciliation: (sessionId: number) => invoke('stockCount:getReconciliation', sessionId),
    applyReconciliation: (sessionId: number, decisions: unknown) =>
      invoke('stockCount:applyReconciliation', sessionId, decisions),
    cancelSession: (id: number) => invoke('stockCount:cancelSession', id),
    deleteSession: (id: number) => invoke('stockCount:deleteSession', id),
  },
}

contextBridge.exposeInMainWorld('electron', electronAPI)

export type ElectronAPI = typeof electronAPI
