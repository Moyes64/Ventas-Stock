import { app, crashReporter } from 'electron'
import fs from 'fs'
import path from 'path'

const MAX_LOG_BYTES = 2 * 1024 * 1024

/**
 * Registro de la app en <userData>/logs/main.log (en Mac
 * ~/Library/Application Support/ventas-stock/logs/main.log). Copia ahí lo que
 * la app escribe en consola y los errores que la cierran o la cuelgan, así un
 * problema en otro equipo (p. ej. la Mac) se puede revisar después sin haberla
 * abierto desde la Terminal. Los cierres del código nativo (base de datos,
 * Chromium) quedan como minidump en la carpeta Crashpad (no se envían a ningún
 * lado). Llamar después de fijar la carpeta userData.
 */
export function installCrashLog(): void {
  let file: string
  try {
    const dir = path.join(app.getPath('userData'), 'logs')
    fs.mkdirSync(dir, { recursive: true })
    file = path.join(dir, 'main.log')
    if (fs.existsSync(file) && fs.statSync(file).size > MAX_LOG_BYTES) {
      fs.renameSync(file, path.join(dir, 'main.old.log'))
    }
  } catch {
    return
  }
  // El vigilante de Turso (database/turso-watchdog.ts) escribe acá desde otro hilo.
  process.env.VS_LOG_FILE = file

  const write = (level: string, args: unknown[]) => {
    try {
      const text = args
        .map(a => (a instanceof Error ? `${a.message}\n${a.stack ?? ''}` : typeof a === 'string' ? a : safeJson(a)))
        .join(' ')
      fs.appendFileSync(file, `${new Date().toISOString()} ${level} ${text}\n`)
    } catch {
      // el registro nunca debe romper la app
    }
  }

  for (const level of ['log', 'warn', 'error'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      original(...args)
      write(level.toUpperCase(), args)
    }
  }

  write('INFO', [`--- inicio v${app.getVersion()} ${process.platform}-${process.arch} ---`])

  process.on('uncaughtException', err => write('FATAL', ['uncaughtException', err]))
  process.on('unhandledRejection', reason => write('ERROR', ['unhandledRejection', reason]))

  app.on('render-process-gone', (_e, _wc, details) =>
    write('FATAL', [`render-process-gone: ${details.reason} (exit ${details.exitCode})`]))
  app.on('child-process-gone', (_e, details) =>
    write('ERROR', [`child-process-gone: ${details.type} ${details.reason} (exit ${details.exitCode})`]))
  app.on('before-quit', () => write('INFO', ['--- cierre normal ---']))

  try {
    crashReporter.start({ uploadToServer: false })
  } catch (err) {
    write('WARN', ['crashReporter no disponible', err])
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
