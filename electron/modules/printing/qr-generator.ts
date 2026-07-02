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
 * Returns a base64-encoded PNG data URL (used by the HTML ticket).
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
 * Generates the AFIP QR code as an ESC/POS raster bitmap (GS v 0).
 * No PNG decoding needed — works directly from the QR module matrix.
 *
 * @param scale - pixels per QR module (default 4 → ~25 mm on 203 dpi printer)
 */
export function generateQrEscPos(payload: AfipQrPayload, scale = 4): Buffer {
  const jsonStr = JSON.stringify(payload)
  const b64 = Buffer.from(jsonStr).toString('base64')
  const url = `https://www.afip.gob.ar/fe/qr/?p=${b64}`

  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' })
  const size    = qr.modules.size
  const modules = qr.modules.data as Uint8Array

  const pixelSize   = size * scale
  const bytesPerRow = Math.ceil(pixelSize / 8)
  const bitmap      = Buffer.alloc(bytesPerRow * pixelSize, 0x00)

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!modules[row * size + col]) continue   // 0 = white, skip
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const pr = row * scale + dy
          const pc = col * scale + dx
          bitmap[pr * bytesPerRow + (pc >> 3)] |= 0x80 >> (pc & 7)
        }
      }
    }
  }

  // GS v 0: 1D 76 30 m xL xH yL yH <data>
  const xL = bytesPerRow & 0xFF
  const xH = (bytesPerRow >> 8) & 0xFF
  const yL = pixelSize & 0xFF
  const yH = (pixelSize >> 8) & 0xFF
  return Buffer.concat([
    Buffer.from([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH]),
    bitmap,
  ])
}

/**
 * Builds an ESC/POS raster bitmap from any plain text string.
 * Used for non-AFIP QR codes (e.g. ticket de cambio).
 */
export function generateQrEscPosFromText(text: string, scale = 4): Buffer {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const size    = qr.modules.size
  const modules = qr.modules.data as Uint8Array

  const pixelSize   = size * scale
  const bytesPerRow = Math.ceil(pixelSize / 8)
  const bitmap      = Buffer.alloc(bytesPerRow * pixelSize, 0x00)

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!modules[row * size + col]) continue
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const pr = row * scale + dy
          const pc = col * scale + dx
          bitmap[pr * bytesPerRow + (pc >> 3)] |= 0x80 >> (pc & 7)
        }
      }
    }
  }

  const xL = bytesPerRow & 0xFF
  const xH = (bytesPerRow >> 8) & 0xFF
  const yL = pixelSize & 0xFF
  const yH = (pixelSize >> 8) & 0xFF
  return Buffer.concat([
    Buffer.from([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH]),
    bitmap,
  ])
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
