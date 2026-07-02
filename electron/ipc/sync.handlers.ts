import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { SyncService } from '../modules/sync/service'
import type { SyncConfig } from '../modules/sync/types'
import { buildLabelBuffer } from '../modules/printing/escpos-label'
import { PrinterConfigService, sendEscPos } from '../modules/printer-config/service'
import { SystemParamsService } from '../modules/system-params/service'
import type { LabelConfig } from '../modules/label-config/types'

/** Convierte caracteres con tilde/acento a su equivalente ASCII puro.
 *  Necesario porque txt() usa Buffer 'ascii' y bytes > 0x7F se corrompen. */
function toAscii(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x00-\x7F]/g, '?')
}

let syncService: SyncService | null = null

export function getSyncService(): SyncService | null {
  return syncService
}

export function registerSyncHandlers(db: Database): void {
  syncService = new SyncService(db)
  syncService.startTimer()

  ipcMain.handle('sync:getConfig', () => {
    return syncService!.getConfig()
  })

  ipcMain.handle('sync:saveConfig', (_event, config: SyncConfig) => {
    syncService!.saveConfig(config)
  })

  ipcMain.handle('sync:triggerNow', async () => {
    return syncService!.sync()
  })

  ipcMain.handle('sync:getLastResult', () => {
    return syncService!.getLastResult()
  })

  ipcMain.handle('sync:pullOrders', async () => {
    return syncService!.pullOrders()
  })

  ipcMain.handle('sync:listWebOrders', () => {
    return syncService!.listWebOrders()
  })

  ipcMain.handle('sync:markOrderProcessed', (_event, externalId: string) => {
    return syncService!.markWebOrderProcessed(externalId)
  })

  ipcMain.handle('sync:printShippingLabel', async (_event, order: {
    customerName: string
    deliveryAddress: string
    externalId: string
  }) => {
    try {
      const printerSvc = new PrinterConfigService()
      const printerCfg = printerSvc.get()
      if (!printerCfg.enabled) return { success: false, error: 'La impresora ESC/POS no esta habilitada.' }
      const ready = printerCfg.connectionType === 'usb' ? !!printerCfg.usbPrinterName : !!printerCfg.ip
      if (!ready) return { success: false, error: 'La impresora no esta configurada.' }

      const params = new SystemParamsService().get()
      const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

      // Parsear dirección: "Calle Nro[, Piso X Depto Y], CP XXXX"
      // Línea 1: Calle + Número, Línea 2: Piso/Depto (si existe), Línea 3: CP
      const rawParts = order.deliveryAddress.split(',').map(p => p.trim()).filter(Boolean)
      const cpPart   = rawParts.find(p => /^CP\s/i.test(p)) ?? ''
      const callePart = rawParts[0] ?? ''
      const pisoPart  = rawParts.find(p => /piso|depto/i.test(p)) ?? ''
      const addrParts = [callePart, pisoPart, cpPart].map(toAscii).filter(Boolean)

      // Datos del remitente desde SystemParams
      const remDenom = toAscii(params.denominacion || 'Remitente')
      const remCalle = toAscii([params.calle, params.numero].filter(Boolean).join(' '))
      const remCP    = params.codigoPostal ? `CP ${params.codigoPostal}` : ''

      const SEP   = '----------------------------------------'
      const BLANK = { text: ' ', fontSize: 'normal' as const, alignment: 'left' as const, bold: false }

      const config: LabelConfig = {
        labelWidthMm: 80,
        labelHeightMm: 130,
        gapMm: 3,
        leftMarginChars: 1,
        defaultCopies: 1,
        lines: [
          // ── Fecha ──
          { text: fecha, fontSize: 'normal', alignment: 'right', bold: false },
          { text: SEP, fontSize: 'small', alignment: 'left', bold: false },
          BLANK,

          // ── Destinatario ──
          { text: 'DESTINATARIO', fontSize: 'small', alignment: 'left', bold: true },
          BLANK,
          { text: toAscii(order.customerName), fontSize: 'large', alignment: 'left', bold: true },
          ...addrParts.map(p => ({
            text: p,
            fontSize: 'normal' as const,
            alignment: 'left' as const,
            bold: false,
          })),
          BLANK,

          // ── Separador ──
          { text: SEP, fontSize: 'small', alignment: 'left', bold: false },
          BLANK,

          // ── Remitente ──
          { text: 'REMITENTE', fontSize: 'small', alignment: 'left', bold: true },
          BLANK,
          { text: remDenom, fontSize: 'normal', alignment: 'left', bold: true },
          ...(remCalle ? [{ text: remCalle, fontSize: 'normal' as const, alignment: 'left' as const, bold: false }] : []),
          ...(remCP    ? [{ text: remCP,    fontSize: 'normal' as const, alignment: 'left' as const, bold: false }] : []),
          BLANK,

          // ── Ref ──
          { text: SEP, fontSize: 'small', alignment: 'left', bold: false },
          { text: `Ref: ${order.externalId}`, fontSize: 'small', alignment: 'left', bold: false },
        ],
      }

      const buf = buildLabelBuffer(config)
      await sendEscPos(printerCfg, buf)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
