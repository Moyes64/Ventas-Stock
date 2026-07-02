export type ConnectionType = 'usb' | 'tcp'

export interface PrinterConfig {
  connectionType: ConnectionType
  // TCP
  ip: string
  port: number
  // USB
  usbPrinterName: string   // Nombre de impresora en Windows (Panel de control → Dispositivos)
  // Común
  darkness: number         // 1-7
  speed: 'normal' | 'slow'
  enabled: boolean
}

export const DEFAULT_PRINTER_CONFIG: PrinterConfig = {
  connectionType: 'usb',
  ip: '',
  port: 9100,
  usbPrinterName: '',
  darkness: 4,
  speed: 'normal',
  enabled: false,
}

export interface PrinterTestResult {
  success: boolean
  error?: string
  printers?: string[]   // lista de impresoras disponibles (solo en listPrinters)
}
