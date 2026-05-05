import type { Database } from 'better-sqlite3'
import type { Parameter, CreateParameterInput, UpdateParameterInput } from './types'

interface ParameterRow {
  id: number
  descripcion: string
  porcentaje: number
  created_at: string
  updated_at: string
}

export class ParameterRepository {
  constructor(private readonly db: Database) {}

  findById(id: number): Parameter | undefined {
    const row = this.db
      .prepare('SELECT * FROM parameters WHERE id = ?')
      .get(id) as ParameterRow | undefined
    return row ? this.mapRow(row) : undefined
  }

  list(): Parameter[] {
    return (
      this.db.prepare('SELECT * FROM parameters ORDER BY id ASC').all() as ParameterRow[]
    ).map(r => this.mapRow(r))
  }

  create(data: CreateParameterInput): number {
    const result = this.db
      .prepare(
        `INSERT INTO parameters (descripcion, porcentaje)
         VALUES (@descripcion, @porcentaje)`
      )
      .run({ descripcion: data.descripcion, porcentaje: data.porcentaje })
    return result.lastInsertRowid as number
  }

  update(id: number, data: UpdateParameterInput): void {
    const fields: string[] = ["updated_at = datetime('now')"]
    const params: Record<string, unknown> = { id }

    if (data.descripcion !== undefined) {
      fields.push('descripcion = @descripcion')
      params.descripcion = data.descripcion
    }
    if (data.porcentaje !== undefined) {
      fields.push('porcentaje = @porcentaje')
      params.porcentaje = data.porcentaje
    }

    this.db.prepare(`UPDATE parameters SET ${fields.join(', ')} WHERE id = @id`).run(params)
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM parameters WHERE id = ?').run(id)
  }

  private mapRow(row: ParameterRow): Parameter {
    return {
      id: row.id,
      descripcion: row.descripcion,
      porcentaje: row.porcentaje,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
