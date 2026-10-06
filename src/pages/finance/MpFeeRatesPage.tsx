import type { MpFeePaymentMethod } from '../../types/ipc'
import FeeRatesPanel from './FeeRatesPanel'

const METHOD_LABELS: Record<MpFeePaymentMethod, string> = {
  qr: '📱 QR',
  debito: '💳 Débito',
  credito: '💳 Crédito',
  mercadopago: '🛒 Mercado Pago (Web)',
}

const METHODS: MpFeePaymentMethod[] = ['qr', 'debito', 'credito', 'mercadopago']

export default function MpFeeRatesPage() {
  return (
    <FeeRatesPanel
      title="💳 Comisiones de Mercado Pago"
      subtitle={
        <>
          Configurá el % que Mercado Pago cobra por el uso del posnet (QR y tarjeta) y por la tienda
          online (Checkout Pro) — se descuenta automáticamente como un gasto en cada venta, usando la
          tasa vigente el día de la venta. Transferencia no tiene comisión y no aparece acá.
        </>
      }
      methods={METHODS}
      labels={METHOD_LABELS}
      defaultIvaPct={{ mercadopago: '0' }}
    />
  )
}
