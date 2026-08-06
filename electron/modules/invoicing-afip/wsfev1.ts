import https from 'https'
import { extractTag, extractAllTags } from './xml-utils'
import { getTicketAcceso, clearCachedTA } from './wsaa'
import { loadAfipConfig } from './config'
import { localToday } from '../../lib/date'
import type { CAERequest, CAEResponse } from './types'

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------
const ENDPOINTS = {
  homologacion: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  produccion:   'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
}

// ---------------------------------------------------------------------------
// HTTP helper — Node built-in https only
// ---------------------------------------------------------------------------

function httpPost(url: string, body: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body, 'utf8') },
        timeout: 60_000,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      }
    )
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout conectando a ${url}`)) })
    req.write(body, 'utf8')
    req.end()
  })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Consulta el último comprobante autorizado en AFIP para un punto de venta
 * y tipo de comprobante. Devuelve el número, o 0 si no hay ninguno aún.
 */
export async function getUltimoComprobante(
  puntoVenta: number,
  tipoComprobante: number
): Promise<number> {
  const config = loadAfipConfig()
  const ta = await getTicketAcceso()
  const endpoint = ENDPOINTS[config.ambiente]

  const soap = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
    '  <soap:Body>',
    '    <FECompUltimoAutorizado xmlns="http://ar.gov.afip.dif.FEV1/">',
    '      <Auth>',
    `        <Token>${ta.token}</Token>`,
    `        <Sign>${ta.sign}</Sign>`,
    `        <Cuit>${config.cuit}</Cuit>`,
    '      </Auth>',
    `      <PtoVta>${puntoVenta}</PtoVta>`,
    `      <CbteTipo>${tipoComprobante}</CbteTipo>`,
    '    </FECompUltimoAutorizado>',
    '  </soap:Body>',
    '</soap:Envelope>',
  ].join('\n')

  const rawXml = await httpPost(endpoint, soap, {
    'Content-Type': 'text/xml; charset=utf-8',
    SOAPAction: 'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado',
  })

  // Extraer CbteNro del resultado
  const cbteNro = extractTag(rawXml, 'CbteNro')
  const nro = cbteNro ? parseInt(cbteNro, 10) : 0
  console.log(`[WSFEv1] FECompUltimoAutorizado PtoVta=${puntoVenta} Tipo=${tipoComprobante} → ${nro}`)
  return isNaN(nro) ? 0 : nro
}

export async function solicitarCAE(request: CAERequest): Promise<CAEResponse> {
  const config = loadAfipConfig()
  const endpoint = ENDPOINTS[config.ambiente]

  let ta = await getTicketAcceso()

  console.log('[WSFEv1] FECAESolicitar →', config.ambiente, {
    tipoComprobante: request.tipoComprobante,
    puntoVenta: request.puntoVenta,
    cantFacturas: request.facturas.length,
  })

  let rawXml: string
  try {
    const soap = buildSoapEnvelope(ta.token, ta.sign, config.cuit, request)
    rawXml = await httpPost(endpoint, soap, {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: 'http://ar.gov.afip.dif.FEV1/FECAESolicitar',
    })
  } catch (err) {
    // Retry once with fresh TA
    console.warn('[WSFEv1] Error en primera llamada, reintentando con TA nuevo...')
    clearCachedTA()
    ta = await getTicketAcceso()
    const soap = buildSoapEnvelope(ta.token, ta.sign, config.cuit, request)
    rawXml = await httpPost(endpoint, soap, {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: 'http://ar.gov.afip.dif.FEV1/FECAESolicitar',
    })
  }

  return parseCAEResponse(rawXml)
}

// ---------------------------------------------------------------------------
// XML Builder
// ---------------------------------------------------------------------------

export function buildSoapEnvelope(
  token: string,
  sign: string,
  cuit: number,
  request: CAERequest
): string {
  const factura = request.facturas[0]
  if (!factura) throw new Error('La solicitud debe contener al menos una factura')

  const fechaCbte = factura.fechaCbte ?? localToday().replace(/-/g, '')  // YYYYMMDD en hora local ART

  // RG 5616: CondicionIVAReceptorId obligatorio
  const condicionIvaReceptorId =
    factura.condicionIvaReceptorId ??
    (factura.docTipo === 80 ? 1 : 5)

  // Factura C (tipo 11) y Nota de Crédito/Débito C (tipos 12, 13):
  //   - ImpIVA debe ser 0
  //   - ImpNeto = ImpTotal (el precio ya incluye IVA implícito, AFIP no lo discrimina)
  //   - El bloque <Iva> NO debe enviarse
  // Factura A/B (tipos 1, 2, 6, 7, 51, 52, 56, 57):
  //   - ImpNeto = base imponible (sin IVA)
  //   - ImpIVA = total IVA discriminado
  //   - El bloque <Iva> sí se envía
  const tiposCbteC = [11, 12, 13, 51, 52, 53]
  const esFacturaC = tiposCbteC.includes(request.tipoComprobante)

  let impNeto: number
  let impIva: number
  let ivaBlock: string

  if (esFacturaC) {
    // Monotributo: precio final = neto, IVA = 0, sin bloque Iva
    impNeto = factura.importeTotal
    impIva = 0
    ivaBlock = ''
  } else {
    // Responsable Inscripto: discriminar IVA
    impNeto = factura.importeTotal - factura.importeIVA
    impIva = factura.importeIVA
    ivaBlock = factura.iva && factura.iva.length > 0
      ? '<Iva>' +
        factura.iva.map(a =>
          `<AlicIva><Id>${a.id}</Id><BaseImp>${a.baseImp.toFixed(2)}</BaseImp><Importe>${a.importe.toFixed(2)}</Importe></AlicIva>`
        ).join('') +
        '</Iva>'
      : ''
  }

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">',
    '  <soap:Body>',
    '    <FECAESolicitar xmlns="http://ar.gov.afip.dif.FEV1/">',
    '      <Auth>',
    `        <Token>${token}</Token>`,
    `        <Sign>${sign}</Sign>`,
    `        <Cuit>${cuit}</Cuit>`,
    '      </Auth>',
    '      <FeCAEReq>',
    '        <FeCabReq>',
    '          <CantReg>1</CantReg>',
    `          <PtoVta>${request.puntoVenta}</PtoVta>`,
    `          <CbteTipo>${request.tipoComprobante}</CbteTipo>`,
    '        </FeCabReq>',
    '        <FeDetReq>',
    '          <FECAEDetRequest>',
    `            <Concepto>${factura.concepto}</Concepto>`,
    `            <DocTipo>${factura.docTipo}</DocTipo>`,
    `            <DocNro>${factura.docNro}</DocNro>`,
    `            <CbteDesde>${factura.nroDesde}</CbteDesde>`,
    `            <CbteHasta>${factura.nroHasta}</CbteHasta>`,
    `            <CbteFch>${fechaCbte}</CbteFch>`,
    `            <ImpTotal>${factura.importeTotal.toFixed(2)}</ImpTotal>`,
    `            <ImpTotConc>0.00</ImpTotConc>`,
    `            <ImpNeto>${impNeto.toFixed(2)}</ImpNeto>`,
    `            <ImpOpEx>0.00</ImpOpEx>`,
    `            <ImpIVA>${impIva.toFixed(2)}</ImpIVA>`,
    `            <ImpTrib>0.00</ImpTrib>`,
    `            <MonId>${factura.moneda}</MonId>`,
    `            <MonCotiz>${factura.monedaCtz}</MonCotiz>`,
    `            <CondicionIVAReceptorId>${condicionIvaReceptorId}</CondicionIVAReceptorId>`,
    ivaBlock,
    '          </FECAEDetRequest>',
    '        </FeDetReq>',
    '      </FeCAEReq>',
    '    </FECAESolicitar>',
    '  </soap:Body>',
    '</soap:Envelope>',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Response Parser — no xml2js, pure string extraction
// ---------------------------------------------------------------------------

function parseCAEResponse(rawXml: string): CAEResponse {
  console.log('[WSFEv1] Raw response:', rawXml.slice(0, 800))

  // Check for SOAP fault
  const fault = extractTag(rawXml, 'faultstring')
  if (fault) {
    return { success: false, error: `SOAP Fault: ${fault}` }
  }

  // Check for AFIP-level errors
  const errMsg = extractTag(rawXml, 'Msg')
  const errResult = extractTag(rawXml, 'Resultado')

  // Top-level error block (outside FeDetResp)
  const errorsBlock = rawXml.match(/<Errors>([\s\S]*?)<\/Errors>/i)
  if (errorsBlock) {
    const msgs = extractAllTags(errorsBlock[1], 'Msg')
    if (msgs.length > 0) {
      return { success: false, error: `AFIP Error: ${msgs.join('; ')}` }
    }
  }

  // Main result
  const resultado = errResult ?? extractTag(rawXml, 'Resultado')
  const cae = extractTag(rawXml, 'CAE')
  const caeVto = extractTag(rawXml, 'CAEFchVto')
  const cbteDesde = extractTag(rawXml, 'CbteDesde')

  // Observations
  const obsBlock = rawXml.match(/<Observaciones>([\s\S]*?)<\/Observaciones>/i)
  const observations: string[] = obsBlock ? extractAllTags(obsBlock[1], 'Msg') : []

  if (resultado === 'A' && cae) {
    console.log('[WSFEv1] CAE obtenido:', cae, 'vto:', caeVto)
    return {
      success: true,
      cae,
      caeVto,
      invoiceNumber: cbteDesde ? parseInt(cbteDesde, 10) : undefined,
      observations: observations.length > 0 ? observations : undefined,
    }
  }

  const obsText = observations.length > 0 ? ` Obs: ${observations.join('; ')}` : ''
  const fallbackMsg = errMsg ?? 'Comprobante rechazado por AFIP'
  console.warn('[WSFEv1] Sin CAE.', fallbackMsg, obsText)
  return {
    success: false,
    error: `${fallbackMsg}.${obsText}`,
    observations,
  }
}
