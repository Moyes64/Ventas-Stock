import type { Database } from 'better-sqlite3'
import type { Supplier, CreateSupplierInput, UpdateSupplierInput } from './types'

interface SupplierRow {
  id: number
  name: string
  cuit: string
  address: string
  email: string
  phone: string
  contact: string
  notes: string
  active: number
  created_at: string
  updated_at: string
}

export class SupplierRepository {
  constructor(private readonly db: Database) {}

  findById(id: number): Supplier | undefined {
    const row = this.db
      .prepare('SELECT * FROM suppliers WHERE id = ?')
      .get(id) as SupplierRow | undefined
    return row ? this.mapRow(row) : undefined
  }

  search(query: string): Supplier[] {
    const like = `%${query}%`
    const rows = this.db
      .prepare(
        `SELECT * FROM suppliers
         WHERE name LIKE ? OR cuit LIKE ? OR email LIKE ?
         ORDER BY name ASC LIMIT 50`
      )
      .all(like, like, like) as SupplierRow[]
    return rows.map(r => this.mapRow(r))
  }

  list(activeOnly = true): Supplier[] {
    const activeClause = activeOnly ? 'WHERE active = 1' : ''
    const rows = this.db
      .prepare(`SELECT * FROM suppliers ${activeClause} ORDER BY name ASC`)
      .all() as SupplierRow[]
    return rows.map(r => this.mapRow(r))
  }

  create(data: CreateSupplierInput): number {
    const result = this.db
      .prepare(
        `INSERT INTO suppliers (name, cuit, address, email, phone, contact, notes)
         VALUES (@name, @cuit, @address, @email, @phone, @contact, @notes)`
      )
      .run({
        name: data.name,
        cuit: data.cuit ?? '',
        address: data.address ?? '',
        email: data.email ?? '',
        phone: data.phone ?? '',
        contact: data.contact ?? '',
        notes: data.notes ?? '',
      })
    return result.lastInsertRowid as number
  }

  update(id: number, data: UpdateSupplierInput): void {
    const fields: string[] = ["updated_at = datetime('now')"]
    const params: Record<string, unknown> = { id }

    if (data.name !== undefined) { fields.push('name = @name'); params.name = data.name }
    if (data.cuit !== undefined) { fields.push('cuit = @cuit'); params.cuit = data.cuit }
    if (data.address !== undefined) { fields.push('address = @address'); params.address = data.address }
    if (data.email !== undefined) { fields.push('email = @email'); params.email = data.email }
    if (data.phone !== undefined) { fields.push('phone = @phone'); params.phone = data.phone }
    if (data.contact !== undefined) { fields.push('contact = @contact'); params.contact = data.contact }
    if (data.notes !== undefined) { fields.push('notes = @notes'); params.notes = data.notes }
    if (data.active !== undefined) { fields.push('active = @active'); params.active = data.active ? 1 : 0 }

    this.db.prepare(`UPDATE suppliers SET ${fields.join(', ')} WHERE id = @id`).run(params)
  }

  delete(id: number): void {
    this.db.prepare('UPDATE suppliers SET active = 0 WHERE id = ?').run(id)
  }

  private mapRow(row: SupplierRow): Supplier {
    return {
      id: row.id,
      name: row.name,
      cuit: row.cuit,
      address: row.address,
      email: row.email,
      phone: row.phone,
      contact: row.contact,
      notes: row.notes,
      active: row.active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
