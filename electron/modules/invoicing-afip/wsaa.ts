import fs from 'fs'
import https from 'https'
import forge from 'node-forge'
import { extractTag } from './xml-utils'
import { loadAfipConfig } from './config'
import type { TokenAuth } from './types'

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------
const WSAA_ENDPOINTS = {
  homologacion: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
  produccion:   'https://wsaa.afip.gov.ar/ws/services/LoginCms',
}

// ---------------------------------------------------------------------------
// In-memory TA cache
// ---------------------------------------------------------------------------
let cachedTA: TokenAuth | null = null

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getTicketAcceso(): Promise<TokenAuth> {
  if (cachedTA) {
    const expiresAt = new Date(cachedTA.expiresAt)
    const safetyMargin = 5 * 60 * 1000
    if (expiresAt.getTime() - Date.now() > safetyMargin) {
      console.log('[WSAA] Using cached TA, expires:', cachedTA.expiresAt)
      return cachedTA
    }
  }

  console.log('[WSAA] Requesting new Ticket de Acceso...')
  cachedTA = await requestNewTA()
  console.log('[WSAA] TA obtained, expires:', cachedTA.expiresAt)
  return cachedTA
}

export function clearCachedTA(): void {
  cachedTA = null
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
        timeout: 30_000,
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
// Implementation
// ---------------------------------------------------------------------------

async function requestNewTA(): Promise<TokenAuth> {
  const config = loadAfipConfig()

  // 1. Read certificate and key
  let certPem: string
  let keyPem: string
  try {
    certPem = fs.readFileSync(config.certPath, 'utf-8')
  } catch (err) {
    throw new Error(
      `No se pudo leer el certificado AFIP desde "${config.certPath}". ` +
      `Error: ${err instanceof Error ? err.message : String(err)}`
    )
  }
  try {
    keyPem = fs.readFileSync(config.keyPath, 'utf-8')
  } catch (err) {
    throw new Error(
      `No se pudo leer la clave privada AFIP desde "${config.keyPath}". ` +
      `Error: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  // 2. Build LoginTicketRequest XML
  const now = new Date()
  const genTime = new Date(now.getTime() - 10 * 60 * 1000)
  const expTime = new Date(now.getTime() + 10 * 60 * 1000)
  const uniqueId = Math.floor(now.getTime() / 1000)

  // AFIP requires ISO 8601 with Argentina timezone offset (-03:00)
  // toISOString() returns UTC — we need to format with -03:00 explicitly
  const toAfipDate = (d: Date): string => {
    // Shift to ART (UTC-3)
    const art = new Date(d.getTime() - 3 * 60 * 60 * 1000)
    return art.toISOString().slice(0, 19) + '-03:00'
  }

  const ltrXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<loginTicketRequest version="1.0">',
    '  <header>',
    `    <uniqueId>${uniqueId}</uniqueId>`,
    `    <generationTime>${toAfipDate(genTime)}</generationTime>`,
    `    <expirationTime>${toAfipDate(expTime)}</expirationTime>`,
    '  </header>',
    '  <service>wsfe</service>',
    '</loginTicketRequest>',
  ].join('\n')

  // 3. Sign with PKCS#7 using node-forge
  let cms: string
  try {
    const cert = forge.pki.certificateFromPem(certPem)
    const key = config.passphrase
      ? forge.pki.decryptRsaPrivateKey(keyPem, config.passphrase)
      : forge.pki.privateKeyFromPem(keyPem)

    if (!key) throw new Error('No se pudo parsear la clave privada.')

    const p7 = forge.pkcs7.createSignedData()
    p7.content = forge.util.createBuffer(ltrXml, 'utf8')
    p7.addCertificate(cert)
    p7.addSigner({
      key,
      certificate: cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [],
    })
    p7.sign({ detached: false })

    cms = forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes())
  } catch (err) {
    throw new Error(
      `Error al firmar el LoginTicketRequest: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  // 4. POST SOAP to WSAA
  const endpoint = WSAA_ENDPOINTS[config.ambiente]
  const soapBody = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<soapenv:Envelope',
    '  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"',
    '  xmlns:log="http://wsaa.view.sua.dvadac.desein.afip.gov">',
    '  <soapenv:Header/>',
    '  <soapenv:Body>',
    '    <log:loginCms>',
    `      <log:in0>${cms}</log:in0>`,
    '    </log:loginCms>',
    '  </soapenv:Body>',
    '</soapenv:Envelope>',
  ].join('\n')

  let rawXml: string
  try {
    rawXml = await httpPost(endpoint, soapBody, {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '',
    })
  } catch (err) {
    throw new Error(
      `Error al conectar con WSAA (${config.ambiente}): ${err instanceof Error ? err.message : String(err)}`
    )
  }

  // 5. Parse response — extract loginCmsReturn, then parse inner XML
  const loginReturn = extractTag(rawXml, 'loginCmsReturn')
  if (!loginReturn) {
    // Check for SOAP fault
    const fault = extractTag(rawXml, 'faultstring')
    throw new Error(
      fault
        ? `WSAA SOAP Fault: ${fault}`
        : `Respuesta WSAA inesperada. XML: ${rawXml.slice(0, 600)}`
    )
  }

  // Decode HTML entities that AFIP sometimes encodes in the return value
  const innerXml = loginReturn
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

  const token = extractTag(innerXml, 'token')
  const sign = extractTag(innerXml, 'sign')
  const expiresAt = extractTag(innerXml, 'expirationTime')

  if (!token || !sign) {
    throw new Error(
      `Token o Sign ausentes en la respuesta del WSAA. Inner XML: ${innerXml.slice(0, 400)}`
    )
  }

  return { token, sign, expiresAt: expiresAt ?? new Date(Date.now() + 12 * 3600_000).toISOString() }
}
