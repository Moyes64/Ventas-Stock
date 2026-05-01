import type { Database } from 'better-sqlite3'
import { CustomerRepository } from './repository'
import type { Customer, CreateCustomerInput, UpdateCustomerInput } from './types'

export class CustomerService {
  private readonly repo: CustomerRepository

  constructor(db: Database) {
    this.repo = new CustomerRepository(db)
  }

  getById(id: number): Customer | undefined {
    return this.repo.findById(id)
  }

  search(query: string): Customer[] {
    return this.repo.search(query)
  }

  list(): Customer[] {
    return this.repo.list()
  }

  create(data: CreateCustomerInput): Customer {
    if (!data.name.trim()) throw new Error('El nombre es obligatorio')
    const id = this.repo.create(data)
    return this.repo.findById(id)!
  }

  update(id: number, data: UpdateCustomerInput): Customer {
    const existing = this.repo.findById(id)
    if (!existing) throw new Error(`Cliente no encontrado: ${id}`)
    this.repo.update(id, data)
    return this.repo.findById(id)!
  }

  delete(id: number): void {
    const existing = this.repo.findById(id)
    if (!existing) throw new Error(`Cliente no encontrado: ${id}`)
    this.repo.delete(id)
  }
}
