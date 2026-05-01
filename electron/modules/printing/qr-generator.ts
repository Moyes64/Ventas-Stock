import QRCode from 'qrcode'

/**
 * AFIP QR URL format (RG 4291/2018):
 * https://www.afip.gob.ar/fe/qr/?p=BASE64_ENCODED_JSON
 *
 * JSON payload structure:
 * {
 *   ver: 1,
 *   fecha: "2024-01-15",          // YYYY-MM-DD
 *   cuit: 20123456789,            // CUIT del emisor (number, no guiones)
 *   ptoVta: 1,                    // Punto de venta
 *   tipoCmp: 11,                  // Tipo de comprobante: 11=FC, 1=FA, 6=FB
 *   nroCmp: 1,                    // Número de comprobante
 *   importe: 100.00,              // Importe total
 *   moneda: "PES",                // Moneda
 *   ctz: 1,                       // Cotización
 *   tipoDocRec: 96,               // Tipo doc receptor: 96=DNI, 80=CUIT, 99=Sin identificar
 *   nroDocRec: 0,                 // Número doc receptor (0 para Consumidor Final)
 *   tipoCodAut: "E",              // "E" = CAE, "A" = CAEA
 *   codAut: 12345678901234        // CAE (number)
 * }
 */

export interface AfipQrPayload {
  ver: 1
  fecha: string
  cuit: number
  ptoVta: number
  tipoCmp: number
  nroCmp: number
  importe: number
  moneda: string
  ctz: number
  tipoDocRec: number
  nroDocRec: number
  tipoCodAut: 'E' | 'A'
  codAut: number
}

/**
 * Generates the AFIP-compliant QR code for an authorized invoice.
 * Returns a base64-encoded PNG data URL.
 */
export async function generateAfipQR(payload: AfipQrPayload): Promise<string> {
  const jsonStr = JSON.stringify(payload)
  const b64 = Buffer.from(jsonStr).toString('base64')
  const url = `https://www.afip.gob.ar/fe/qr/?p=${b64}`

  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 200,
  })

  return dataUrl
}

/**
 * Builds the AfipQrPayload from invoice data.
 */
export function buildAfipQrPayload(params: {
  fecha: string
  cuit: number
  puntoVenta: number
  tipoComprobante: number
  nroComprobante: number
  importe: number
  tipoDocReceptor: number
  nroDocReceptor: number
  cae: string
}): AfipQrPayload {
  return {
    ver: 1,
    fecha: params.fecha,
    cuit: params.cuit,
    ptoVta: params.puntoVenta,
    tipoCmp: params.tipoComprobante,
    nroCmp: params.nroComprobante,
    importe: params.importe,
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: params.tipoDocReceptor,
    nroDocRec: params.nroDocReceptor,
    tipoCodAut: 'E',
    codAut: parseInt(params.cae, 10),
  }
}
