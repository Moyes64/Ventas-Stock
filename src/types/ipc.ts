/**
 * TypeScript types for the IPC bridge exposed by preload.ts
 * These mirror the shapes returned by the main process modules.
 */

export interface LoginResult {
  success: boolean
  user?: AuthenticatedUser
  error?: string
}

export interface AuthenticatedUser {
  id: number
  username: string
  name: string
  role: Role
  permissions: Permission[]
}

export interface Role {
  id: number
  name: string
  description: string
}

export interface Permission {
  id: number
  roleId: number
  module: string
  action: string
}

export interface User {
  id: number
  username: string
  name: string
  roleId: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface TaxRate {
  id: number
  name: string
  percentage: number
  afipCode: number
}

export interface Category {
  id: number
  name: string
  description: string
}

export interface Product {
  id: number
  sku: string
  barcode: string | null
  name: string
  description: string
  categoryId: number | null
  supplierId: number | null
  supplierCode: string
  price: number
  cost: number
  taxRateId: number
  gainPercent: number
  active: boolean
  stockQuantity: number
  stockMin: number
  createdAt: string
  updatedAt: string
}

export interface Customer {
  id: number
  name: string
  cuitDni: string
  docType: string
  condicionIva: string
  address: string
  email: string
  phone: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface Supplier {
  id: number
  name: string
  cuit: string
  address: string
  email: string
  phone: string
  contact: string
  notes: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface StockItem {
  productId: number
  productName: string
  sku: string
  barcode: string | null
  currentStock: number
  stockMin: number
  isLow: boolean
}

export interface StockMovement {
  id: number
  productId: number
  productName?: string
  type: string
  quantity: number
  referenceType: string | null
  referenceId: number | null
  notes: string
  userId: number | null
  createdAt: string
  voucherType: string | null
  voucherNumber: string | null
  voucherDate: string | null
  supplierId: number | null
  supplierName: string | null
}

export type SaleStatus =
  | 'PENDING_CAE'
  | 'AUTHORIZED'
  | 'REJECTED'
  | 'INTERNAL_RECEIPT'
  | 'WEB_ORDER'
  | 'PROCESSED'
  | 'CANCELLED'
export type PaymentMethod =
  | 'contado_efectivo'
  | 'transferencia'
  | 'debito'
  | 'credito'
  | 'credito_cliente'
  | 'WEB_ORDER'
  | 'mercadopago'
  | 'qr'

export interface SaleItem {
  id?: number
  saleId?: number
  productId: number
  productName?: string
  quantity: number
  unitPrice: number
  taxRate: number
  subtotal: number
}

export interface AppliedParameter {
  id?: number
  parameterId?: number | null
  descripcion: string
  porcentaje: number
  tipo: '+' | '-'
}

export interface Sale {
  id: number
  customerId: number | null
  customerName?: string
  customerEmail?: string
  userId: number | null
  status: SaleStatus
  subtotal: number        // Adjusted subtotal without IVA (after parameters)
  taxAmount: number       // IVA on adjusted subtotal
  total: number           // subtotal + taxAmount
  discountAmount: number  // Net reduction in subtotal (positive = money saved)
  paymentMethod: PaymentMethod
  saleDate: string
  invoiceType: number | null
  invoiceNumber: number | null
  puntoVenta: number | null
  cae: string | null
  caeVto: string | null
  afipError: string | null
  isBlackSale: boolean
  createdAt: string
  updatedAt: string
  items?: SaleItem[]
  appliedParameters?: AppliedParameter[]
}

export interface BackupInfo {
  filename: string
  path: string
  sizeBytes: number
  createdAt: string
}

export interface DailySummaryReport {
  date: string
  salesCount: number
  authorizedInvoices: number
  internalReceipts: number
  totalGross: number
  totalTax: number
  totalNet: number
  whiteSalesCount: number
  whiteSalesTotal: number
  blackSalesCount: number
  blackSalesTotal: number
}

export interface SalesSummary {
  date: string
  salesCount: number
  totalAmount: number
  authorizedCount: number
  internalReceiptCount: number
}

export interface RankingItem {
  productId: number
  productName: string
  sku: string
  value: number
}

export interface PurchaseItem {
  movementId: number
  productId: number
  productName: string
  sku: string
  quantity: number
  unitCost: number
  unitPrice: number
  subtotalCost: number
  subtotalPrice: number
}

export interface PurchaseVoucherGroup {
  voucherType: string | null
  voucherNumber: string | null
  voucherDate: string | null
  items: PurchaseItem[]
  totalCost: number
  totalPrice: number
}

export interface PurchaseSupplierGroup {
  supplierId: number | null
  supplierName: string
  vouchers: PurchaseVoucherGroup[]
  totalCost: number
  totalPrice: number
}

export interface PurchasesReport {
  suppliers: PurchaseSupplierGroup[]
  grandTotalCost: number
  grandTotalPrice: number
  incompleteCount: number
}

export interface IncompleteEntry {
  movementId: number
  productId: number
  productName: string
  quantity: number
  createdAt: string
  supplierId: number | null
  supplierName: string | null
  voucherType: string | null
  voucherNumber: string | null
  voucherDate: string | null
  notes: string
}

export interface Parameter {
  id: number
  descripcion: string
  porcentaje: number
  tipo: '+' | '-'
  createdAt: string
  updatedAt: string
}

export type SessionStatus = 'open' | 'closed'

export interface CashSession {
  id: number
  sessionDate: string
  aperturaAmount: number
  cierreAmount: number | null
  status: SessionStatus
  createdAt: string
  updatedAt: string
}

// ── System Params ─────────────────────────────────────────────────────────

export interface SystemParams {
  denominacion: string
  calle: string
  numero: string
  codigoPostal: string
  contactoNombre: string
  contactoEmail: string
  telefonoContacto: string
  categoriaIva: 'Monotributo' | 'Responsable Inscripto'
  cuitCuil: string
  inicioActividades: string
  condicionIIBB: 'Exento' | 'Inscripto'
  nroIIBB: string
  anthropicApiKey: string
  ambienteArca: 'homologacion' | 'produccion'
  puntoVenta: string
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  smtpFromName: string
  costoEnvioWeb: number
  diasCambio: number
}

// ── Crédito de clientes ──────────────────────────────────────────────────

export interface CreditRecord {
  id: number
  amount: number
  type: 'CAMBIO' | 'DEVOLUCION' | 'USO' | 'AJUSTE'
  reference_id: number | null
  notes: string | null
  created_at: string
}

// ── Cambios y Devoluciones ───────────────────────────────────────────────

export interface ExchangePreview {
  ok: boolean
  error?: string
  saleId?: number
  saleDate?: string
  productId?: number
  productName?: string
  customerName?: string
  qty?: number
  amount?: number
  alreadyExchanged?: boolean
  expired?: boolean
  diasCambio?: number
  vencimiento?: string
}

export interface ExchangeRecord {
  id: number
  sale_id: number
  quantity: number
  amount: number
  notes: string | null
  created_at: string
  product_name: string
  customer_name: string | null
}

// ── Web Catalog ──────────────────────────────────────────────────────────

export interface WebCategory {
  id: number
  name: string
  slug: string
  description: string
  sortOrder: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface WebProductImage {
  id: number
  productId: number
  filename: string
  sortOrder: number
  createdAt: string
}

export interface WebProduct {
  id: number
  productId: number
  webCategoryId: number | null
  visible: boolean
  featured: boolean
  featuredOrder: number
  webPrice: number | null
  shortDescription: string
  longDescription: string
  ageMin: number | null
  playersMin: number | null
  playersMax: number | null
  playTimeMin: number | null
  difficulty: number | null
  videoUrl: string
  tags: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  productName: string
  productPrice: number
  productStock: number
  productSku: string
  images: WebProductImage[]
}

export interface UnpublishedProduct {
  id: number
  name: string
  sku: string
  price: number
  stock: number
  supplierId: number | null
  supplierName: string | null
}

// ── Remito Scanner ────────────────────────────────────────────────────────

export interface RemitoItem {
  articulo: string
  descripcion: string
  cantidad: number
  codigoBarras: string | null
}

export interface RemitoExtracted {
  numeroRemito: string
  fecha: string
  proveedor: string
  items: RemitoItem[]
}

export interface RemitoScanResult {
  success: boolean
  data?: RemitoExtracted
  error?: string
}

export interface RemitoMapping {
  supplierCode: string
  productId: number
  productName: string
}

export type MatchSource = 'barcode' | 'mapping' | 'name' | 'manual' | null

// ── Printer Config ────────────────────────────────────────────────────────────

export type ConnectionType = 'usb' | 'tcp'

export interface PrinterConfig {
  connectionType: ConnectionType
  ip: string
  port: number
  usbPrinterName: string
  darkness: number   // 1-7
  speed: 'normal' | 'slow'
  enabled: boolean
}

export interface PrinterTestResult {
  success: boolean
  error?: string
}

// ── Pedido de Reposición ──────────────────────────────────────────────────

export interface PedidoProduct {
  id: number
  name: string
  sku: string
  supplierCode: string
  stockQuantity: number
  stockMin: number
  cost: number
  supplierName: string
  isLow: boolean
}

export interface PedidoItem {
  product: PedidoProduct
  cantidad: number
}

// ── Sync ──────────────────────────────────────────────────────────────────

export interface SyncConfig {
  enabled: boolean
  apiUrl: string
  apiKey: string
  intervalMinutes: number
}

export interface SyncResult {
  success: boolean
  timestamp: string
  error?: string
}

// ── Label Config ──────────────────────────────────────────────────────────

export type LabelFontSize = 'small' | 'normal' | 'large'
export type LabelAlign = 'left' | 'center' | 'right'

export interface LabelLine {
  text: string
  fontSize: LabelFontSize
  alignment: LabelAlign
  bold: boolean
}

export interface LabelConfig {
  labelWidthMm: number
  labelHeightMm: number
  gapMm: number
  leftMarginChars: number
  lines: LabelLine[]
  defaultCopies: number
}

// ── Caja summary ──────────────────────────────────────────────────────────

export interface CierreSummary {
  session: CashSession
  aperturaAmount: number
  cashSalesTotal: number
  ingresosTotal: number
  egresosTotal: number
  /** Transferencias entre cuentas que ingresaron dinero a Caja ese día. */
  transfersInTotal: number
  /** Transferencias entre cuentas que sacaron dinero de Caja ese día. */
  transfersOutTotal: number
  expectedTotal: number
  salesByPaymentMethod: {
    contado_efectivo: number
    transferencia: number
    debito: number
    credito: number
    qr: number
    mercadopago: number
  }
  movements: FinanceMovement[]
  transfers: FinanceTransfer[]
}

// ── Finanzas (ingresos/egresos multi-cuenta y patrimonio de socios) ───────

export type FinanceMovementTipo = 'ingreso' | 'egreso'
export type FinanceAccountType = 'efectivo' | 'mercadopago' | 'banco'
export type FinanceCategoryAppliesTo = 'ingreso' | 'egreso' | 'ambos'

export interface FinancePartner {
  id: number
  name: string
  ownershipPct: number
  active: boolean
  createdAt: string
}

export interface FinanceAccount {
  id: number
  name: string
  type: FinanceAccountType
  active: boolean
  createdAt: string
}

export interface FinanceCategory {
  id: number
  name: string
  appliesTo: FinanceCategoryAppliesTo
  active: boolean
}

export interface FinanceMovement {
  id: number
  accountId: number
  tipo: FinanceMovementTipo
  categoriaId: number | null
  monto: number
  descripcion: string
  fecha: string
  fechaAcreditacion: string | null
  partnerId: number | null
  supplierId: number | null
  saleId: number | null
  createdAt: string
}

export interface CreateFinanceMovementInput {
  accountId: number
  tipo: FinanceMovementTipo
  categoriaId?: number | null
  monto: number
  descripcion: string
  fecha?: string
  fechaAcreditacion?: string | null
  partnerId?: number | null
  supplierId?: number | null
  saleId?: number | null
}

export interface FinancePendingAccreditation {
  movementId: number
  accountId: number
  accountName: string
  monto: number
  fecha: string
  fechaAcreditacion: string
  descripcion: string
}

export interface FinanceTransfer {
  id: number
  fromAccountId: number
  toAccountId: number
  monto: number
  descripcion: string | null
  fecha: string
  createdAt: string
}

export interface CreateFinanceTransferInput {
  fromAccountId: number
  toAccountId: number
  monto: number
  descripcion?: string | null
  fecha?: string
}

export interface FinanceTransferFilters {
  dateFrom?: string
  dateTo?: string
  accountId?: number
}

export interface FinanceMovementFilters {
  accountId?: number
  tipo?: FinanceMovementTipo
  categoriaId?: number
  partnerId?: number
  dateFrom?: string
  dateTo?: string
}

export interface CreateFinanceCategoryInput {
  name: string
  appliesTo: FinanceCategoryAppliesTo
}

export interface FinanceAccountBalance {
  accountId: number
  accountName: string
  accountType: FinanceAccountType
  balance: number
  pendingAmount: number
  nextAccreditationDate: string | null
}

export interface FinanceCashFlowPoint {
  period: string
  ingresos: number
  egresos: number
  neto: number
}

export interface FinanceCategoryExpense {
  categoriaId: number | null
  categoriaName: string
  total: number
}

export interface FinancePartnerEquity {
  partnerId: number
  partnerName: string
  ownershipPct: number
  utilidadAcumulada: number
  retirosRealizados: number
  saldoPendiente: number
}

// ── Comisiones de Mercado Pago (QR / Débito / Crédito) y conciliación ──────

export type MpFeePaymentMethod = 'qr' | 'debito' | 'credito' | 'mercadopago'

export interface FinanceMpFeeRate {
  id: number
  paymentMethod: MpFeePaymentMethod
  pct: number
  ivaPct: number
  vigenteDesde: string
  createdAt: string
}

export interface CreateMpFeeRateInput {
  paymentMethod: MpFeePaymentMethod
  pct: number
  ivaPct?: number
  vigenteDesde?: string
}

export type MpReconciliationStatus = 'pending' | 'adjusted' | 'ignored'

export interface FinanceMpReconciliation {
  id: number
  saleId: number
  fecha: string
  paymentMethod: MpFeePaymentMethod
  brutoSistema: number
  comisionSistema: number
  brutoReal: number
  comisionReal: number
  netoReal: number
  diferencia: number
  status: MpReconciliationStatus
  ajusteMovementId: number | null
  createdAt: string
  updatedAt: string
}

export interface SaveMpReconciliationInput {
  saleId: number
  brutoReal: number
  comisionReal: number
  netoReal: number
}

export interface MpReconciliationRow {
  saleId: number
  paymentMethod: MpFeePaymentMethod
  fecha: string
  customerName: string | null
  invoiceNumber: number | null
  total: number
  brutoSistema: number
  comisionSistema: number
  netoSistema: number
  reconciliation: FinanceMpReconciliation | null
}

// ── Conteo de stock ──────────────────────────────────────────────────────────

export type StockCountSessionStatus = 'open' | 'uploaded' | 'reconciled' | 'cancelled'

export interface StockCountSession {
  id: number
  label: string
  /** Categoría de Catálogo Web (no la de Catálogo base). null = todo el catálogo. */
  webCategoryId: number | null
  webCategoryName: string | null
  status: StockCountSessionStatus
  itemCount: number
  createdAt: string
  uploadedAt: string | null
  reconciledAt: string | null
}

export interface ReconciliationRow {
  itemId: number
  productId: number
  productName: string
  sku: string
  systemQuantity: number
  countedQuantity: number
  diff: number
  note: string
  reconciled: boolean
}

export interface ApplyReconciliationDecision {
  itemId: number
  apply: boolean
}

export interface StockCountServerStatus {
  running: boolean
  enabled: boolean
  port: number
  lanIp: string | null
  token: string
  error: string | null
}

// ── Servidor LAN del catálogo web ────────────────────────────────────────

export interface WebCatalogServerStatus {
  running: boolean
  enabled: boolean
  port: number
  lanIp: string | null
  token: string
  error: string | null
}

export interface WebCatalogPairingInfo {
  url: string | null
  qrDataUrl: string | null
}
