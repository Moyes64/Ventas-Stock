export type DocType = 'CUIT' | 'DNI' | 'CUIL' | 'PASAPORTE' | 'SIN_IDENTIFICAR'
export type CondicionIVA =
  | 'RESPONSABLE_INSCRIPTO'
  | 'MONOTRIBUTISTA'
  | 'EXENTO'
  | 'CONSUMIDOR_FINAL'

/** AFIP doc type codes for FECAESolicitar */
export const DOC_TYPE_AFIP_CODE: Record<DocType, number> = {
  CUIT: 80,
  DNI: 96,
  CUIL: 86,
  PASAPORTE: 94,
  SIN_IDENTIFICAR: 99,
}

export interface Customer {
  id: number
  name: string
  cuitDni: string
  docType: DocType
  condicionIva: CondicionIVA
  address: string
  email: string
  phone: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface CreateCustomerInput {
  name: string
  cuitDni?: string
  docType?: DocType
  condicionIva?: CondicionIVA
  address?: string
  email?: string
  phone?: string
  notes?: string
}

export type UpdateCustomerInput = Partial<CreateCustomerInput>
