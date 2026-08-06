import { ipcMain } from 'electron'
import { LabelConfigService } from '../modules/label-config/service'
import { buildLabelBuffer, buildFeedBuffer } from '../modules/printing/escpos-label'
import { PrinterConfigService, sendEscPos } from '../modules/printer-config/service'
import type { LabelConfig } from '../modules/label-config/types'

export function registerLabelConfigHandlers(): void {
  const svc = new LabelConfigService()

  ipcMain.handle('labelConfig:get', () => svc.get())

  ipcMain.handle('labelConfig:save', (_e, config: LabelConfig) => {
    svc.save(config)
  })

  ipcMain.handle('labelConfig:print', async (_e, config: LabelConfig, copies: number) => {
    try {
      const printerSvc = new PrinterConfigService()
      const printerCfg = printerSvc.get()

      if (!printerCfg.enabled) {
        return { success: false, error: 'La impresora ESC/POS no está habilitada. Habilitala en Configuración → Impresora.' }
      }
      const ready = printerCfg.connectionType === 'usb' ? !!printerCfg.usbPrinterName : !!printerCfg.ip
      if (!ready) {
        return { success: false, error: 'La impresora no está configurada. Completá la configuración en Configuración → Impresora.' }
      }

      const labelBuf = buildLabelBuffer(config)
      if (labelBuf.length === 0) {
        return { success: false, error: 'No hay texto en ninguna línea de la etiqueta.' }
      }

      const n = Math.max(1, Math.min(999, copies))
      const repeated = Buffer.concat(Array.from({ length: n }, () => labelBuf))
      await sendEscPos(printerCfg, repeated)
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('labelConfig:feed', async (_e, mm: number) => {
    try {
      const printerSvc = new PrinterConfigService()
      const printerCfg = printerSvc.get()
      if (!printerCfg.enabled) return { success: false, error: 'Impresora no habilitada.' }
      const ready = printerCfg.connectionType === 'usb' ? !!printerCfg.usbPrinterName : !!printerCfg.ip
      if (!ready) return { success: false, error: 'Impresora no configurada.' }

      await sendEscPos(printerCfg, buildFeedBuffer(mm))
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
