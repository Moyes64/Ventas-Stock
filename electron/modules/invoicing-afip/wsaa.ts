import { loadAfipConfig } from './config'
import type { TokenAuth } from './types'

/**
 * WSAA - Web Service de Autenticación y Autorización (AFIP)
 *
 * PRODUCTION IMPLEMENTATION STEPS:
 * =================================
 * 1. Read PEM certificate and private key from paths in AfipConfig
 *    ```
 *    const cert = fs.readFileSync(config.certPath, 'utf-8')
 *    const key  = fs.readFileSync(config.keyPath, 'utf-8')
 *    ```
 *
 * 2. Build the LoginTicketRequest XML:
 *    ```xml
 *    <?xml version="1.0" encoding="UTF-8"?>
 *    <loginTicketRequest version="1.0">
 *      <header>
 *        <uniqueId>{unix_timestamp}</uniqueId>
 *        <generationTime>{ISO_now - 10min}</generationTime>
 *        <expirationTime>{ISO_now + 10min}</expirationTime>
 *      </header>
 *      <service>wsfe</service>
 *    </loginTicketRequest>
 *    ```
 *
 * 3. Sign the XML with PKCS#7 (using node-forge or node-gyp openssl):
 *    ```ts
 *    import forge from 'node-forge'
 *    const p7 = forge.pkcs7.createSignedData()
 *    p7.content = forge.util.createBuffer(loginTicketRequestXml)
 *    p7.addCertificate(cert)
 *    p7.addSigner({ key, certificate: cert, digestAlgorithm: forge.pki.oids.sha256 })
 *    p7.sign({ detached: false })
 *    const cms = forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes())
 *    ```
 *
 * 4. POST the CMS to the WSAA endpoint (SOAP LoginCms):
 *    - Homologación: https://wsaahomo.afip.gov.ar/ws/services/LoginCms
 *    - Producción:   https://wsaa.afip.gov.ar/ws/services/LoginCms
 *
 *    SOAP body:
 *    ```xml
 *    <soapenv:Envelope xmlns:soapenv="..." xmlns:log="...">
 *      <soapenv:Body>
 *        <log:loginCms>
 *          <log:in0>{cms}</log:in0>
 *        </log:loginCms>
 *      </soapenv:Body>
 *    </soapenv:Envelope>
 *    ```
 *
 * 5. Parse the response XML to extract Token and Sign:
 *    ```xml
 *    <loginTicketResponse>
 *      <credentials>
 *        <token>...</token>
 *        <sign>...</sign>
 *      </credentials>
 *    </loginTicketResponse>
 *    ```
 *
 * 6. Cache the TA until expirationTime (default 12 hours).
 */

// In-memory TA cache
let cachedTA: TokenAuth | null = null

export async function getTicketAcceso(): Promise<TokenAuth> {
  const config = loadAfipConfig()

  // Return cached TA if still valid (with 5 min safety margin)
  if (cachedTA) {
    const expiresAt = new Date(cachedTA.expiresAt)
    const safetyMargin = 5 * 60 * 1000 // 5 minutes
    if (expiresAt.getTime() - Date.now() > safetyMargin) {
      return cachedTA
    }
  }

  if (config.ambiente === 'produccion') {
    // TODO: Implement real WSAA call for production
    // See implementation steps above
    throw new Error(
      'Implementación real de WSAA requerida para producción. ' +
      'Ver electron/modules/invoicing-afip/wsaa.ts para los pasos.'
    )
  }

  // ---------------------------------------------------------------
  // STUB: Return mock TA for homologación testing
  // Replace this with real WSAA call when ready
  // ---------------------------------------------------------------
  console.log('[WSAA] Using mock TA for homologación')

  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000) // 12 hours

  cachedTA = {
    token: 'MOCK_TOKEN_HOMOLOGACION',
    sign:  'MOCK_SIGN_HOMOLOGACION',
    expiresAt: expiresAt.toISOString(),
  }

  return cachedTA
}

/** Clears cached TA (useful after config changes or errors). */
export function clearCachedTA(): void {
  cachedTA = null
}
