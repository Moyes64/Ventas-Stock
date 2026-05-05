import type { Database } from 'better-sqlite3'
import type { Parameter, CreateParameterInput, UpdateParameterInput } from './types'

interface ParameterRow {
  id: number
  descripcion: string
  porcentaje: number
  tipo: string
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
        `INSERT INTO parameters (descripcion, porcentaje, tipo)
         VALUES (@descripcion, @porcentaje, @tipo)`
      )
      .run({ descripcion: data.descripcion, porcentaje: data.porcentaje, tipo: data.tipo })
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
    if (data.tipo !== undefined) {
      fields.push('tipo = @tipo')
      params.tipo = data.tipo
    }

    this.db.prepare(`UPDATE parameters SET ${fields.join(', ')} WHERE id = @id`).run(params)
  }

  delete(id: number): void {
    this.db.prepare('DELETE FROM parameters WHERE id = ?').run(id)
  }

  private mapRow(row: ParameterRow): Parameter {
    if (row.tipo !== '+' && row.tipo !== '-') {
      throw new Error(`Valor de tipo inválido en parámetro id=${row.id}: "${row.tipo}"`)
    }
    return {
      id: row.id,
      descripcion: row.descripcion,
      porcentaje: row.porcentaje,
      tipo: row.tipo,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
