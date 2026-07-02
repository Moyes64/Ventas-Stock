import https from 'https'
import fs from 'fs'
import type { RemitoScanResult, RemitoExtracted } from './types'

const SYSTEM_PROMPT = `Sos un asistente especializado en leer remitos y facturas de proveedores argentinos.
Extraé los datos del documento en la imagen y devolvé ÚNICAMENTE un JSON válido con esta estructura exacta:
{
  "numeroRemito": "string con el número de remito o factura (ej: 00006-00069138)",
  "fecha": "YYYY-MM-DD",
  "proveedor": "string con el nombre del proveedor",
  "items": [
    {
      "articulo": "código o referencia del artículo según el proveedor",
      "descripcion": "descripción del producto",
      "cantidad": número_entero,
      "codigoBarras": "código de barras si existe, o null"
    }
  ]
}
Reglas:
- Si no encontrás un campo, usá string vacío o null según corresponda.
- La cantidad SIEMPRE debe ser un número entero positivo.
- No incluyas texto fuera del JSON.
- Para la fecha usá formato YYYY-MM-DD; si no encontrás año completo usá el año actual.`

function postClaude(apiKey: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const bodyBuf = Buffer.from(body, 'utf-8')
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': bodyBuf.length,
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      },
      res => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data)
          } else {
            reject(new Error(`Claude API HTTP ${res.statusCode ?? '?'}: ${data.slice(0, 300)}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout al contactar Claude API')) })
    req.write(bodyBuf)
    req.end()
  })
}

export async function scanRemito(
  imagePath: string,
  apiKey: string
): Promise<RemitoScanResult> {
  if (!apiKey) {
    return { success: false, error: 'API key de Anthropic no configurada. Ingresala en Parámetros del Sistema.' }
  }

  let imageData: string
  let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

  try {
    const buf = fs.readFileSync(imagePath)
    imageData = buf.toString('base64')
    const ext = imagePath.toLowerCase().split('.').pop()
    if (ext === 'png') mediaType = 'image/png'
    else if (ext === 'webp') mediaType = 'image/webp'
    else if (ext === 'gif') mediaType = 'image/gif'
    else mediaType = 'image/jpeg'
  } catch (e) {
    return { success: false, error: `No se pudo leer la imagen: ${e instanceof Error ? e.message : String(e)}` }
  }

  const requestBody = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: imageData },
          },
          {
            type: 'text',
            text: 'Extraé los datos de este remito y devolvé el JSON.',
          },
        ],
      },
    ],
  })

  let raw: string
  try {
    raw = await postClaude(apiKey, requestBody)
  } catch (e) {
    return { success: false, error: `Error de red: ${e instanceof Error ? e.message : String(e)}` }
  }

  let parsed: { content?: Array<{ type: string; text?: string }> }
  try {
    parsed = JSON.parse(raw) as typeof parsed
  } catch {
    return { success: false, error: 'Respuesta inválida de Claude API' }
  }

  const textBlock = parsed.content?.find(b => b.type === 'text')?.text ?? ''

  // Extraer el JSON de la respuesta (puede venir envuelto en ```json ... ```)
  const jsonMatch = textBlock.match(/```json\s*([\s\S]*?)```/) ??
                    textBlock.match(/```\s*([\s\S]*?)```/) ??
                    textBlock.match(/(\{[\s\S]*\})/)

  const jsonStr = jsonMatch ? jsonMatch[1] ?? jsonMatch[0] : textBlock

  let data: RemitoExtracted
  try {
    data = JSON.parse(jsonStr.trim()) as RemitoExtracted
  } catch {
    return { success: false, error: `No se pudo parsear la respuesta de Claude:\n${textBlock.slice(0, 300)}` }
  }

  return { success: true, data }
}
