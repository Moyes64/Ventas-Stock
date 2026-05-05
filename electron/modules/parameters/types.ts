export interface Parameter {
  id: number
  descripcion: string
  porcentaje: number
  tipo: '+' | '-'
  createdAt: string
  updatedAt: string
}

export interface CreateParameterInput {
  descripcion: string
  porcentaje: number
  tipo: '+' | '-'
}

export type UpdateParameterInput = Partial<CreateParameterInput>
