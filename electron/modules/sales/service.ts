import type { Database } from 'better-sqlite3'
import { SaleRepository } from './repository'
import { StockService } from '../stock/service'
import { InvoicingService } from '../invoicing-afip/service'
import type { Sale, CreateSaleInput } from './types'

export class SaleService {
  private readonly saleRepo: SaleRepository
  private readonly stockService: StockService
  private readonly invoicingService: InvoicingService

  constructor(db: Database, invoicingService: InvoicingService) {
    this.saleRepo = new SaleRepository(db)
    this.stockService = new StockService(db)
    this.invoicingService = invoicingService
  }

  getById(id: number): Sale | undefined {
    return this.saleRepo.findById(id)
  }

  list(filters: { dateFrom?: string; dateTo?: string; status?: string; limit?: number }): Sale[] {
    return this.saleRepo.list(filters)
  }

  findPendingCAE(): Sale[] {
    return this.saleRepo.findPendingCAE()
  }

  /**
   * End-to-end sale creation flow:
   *
   * 1. Validate stock availability for all items
   * 2. Calculate totals (subtotal without IVA, taxAmount, total with IVA)
   *    For black sales (isBlackSale=true): taxAmount=0, total=subtotal (base price, no IVA)
   * 3. Persist sale with status PENDING_CAE (or INTERNAL_RECEIPT for black sales)
   * 4. Register stock exits
   * 5. For normal sales: Call InvoicingService.solicitarCAE(sale)
   *    a. On success → update sale with CAE data, status = AUTHORIZED
   *    b. On failure → update sale with error, status = INTERNAL_RECEIPT
   *    For black sales: skip AFIP, status remains INTERNAL_RECEIPT
   * 6. Return the final sale state
   */
  async createSale(input: CreateSaleInput): Promise<Sale> {
    // Step 1: Validate stock
    this.stockService.validateAvailability(
      input.items.map(i => ({ productId: i.productId, quantity: i.quantity }))
    )

    // Step 2: Calculate totals
    let subtotal = 0
    let taxAmount = 0

    if (input.isBlackSale) {
      // Black sale (venta en negro): no IVA applied — total equals sum of item prices
      for (const item of input.items) {
        const itemTotal = item.quantity * item.unitPrice
        const taxFactor = item.taxRate / 100
        // Extract base price (strip IVA that is embedded in unit price)
        subtotal += itemTotal / (1 + taxFactor)
      }
      taxAmount = 0
    } else {
      for (const item of input.items) {
        const itemTotal = item.quantity * item.unitPrice
        const taxFactor = item.taxRate / 100
        // unitPrice is WITH IVA; extract base and tax
        const itemBase = itemTotal / (1 + taxFactor)
        subtotal += itemBase
        taxAmount += itemTotal - itemBase
      }
    }

    const total = subtotal + taxAmount

    // Step 3: Persist sale
    const saleId = this.saleRepo.create({
      ...input,
      subtotal: Math.round(subtotal * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      total: Math.round(total * 100) / 100,
    })

    // Step 4: Register stock exits
    this.stockService.registerSaleExit(
      input.items.map(i => ({ productId: i.productId, quantity: i.quantity })),
      saleId,
      input.userId
    )

    // Step 5: Request CAE (skip for black sales — always internal receipt)
    const sale = this.saleRepo.findById(saleId)!

    if (input.isBlackSale) {
      // Black sales are always internal receipts — never interact with AFIP
      this.saleRepo.updateStatus(sale.id, 'INTERNAL_RECEIPT')
    } else {
      try {
        const caeResult = await this.invoicingService.solicitarCAE(sale)

        if (caeResult.success && caeResult.cae) {
          // Step 5a: CAE obtained — update sale as AUTHORIZED
          this.saleRepo.updateStatus(sale.id, 'AUTHORIZED', {
            cae: caeResult.cae,
            caeVto: caeResult.caeVto!,
            invoiceNumber: caeResult.invoiceNumber!,
            puntoVenta: caeResult.puntoVenta!,
          })
        } else {
          // Step 5b: AFIP rejected or error — fallback to internal receipt
          this.saleRepo.updateStatus(sale.id, 'INTERNAL_RECEIPT')
          if (caeResult.error) {
            this.saleRepo.updateAfipError(sale.id, caeResult.error)
          }
        }
      } catch (err) {
        // Network or unexpected error — save as internal receipt
        const errorMsg = err instanceof Error ? err.message : String(err)
        this.saleRepo.updateStatus(sale.id, 'INTERNAL_RECEIPT')
        this.saleRepo.updateAfipError(sale.id, `Error inesperado: ${errorMsg}`)
      }
    }

    // Step 6: Return final state
    return this.saleRepo.findById(saleId)!
  }
}
