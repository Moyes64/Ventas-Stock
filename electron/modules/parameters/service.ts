import type { Database } from 'better-sqlite3'
import { ParameterRepository } from './repository'
import type { Parameter, CreateParameterInput, UpdateParameterInput } from './types'

export class ParameterService {
  private readonly repo: ParameterRepository

  constructor(db: Database) {
    this.repo = new ParameterRepository(db)
  }

  list(): Parameter[] {
    return this.repo.list()
  }

  getById(id: number): Parameter | undefined {
    return this.repo.findById(id)
  }

  create(data: CreateParameterInput): Parameter {
    if (!data.descripcion.trim()) throw new Error('La descripción es obligatoria')
    if (typeof data.porcentaje !== 'number') throw new Error('El porcentaje debe ser un número')
    const id = this.repo.create(data)
    const created = this.repo.findById(id)
    if (!created) throw new Error('Error al recuperar el parámetro creado')
    return created
  }

  update(id: number, data: UpdateParameterInput): Parameter {
    const existing = this.repo.findById(id)
    if (!existing) throw new Error(`Parámetro no encontrado: ${id}`)
    if (data.descripcion !== undefined && !data.descripcion.trim()) {
      throw new Error('La descripción es obligatoria')
    }
    this.repo.update(id, data)
    const updated = this.repo.findById(id)
    if (!updated) throw new Error(`Parámetro no encontrado: ${id}`)
    return updated
  }

  delete(id: number): void {
    const existing = this.repo.findById(id)
    if (!existing) throw new Error(`Parámetro no encontrado: ${id}`)
    this.repo.delete(id)
  }
}
