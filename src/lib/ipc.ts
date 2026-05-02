/**
 * Typed helpers for calling window.electron IPC methods.
 * All methods return typed Promises.
 */

import type {
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
} from '../types/ipc'

// Access the electron bridge exposed by preload
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  }) => electron.stock.addMovement(data) as Promise<number>,
  adjustStock: (productId: number, newQuantity: number, userId?: number) =>
    electron.stock.adjustStock(productId, newQuantity, userId) as Promise<number>,
}

// Sales
export const sales = {
  create: (input: {
    customerId?: number
    userId?: number
    invoiceType?: number
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
    electron.printing.buildTicketData(saleId) as Promise<unknown>,
  printInvoiceSystem: (saleId: number) =>
    electron.printing.printInvoiceSystem(saleId) as Promise<{ success: boolean; error?: string }>,
  printDeliveryNoteSystem: (saleId: number) =>
    electron.printing.printDeliveryNoteSystem(saleId) as Promise<{ success: boolean; error?: string }>,
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
