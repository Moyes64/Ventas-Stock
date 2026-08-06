import { ipcMain, app } from 'electron'
import fs from 'fs'
import path from 'path'
import forge from 'node-forge'

export interface CsrInput {
  cuit: string
  denominacion: string
  localidad: string
  provincia: string
  ambiente: 'homologacion' | 'produccion'
}

export interface CsrResult {
  success: boolean
  csrPath?: string
  keyPath?: string
  csrPem?: string
  error?: string
}

export interface ImportCertResult {
  success: boolean
  certPath?: string
  error?: string
}

function certsSubdir(ambiente: 'homologacion' | 'produccion'): string {
  return path.join(app.getPath('userData'), 'certs', ambiente)
}

export function registerCsrHandlers(): void {
  ipcMain.handle('csr:importCert', async (_e, ambiente: 'homologacion' | 'produccion'): Promise<ImportCertResult> => {
    try {
      const { dialog } = await import('electron')
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: `Seleccionar certificado ARCA (${ambiente})`,
        filters: [{ name: 'Certificados', extensions: ['crt', 'pem', 'cer'] }],
        properties: ['openFile'],
      })
      if (canceled || filePaths.length === 0) return { success: false, error: 'Cancelado.' }

      const raw = fs.readFileSync(filePaths[0])
      let pemData: string

      const asText = raw.toString('utf-8')
      if (asText.includes('-----BEGIN CERTIFICATE-----')) {
        pemData = asText
      } else {
        // DER → PEM
        const b64 = raw.toString('base64').match(/.{1,64}/g)!.join('\n')
        pemData = `-----BEGIN CERTIFICATE-----\n${b64}\n-----END CERTIFICATE-----\n`
      }

      // Validar antes de guardar
      forge.pki.certificateFromPem(pemData)

      const dir = certsSubdir(ambiente)
      fs.mkdirSync(dir, { recursive: true })
      const certPath = path.join(dir, 'cert.pem')
      fs.writeFileSync(certPath, pemData, { encoding: 'utf-8', mode: 0o600 })

      return { success: true, certPath }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('csr:generate', async (_e, input: CsrInput): Promise<CsrResult> => {
    try {
      const dir = certsSubdir(input.ambiente)
      fs.mkdirSync(dir, { recursive: true })

      const { privateKey, publicKey } = forge.pki.rsa.generateKeyPair(2048)

      const csr = forge.pki.createCertificationRequest()
      csr.publicKey = publicKey
      const cuitSinGuiones = input.cuit.replace(/[-\s]/g, '')
      csr.setSubject([
        { name: 'commonName',          value: `CUIT ${cuitSinGuiones}` },
        { name: 'serialNumber',        value: `CUIT ${cuitSinGuiones}` },
        { name: 'organizationName',    value: input.denominacion },
        { name: 'localityName',        value: input.localidad || 'Sin especificar' },
        { name: 'stateOrProvinceName', value: input.provincia || 'Sin especificar' },
        { name: 'countryName',         value: 'AR' },
      ])
      csr.sign(privateKey, forge.md.sha256.create())

      const csrPem = forge.pki.certificationRequestToPem(csr)
      const keyPem = forge.pki.privateKeyToPem(privateKey)

      const csrPath = path.join(dir, 'csr.pem')
      const keyPath = path.join(dir, 'key.pem')

      fs.writeFileSync(csrPath, csrPem, { encoding: 'utf-8', mode: 0o600 })
      fs.writeFileSync(keyPath, keyPem, { encoding: 'utf-8', mode: 0o600 })

      return { success: true, csrPath, keyPath, csrPem }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
