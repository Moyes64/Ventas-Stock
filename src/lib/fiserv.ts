import type { FiservPaymentMethod } from '../types/ipc'

/** Medios del posnet FISERV, en el orden en que se muestran en los desplegables. */
export const FISERV_METHODS: FiservPaymentMethod[] = [
  'fiserv_credito_3',
  'fiserv_credito_2',
  'fiserv_credito_1',
  'fiserv_debito',
  'fiserv_qr',
]

/** Etiqueta corta (sin el prefijo FISERV), para usar dentro de la hoja de Comisiones FISERV. */
export const FISERV_SHORT_LABELS: Record<FiservPaymentMethod, string> = {
  fiserv_credito_3: 'Crédito 3 cuotas',
  fiserv_credito_2: 'Crédito 2 cuotas',
  fiserv_credito_1: 'Crédito 1 pago',
  fiserv_debito: 'Débito',
  fiserv_qr: 'QR',
}

/** Etiqueta completa para desplegables, listados y resúmenes. */
export const FISERV_LABELS: Record<FiservPaymentMethod, string> = {
  fiserv_credito_3: '💳 FISERV Crédito 3 cuotas',
  fiserv_credito_2: '💳 FISERV Crédito 2 cuotas',
  fiserv_credito_1: '💳 FISERV Crédito 1 pago',
  fiserv_debito: '💳 FISERV Débito',
  fiserv_qr: '📱 FISERV QR',
}

/** Opciones { value, label } listas para un <select>. */
export const FISERV_OPTIONS: Array<{ value: FiservPaymentMethod; label: string }> =
  FISERV_METHODS.map(value => ({ value, label: FISERV_LABELS[value] }))
