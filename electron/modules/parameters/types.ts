export interface Parameter {
  id: number
  descripcion: string
  porcentaje: number
  createdAt: string
  updatedAt: string
}

export interface CreateParameterInput {
  descripcion: string
  porcentaje: number
}

export type UpdateParameterInput = Partial<CreateParameterInput>
