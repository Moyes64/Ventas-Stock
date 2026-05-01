import type { Database } from 'better-sqlite3'
import { SupplierRepository } from './repository'
import type { Supplier, CreateSupplierInput, UpdateSupplierInput } from './types'

export class SupplierService {
  private readonly repo: SupplierRepository

  constructor(db: Database) {
    this.repo = new SupplierRepository(db)
  }

  getById(id: number): Supplier | undefined {
    return this.repo.findById(id)
  }

  search(query: string): Supplier[] {
    return this.repo.search(query)
  }

  list(activeOnly = true): Supplier[] {
    return this.repo.list(activeOnly)
  }

  create(data: CreateSupplierInput): Supplier {
    if (!data.name.trim()) throw new Error('El nombre es obligatorio')
    const id = this.repo.create(data)
    return this.repo.findById(id)!
  }

  update(id: number, data: UpdateSupplierInput): Supplier {
    const existing = this.repo.findById(id)
    if (!existing) throw new Error(`Proveedor no encontrado: ${id}`)
    this.repo.update(id, data)
    return this.repo.findById(id)!
  }

  delete(id: number): void {
    const existing = this.repo.findById(id)
    if (!existing) throw new Error(`Proveedor no encontrado: ${id}`)
    this.repo.delete(id)
  }
}
