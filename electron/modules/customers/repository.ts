import type { Database } from 'better-sqlite3'
import type { Customer, CreateCustomerInput, UpdateCustomerInput } from './types'

interface CustomerRow {
  id: number
  name: string
  cuit_dni: string
  doc_type: string
  condicion_iva: string
  address: string
  email: string
  phone: string
  notes: string
  created_at: string
  updated_at: string
}

export class CustomerRepository {
  constructor(private readonly db: Database) {}

  findById(id: number): Customer | undefined {
    const row = this.db
      .prepare('SELECT * FROM customers WHERE id = ?')
      .get(id) as CustomerRow | undefined
    return row ? this.mapRow(row) : undefined
  }

  search(query: string): Customer[] {
    const like = `%${query}%`
    const rows = this.db
      .prepare(
        `SELECT * FROM customers
         WHERE name LIKE ? OR cuit_dni LIKE ? OR email LIKE ?
         ORDER BY name ASC LIMIT 50`
      )
      .all(like, like, like) as CustomerRow[]
    return rows.map(r => this.mapRow(r))
  }

  list(): Customer[] {
    return (
      this.db.prepare('SELECT * FROM customers ORDER BY name ASC').all() as CustomerRow[]
    ).map(r => this.mapRow(r))
  }

  create(data: CreateCustomerInput): number {
    const result = this.db
      .prepare(
        `INSERT INTO customers (name, cuit_dni, doc_type, condicion_iva, address, email, phone, notes)
         VALUES (@name, @cuitDni, @docType, @condicionIva, @address, @email, @phone, @notes)`
      )
      .run({
        name: data.name,
        cuitDni: data.cuitDni ?? '',
        docType: data.docType ?? 'DNI',
        condicionIva: data.condicionIva ?? 'CONSUMIDOR_FINAL',
        address: data.address ?? '',
        email: data.email ?? '',
        phone: data.phone ?? '',
        notes: data.notes ?? '',
      })
    return result.lastInsertRowid as number
  }

  update(id: number, data: UpdateCustomerInput): void {
    const fields: string[] = ["updated_at = datetime('now')"]
    const params: Record<string, unknown> = { id }

    if (data.name !== undefined) { fields.push('name = @name'); params.name = data.name }
    if (data.cuitDni !== undefined) { fields.push('cuit_dni = @cuitDni'); params.cuitDni = data.cuitDni }
    if (data.docType !== undefined) { fields.push('doc_type = @docType'); params.docType = data.docType }
    if (data.condicionIva !== undefined) { fields.push('condicion_iva = @condicionIva'); params.condicionIva = data.condicionIva }
    if (data.address !== undefined) { fields.push('address = @address'); params.address = data.address }
    if (data.email !== undefined) { fields.push('email = @email'); params.email = data.email }
    if (data.phone !== undefined) { fields.push('phone = @phone'); params.phone = data.phone }
    if (data.notes !== undefined) { fields.push('notes = @notes'); params.notes = data.notes }

    this.db.prepare(`UPDATE customers SET ${fields.join(', ')} WHERE id = @id`).run(params)
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM customers WHERE id = ?').run(id)
  }

  private mapRow(row: CustomerRow): Customer {
    return {
      id: row.id,
      name: row.name,
      cuitDni: row.cuit_dni,
      docType: row.doc_type as Customer['docType'],
      condicionIva: row.condicion_iva as Customer['condicionIva'],
      address: row.address,
      email: row.email,
      phone: row.phone,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
