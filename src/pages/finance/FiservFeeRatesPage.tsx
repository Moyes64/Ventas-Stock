import { FISERV_METHODS, FISERV_SHORT_LABELS } from '../../lib/fiserv'
import FeeRatesPanel from './FeeRatesPanel'

export default function FiservFeeRatesPage() {
  return (
    <FeeRatesPanel
      title="🟢 Comisiones FISERV"
      subtitle={
        <>
          Arancel (% + IVA) que FISERV descuenta en cada modalidad — se registra automáticamente como
          gasto "Comisión FISERV" en cada venta, usando la tasa vigente el día de la venta. El cobro se
          registra en <strong>Mercado Pago - Anabella</strong> como pendiente de acreditación hasta el
          día hábil siguiente (cuando se transfiere desde FISERV); no hace falta cargar esa
          transferencia en Movimientos.
        </>
      }
      methods={FISERV_METHODS}
      labels={FISERV_SHORT_LABELS}
    />
  )
}
