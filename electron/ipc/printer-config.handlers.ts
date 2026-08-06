import { ipcMain } from 'electron'
import {
  PrinterConfigService,
  testConnection,
  printTestTicket,
  listWindowsPrinters,
} from '../modules/printer-config/service'
import type { PrinterConfig } from '../modules/printer-config/types'

export function registerPrinterConfigHandlers(): void {
  const service = new PrinterConfigService()

  ipcMain.handle('printerConfig:get', () => service.get())

  ipcMain.handle('printerConfig:save', (_e, config: PrinterConfig) => {
    service.save(config)
  })

  ipcMain.handle('printerConfig:testConnection', async (_e, config: PrinterConfig) => {
    return testConnection(config)
  })

  ipcMain.handle('printerConfig:printTest', async (_e, config: PrinterConfig) => {
    return printTestTicket(config)
  })

  ipcMain.handle('printerConfig:listPrinters', async () => {
    const printers = await listWindowsPrinters()
    return printers
  })
}
