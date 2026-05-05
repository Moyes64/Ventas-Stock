import { getTicketAcceso } from './wsaa'
import { loadAfipConfig } from './config'
import type { CAERequest, CAEResponse } from './types'

/**
 * WSFEv1 - Web Service de Facturación Electrónica versión 1 (AFIP)
 *
 * SOAP Endpoint URLs:
 * - Homologación: https://wswhomo.afip.gov.ar/wsfev1/service.asmx
 * - Producción:   https://servicios1.afip.gov.ar/wsfev1/service.asmx
 *
 * WSDL:
 * - Homologación: https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL
 * - Producción:   https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL
 *
 * FECAESolicitar - Request Structure (SOAP body):
 * ================================================
 * ```xml
 * <FECAESolicitar>
 *   <Auth>
 *     <Token>{TA.token}</Token>
 *     <Sign>{TA.sign}</Sign>
 *     <Cuit>{CUIT}</Cuit>
 *   </Auth>
 *   <FeCAEReq>
 *     <FeCabReq>
 *       <CantReg>1</CantReg>           <!-- Número de comprobantes en el lote -->
 *       <PtoVta>{punto_venta}</PtoVta>
 *       <CbteTipo>{tipo_cbte}</CbteTipo>  <!-- 11=FC, 1=FA, 6=FB -->
 *     </FeCabReq>
 *     <FeDetReq>
 *       <FECAEDetRequest>
 *         <Concepto>1</Concepto>          <!-- 1=Productos, 2=Servicios, 3=Ambos -->
 *         <DocTipo>99</DocTipo>           <!-- 80=CUIT, 96=DNI, 99=Sin identificar -->
 *         <DocNro>0</DocNro>
 *         <CbteDesde>{nro}</CbteDesde>
 *         <CbteHasta>{nro}</CbteHasta>
 *         <CbteFch>{AAAAMMDD}</CbteFch>
 *         <ImpTotal>{total}</ImpTotal>
 *         <ImpTotConc>0</ImpTotConc>     <!-- No gravado -->
 *         <ImpNeto>{base_imponible}</ImpNeto>
 *         <ImpOpEx>0</ImpOpEx>           <!-- Exento -->
 *         <ImpIVA>{total_iva}</ImpIVA>
 *         <ImpTrib>0</ImpTrib>           <!-- Otros tributos -->
 *         <MonId>PES</MonId>
 *         <MonCotiz>1</MonCotiz>
 *         <Iva>
 *           <AlicIva>
 *             <Id>5</Id>               <!-- 3=0%, 4=10.5%, 5=21%, 6=27% -->
 *             <BaseImp>{base}</BaseImp>
 *             <Importe>{iva}</Importe>
 *           </AlicIva>
 *         </Iva>
 *       </FECAEDetRequest>
 *     </FeDetReq>
 *   </FeCAEReq>
 * </FECAESolicitar>
 * ```
 *
 * Important notes for Monotributo (Factura C):
 * - CbteTipo = 11
 * - DocTipo = 99, DocNro = 0 for Consumidor Final (totals < $50,000 in 2024)
 * - DocTipo = 96/80 + DocNro when total >= threshold (verify current RG)
 * - No IVA breakdown required for Monotributo (ImpNeto = ImpTotal, ImpIVA = 0)
 *
 * PRODUCTION IMPLEMENTATION:
 * Use 'soap' npm package or manual axios SOAP calls.
 * ```ts
 * import axios from 'axios'
 * const soapBody = buildSoapEnvelope(auth, request)
 * const response = await axios.post(endpoint, soapBody, {
 *   headers: { 'Content-Type': 'text/xml; charset=utf-8', 'SOAPAction': 'FECAESolicitar' }
 * })
 * const result = parseXmlResponse(response.data)
 * ```
 */

const ENDPOINTS = {
  homologacion: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  produccion: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
}

export async function solicitarCAE(request: CAERequest): Promise<CAEResponse> {
  const config = loadAfipConfig()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _ta = await getTicketAcceso()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _endpoint = ENDPOINTS[config.ambiente]

  if (config.ambiente === 'produccion') {
    // TODO: Implement real FECAESolicitar SOAP call
    // See documentation above for request structure
    throw new Error(
      'Implementación real de WSFEv1 requerida para producción. ' +
      'Ver electron/modules/invoicing-afip/wsfev1.ts para la estructura SOAP.'
    )
  }

  // ---------------------------------------------------------------
  // STUB: Return mock CAE for homologación/testing
  // ---------------------------------------------------------------
  console.log('[WSFEv1] Mock FECAESolicitar for homologación', {
    tipoComprobante: request.tipoComprobante,
    puntoVenta: request.puntoVenta,
    facturas: request.facturas.length,
  })

  // Simulate a small network delay
  await new Promise(resolve => setTimeout(resolve, 300))

  const mockCAE = String(Math.floor(Math.random() * 90000000000000) + 10000000000000)
  const today = new Date()
  const caeVto = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000)
  const caeVtoStr = caeVto.toISOString().slice(0, 10).replace(/-/g, '')

  return {
    success: true,
    cae: mockCAE,
    caeVto: caeVtoStr,
    invoiceNumber: request.facturas[0]?.nroDesde ?? 1,
    puntoVenta: request.puntoVenta,
  }
}

/** Build the FECAESolicitar SOAP XML envelope (for production use). */
export function buildSoapEnvelope(
  token: string,
  sign: string,
  cuit: number,
  request: CAERequest
): string {
  const factura = request.facturas[0]
  const ivaItems = factura.iva
    ?.map(
      a => `<AlicIva><Id>${a.id}</Id><BaseImp>${a.baseImp.toFixed(2)}</BaseImp><Importe>${a.importe.toFixed(2)}</Importe></AlicIva>`
    )
    .join('')

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FECAESolicitar xmlns="http://ar.gov.afip.dif.FEV1/">
      <Auth>
        <Token>${token}</Token>
        <Sign>${sign}</Sign>
        <Cuit>${cuit}</Cuit>
      </Auth>
      <FeCAEReq>
        <FeCabReq>
          <CantReg>1</CantReg>
          <PtoVta>${request.puntoVenta}</PtoVta>
          <CbteTipo>${request.tipoComprobante}</CbteTipo>
        </FeCabReq>
        <FeDetReq>
          <FECAEDetRequest>
            <Concepto>${factura.concepto}</Concepto>
            <DocTipo>${factura.docTipo}</DocTipo>
            <DocNro>${factura.docNro}</DocNro>
            <CbteDesde>${factura.nroDesde}</CbteDesde>
            <CbteHasta>${factura.nroHasta}</CbteHasta>
            <CbteFch>${new Date().toISOString().slice(0, 10).replace(/-/g, '')}</CbteFch>
            <ImpTotal>${factura.importeTotal.toFixed(2)}</ImpTotal>
            <ImpTotConc>${factura.importeNoGravado.toFixed(2)}</ImpTotConc>
            <ImpNeto>${(factura.importeTotal - factura.importeIVA).toFixed(2)}</ImpNeto>
            <ImpOpEx>${factura.importeExento.toFixed(2)}</ImpOpEx>
            <ImpIVA>${factura.importeIVA.toFixed(2)}</ImpIVA>
            <ImpTrib>${factura.importeTributos.toFixed(2)}</ImpTrib>
            <MonId>${factura.moneda}</MonId>
            <MonCotiz>${factura.monedaCtz}</MonCotiz>
            ${ivaItems ? `<Iva>${ivaItems}</Iva>` : ''}
          </FECAEDetRequest>
        </FeDetReq>
      </FeCAEReq>
    </FECAESolicitar>
  </soap:Body>
</soap:Envelope>`
}
