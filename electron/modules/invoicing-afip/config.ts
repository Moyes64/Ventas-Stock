import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { AfipConfig } from './types'

/**
 * Loads AFIP configuration.
 *
 * Priority order for each value:
 *   1. Environment variable (set in .env for dev, or in main.ts for prod)
 *   2. system-params.json (userData) — filled by the user in Parámetros del Sistema
 *   3. Hard defaults
 */
export function loadAfipConfig(): AfipConfig {
  const userData = app.getPath('userData')

  // Read system-params.json as fallback source
  let sysParams: Record<string, string> = {}
  try {
    const sysPath = path.join(userData, 'system-params.json')
    if (fs.existsSync(sysPath)) {
      sysParams = JSON.parse(fs.readFileSync(sysPath, 'utf-8')) as Record<string, string>
    }
  } catch {
    // ignore
  }

  // CUIT: env var → system-params.json → throw
  const cuitRaw =
    process.env.AFIP_CUIT?.trim() ||
    process.env.VITE_EMPRESA_CUIT?.trim() ||
    sysParams['cuitCuil']?.trim() ||
    ''

  const cuit = parseInt(cuitRaw.replace(/[-\s]/g, ''), 10)
  if (isNaN(cuit) || cuit === 0) {
    throw new Error(
      'AFIP CUIT no configurado. Ingresá el CUIT/CUIL en Parámetros del Sistema antes de emitir comprobantes.'
    )
  }

  // Ambiente: env var → system-params.json → default homologacion
  const ambiente = (
    process.env.AFIP_AMBIENTE?.trim() ||
    sysParams['ambienteArca']?.trim() ||
    'homologacion'
  ) as AfipConfig['ambiente']

  // Certificados: env var → userData/certs/<ambiente>/
  const certsDir = path.join(userData, 'certs', ambiente)
  const certPath =
    process.env.AFIP_CERT_PATH?.trim() ||
    path.join(certsDir, 'cert.pem')

  const keyPath =
    process.env.AFIP_KEY_PATH?.trim() ||
    path.join(certsDir, 'key.pem')

  // Punto de venta: env var → system-params.json → 1
  const puntoVentaRaw =
    process.env.VITE_EMPRESA_PUNTO_VENTA?.trim() ||
    sysParams['puntoVenta']?.trim() ||
    '1'

  return {
    ambiente,
    cuit,
    certPath,
    keyPath,
    passphrase: process.env.AFIP_PASSPHRASE ?? '',
    puntoVenta: parseInt(puntoVentaRaw, 10) || 1,
  }
}

/**
 * Tries to load AFIP configuration.
 * Returns null if CUIT is missing or invalid, instead of throwing.
 */
export function tryLoadAfipConfig(): AfipConfig | null {
  try {
    return loadAfipConfig()
  } catch {
    return null
  }
}
