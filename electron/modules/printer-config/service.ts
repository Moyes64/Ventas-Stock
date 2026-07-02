import fs from 'fs'
import path from 'path'
import net from 'net'
import os from 'os'
import { exec } from 'child_process'
import { app } from 'electron'
import type { PrinterConfig, PrinterTestResult } from './types'
import { DEFAULT_PRINTER_CONFIG } from './types'

const CONFIG_FILENAME = 'printer-config.json'

// ── Config persistence ────────────────────────────────────────────────────────

export class PrinterConfigService {
  private get configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILENAME)
  }

  get(): PrinterConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8')
        return { ...DEFAULT_PRINTER_CONFIG, ...(JSON.parse(raw) as Partial<PrinterConfig>) }
      }
    } catch { /* fall through */ }
    return { ...DEFAULT_PRINTER_CONFIG }
  }

  save(config: PrinterConfig): void {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
  }
}

// ── ESC/POS buffer builders ───────────────────────────────────────────────────

/** ESC @ — inicializa/resetea la impresora */
export function cmdReset(): Buffer {
  return Buffer.from([0x1b, 0x40])
}

/**
 * Construye el bloque de densidad para un nivel dado.
 * Intenta dos comandos en secuencia:
 *   1. ESC 7 n1 n2 n3  — comando original Epson ESC/POS
 *   2. GS ( E 03 00 34 01 d — comando alternativo (impresoras más nuevas)
 * Si la impresora soporta alguno de los dos, responderá.
 */
export function cmdDarkness(_level: number): Buffer {
  // La POS80 no responde a ESC 7 ni a GS ( E via software.
  // GS ( E imprimía bytes visibles ('4', etc.) como texto en este modelo.
  // La densidad queda determinada por la configuración de hardware de la impresora.
  return Buffer.alloc(0)
}

export function cmdSpeed(_speed: 'normal' | 'slow'): Buffer {
  return Buffer.alloc(0)  // no-op: la velocidad va implícita en n3 de ESC 7
}

/** ESC a n — alineación: 0=izquierda, 1=centro, 2=derecha */
export function cmdAlign(align: 'left' | 'center' | 'right'): Buffer {
  const n = align === 'left' ? 0 : align === 'center' ? 1 : 2
  return Buffer.from([0x1b, 0x61, n])
}

/** ESC E n — negrita: 1=on, 0=off */
export function cmdBold(on: boolean): Buffer {
  return Buffer.from([0x1b, 0x45, on ? 1 : 0])
}

/** LF — salto de línea */
export function lf(n = 1): Buffer {
  return Buffer.alloc(n, 0x0a)
}

/** GS V m — corte de papel: 0=completo, 1=parcial */
export function cmdCut(partial = true): Buffer {
  return Buffer.from([0x1d, 0x56, partial ? 1 : 0])
}

/** Texto ASCII en buffer */
export function txt(s: string): Buffer {
  return Buffer.from(s, 'ascii')
}

// ── TCP send ──────────────────────────────────────────────────────────────────

export function sendEscPosTcp(ip: string, port: number, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    socket.setTimeout(5000)

    socket.connect(port, ip, () => {
      socket.write(data, err => {
        if (err) { socket.destroy(); reject(err); return }
        setTimeout(() => { socket.destroy(); resolve() }, 200)
      })
    })

    socket.on('error', err => { socket.destroy(); reject(err) })
    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error('Tiempo de espera agotado al conectar con la impresora'))
    })
  })
}

// ── USB send (Windows) ────────────────────────────────────────────────────────
/**
 * Envía datos ESC/POS RAW a una impresora Windows via la API Win32 WritePrinter.
 * Esto garantiza que los bytes llegan sin modificación, independientemente
 * del driver instalado (funciona con "Generic / Text Only" y drivers propios).
 * Se ejecuta vía PowerShell + Add-Type (P/Invoke) para acceder a winspool.dll.
 */
export function sendEscPosUsb(printerName: string, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const ts = Date.now()
    const binFile = path.join(os.tmpdir(), `escpos_${ts}.bin`)
    const psFile  = path.join(os.tmpdir(), `escpos_${ts}.ps1`)

    try { fs.writeFileSync(binFile, data) }
    catch (e) { return reject(new Error(`No se pudo escribir archivo temporal: ${e instanceof Error ? e.message : String(e)}`)) }

    // Script PowerShell que usa Win32 WritePrinter para envío RAW
    const psScript = `
param([string]$PrinterName, [string]$FilePath)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RawPrint {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFO {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName = "RAW";
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile = null;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType = "RAW";
    }
    [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
    public static extern bool OpenPrinter(string name, out IntPtr h, IntPtr pd);
    [DllImport("winspool.Drv", EntryPoint="ClosePrinter")]
    public static extern bool ClosePrinter(IntPtr h);
    [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
    public static extern int StartDocPrinter(IntPtr h, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);
    [DllImport("winspool.Drv", EntryPoint="EndDocPrinter")]
    public static extern bool EndDocPrinter(IntPtr h);
    [DllImport("winspool.Drv", EntryPoint="StartPagePrinter")]
    public static extern bool StartPagePrinter(IntPtr h);
    [DllImport("winspool.Drv", EntryPoint="EndPagePrinter")]
    public static extern bool EndPagePrinter(IntPtr h);
    [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
    public static extern bool WritePrinter(IntPtr h, IntPtr buf, int count, out int written);
    public static bool Send(string printer, byte[] bytes) {
        IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, p, bytes.Length);
        IntPtr hPrinter; int written;
        if (!OpenPrinter(printer, out hPrinter, IntPtr.Zero)) { Marshal.FreeCoTaskMem(p); return false; }
        DOCINFO di = new DOCINFO();
        bool ok = false;
        if (StartDocPrinter(hPrinter, 1, di) != 0) {
            if (StartPagePrinter(hPrinter)) {
                ok = WritePrinter(hPrinter, p, bytes.Length, out written);
                EndPagePrinter(hPrinter);
            }
            EndDocPrinter(hPrinter);
        }
        ClosePrinter(hPrinter);
        Marshal.FreeCoTaskMem(p);
        return ok;
    }
}
'@
$bytes = [System.IO.File]::ReadAllBytes($FilePath)
$ok = [RawPrint]::Send($PrinterName, $bytes)
if (-not $ok) { exit 1 }
`

    try { fs.writeFileSync(psFile, psScript, 'utf-8') }
    catch (e) {
      try { fs.unlinkSync(binFile) } catch { /* ignorar */ }
      return reject(new Error(`No se pudo escribir script PowerShell: ${e instanceof Error ? e.message : String(e)}`))
    }

    // Escapar comillas en el nombre de impresora para PowerShell
    const safePrinter = printerName.replace(/"/g, '""')
    const cmd = `powershell -NonInteractive -NoProfile -ExecutionPolicy Bypass -File "${psFile}" -PrinterName "${safePrinter}" -FilePath "${binFile}"`

    exec(cmd, { shell: 'cmd.exe', timeout: 15000 }, (err, _stdout, stderr) => {
      try { fs.unlinkSync(binFile) } catch { /* ignorar */ }
      try { fs.unlinkSync(psFile)  } catch { /* ignorar */ }

      if (err) {
        const detail = stderr?.trim() || err.message
        reject(new Error(`Error al imprimir en "${printerName}": ${detail}`))
      } else {
        resolve()
      }
    })
  })
}

// ── Dispatch: elige TCP o USB según config ────────────────────────────────────

export async function sendEscPos(config: PrinterConfig, data: Buffer): Promise<void> {
  if (config.connectionType === 'usb') {
    await sendEscPosUsb(config.usbPrinterName, data)
  } else {
    await sendEscPosTcp(config.ip, config.port, data)
  }
}

// ── Test de conexión ──────────────────────────────────────────────────────────

export function testConnection(config: PrinterConfig): Promise<PrinterTestResult> {
  if (config.connectionType === 'usb') {
    return testConnectionUsb(config.usbPrinterName)
  }
  return testConnectionTcp(config.ip, config.port)
}

function testConnectionTcp(ip: string, port: number): Promise<PrinterTestResult> {
  return new Promise(resolve => {
    const socket = new net.Socket()
    socket.setTimeout(3000)

    socket.connect(port, ip, () => {
      socket.destroy()
      resolve({ success: true })
    })

    socket.on('error', err => {
      socket.destroy()
      resolve({ success: false, error: err.message })
    })

    socket.on('timeout', () => {
      socket.destroy()
      resolve({ success: false, error: 'Sin respuesta (timeout). Verificar IP, puerto y que la impresora esté encendida.' })
    })
  })
}

function testConnectionUsb(printerName: string): Promise<PrinterTestResult> {
  return new Promise(resolve => {
    if (!printerName.trim()) {
      return resolve({ success: false, error: 'Ingresá el nombre de la impresora.' })
    }
    // Verificar que la impresora existe en Windows usando wmic
    const cmd = `wmic printer where "Name='${printerName.replace(/'/g, "\\'")}'" get Name /format:value`
    exec(cmd, { shell: 'cmd.exe' }, (err, stdout) => {
      if (err || !stdout.includes('Name=')) {
        resolve({
          success: false,
          error: `Impresora "${printerName}" no encontrada en Windows. Verificá el nombre exacto en Panel de control → Dispositivos e impresoras.`,
        })
      } else {
        resolve({ success: true })
      }
    })
  })
}

// ── Listar impresoras Windows ─────────────────────────────────────────────────

export function listWindowsPrinters(): Promise<string[]> {
  return new Promise(resolve => {
    exec('wmic printer get Name /format:value', { shell: 'cmd.exe' }, (err, stdout) => {
      if (err) { resolve([]); return }
      const names = stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('Name='))
        .map(line => line.replace('Name=', '').trim())
        .filter(Boolean)
      resolve(names)
    })
  })
}

// ── Ticket de prueba ──────────────────────────────────────────────────────────

export async function printTestTicket(config: PrinterConfig): Promise<PrinterTestResult> {
  try {
    const connInfo = config.connectionType === 'usb'
      ? `USB: ${config.usbPrinterName}`
      : `TCP: ${config.ip}:${config.port}`

    // Bloque de texto repetido para hacer visible la diferencia de densidad
    const testLines = () => Buffer.concat([
      txt('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'), lf(1),
      txt('Texto de prueba - Test text 1234'), lf(1),
      txt('################################'), lf(2),
    ])

    // Ticket diagnóstico: 3 secciones con densidades distintas SIN reset entre ellas.
    // Si el comando ESC 7 / GS ( E funciona, cada sección se verá diferente.
    const buf = Buffer.concat([
      cmdReset(),
      lf(1),
      cmdAlign('center'), cmdBold(true),
      txt('=== DIAGNOSTICO DENSIDAD ==='), lf(1),
      cmdBold(false),
      txt(connInfo), lf(2),

      // Sección 1: nivel 1 (mínimo)
      cmdDarkness(1),
      cmdAlign('center'), txt('--- NIVEL 1: MUY CLARO ---'), lf(1),
      cmdAlign('left'), testLines(),

      // Sección 2: nivel 4 (medio) — SIN reset, solo cambia el comando
      cmdDarkness(4),
      cmdAlign('center'), txt('--- NIVEL 4: NORMAL ---'), lf(1),
      cmdAlign('left'), testLines(),

      // Sección 3: nivel 7 (máximo)
      cmdDarkness(7),
      cmdAlign('center'), txt('--- NIVEL 7: MAXIMO ---'), lf(1),
      cmdAlign('left'), testLines(),

      cmdAlign('center'),
      txt(`Configuracion guardada: nivel ${config.darkness}`), lf(1),
      txt('--- FIN DIAGNOSTICO ---'), lf(3),
      cmdCut(true),
    ])

    await sendEscPos(config, buf)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── Envío de ticket de venta con configuración guardada ──────────────────────

export async function sendTicketBuffer(buf: Buffer): Promise<void> {
  const service = new PrinterConfigService()
  const config = service.get()
  if (!config.enabled) return

  const isReady = config.connectionType === 'usb'
    ? !!config.usbPrinterName
    : !!config.ip

  if (!isReady) return

  const withHeader = Buffer.concat([
    cmdReset(),
    cmdDarkness(config.darkness),
    cmdSpeed(config.speed),
    buf,
  ])

  await sendEscPos(config, withHeader)
}
