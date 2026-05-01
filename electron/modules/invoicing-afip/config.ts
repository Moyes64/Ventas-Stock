import type { AfipConfig } from './types'

/**
 * Loads AFIP configuration from environment variables.
 * Throws if required variables are missing.
 */
export function loadAfipConfig(): AfipConfig {
  const ambiente = (process.env.AFIP_AMBIENTE ?? 'homologacion') as AfipConfig['ambiente']
  const cuitStr = process.env.AFIP_CUIT ?? process.env.VITE_EMPRESA_CUIT ?? ''
  const puntoVentaStr = process.env.VITE_EMPRESA_PUNTO_VENTA ?? '1'

  const cuit = parseInt(cuitStr, 10)
  if (isNaN(cuit)) {
    throw new Error('AFIP_CUIT no está configurado o no es un número válido')
  }

  return {
    ambiente,
    cuit,
    certPath: process.env.AFIP_CERT_PATH ?? './certs/cert.pem',
    keyPath: process.env.AFIP_KEY_PATH ?? './certs/key.pem',
    passphrase: process.env.AFIP_PASSPHRASE ?? '',
    puntoVenta: parseInt(puntoVentaStr, 10) || 1,
  }
}
