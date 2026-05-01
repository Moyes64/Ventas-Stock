export interface Supplier {
  id: number
  name: string
  cuit: string
  address: string
  email: string
  phone: string
  contact: string
  notes: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateSupplierInput {
  name: string
  cuit?: string
  address?: string
  email?: string
  phone?: string
  contact?: string
  notes?: string
}

export type UpdateSupplierInput = Partial<CreateSupplierInput & { active: boolean }>
