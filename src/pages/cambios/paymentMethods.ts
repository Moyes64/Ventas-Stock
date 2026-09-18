/** Medios de pago para saldar una diferencia a favor del comercio en un cambio/devolución. */
export const MONEY_METHODS: Array<{ value: string; label: string }> = [
  { value: 'contado_efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'qr', label: 'QR' },
  { value: 'mercadopago', label: 'Mercado Pago' },
]
