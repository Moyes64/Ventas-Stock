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
  },

  // Reporting
  reporting: {
    salesByDateRange: (filters: unknown) => invoke('reporting:salesByDateRange', filters),
    topProducts: (filters: unknown) => invoke('reporting:topProducts', filters),
    lowStock: () => invoke('reporting:lowStock'),
    stockMovements: (filters: unknown) => invoke('reporting:stockMovements', filters),
    dailySummary: (filters: unknown) => invoke('reporting:dailySummary', filters),
  },

  // Backup
  backup: {
    create: () => invoke('backup:create'),
    list: () => invoke('backup:list'),
    restore: (filename: string) => invoke('backup:restore', filename),
    purge: (retentionDays: number) => invoke('backup:purge', retentionDays),
  },
}

contextBridge.exposeInMainWorld('electron', electronAPI)

export type ElectronAPI = typeof electronAPI
