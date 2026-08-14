import { app, BrowserWindow, shell, dialog, protocol, net } from 'electron'
import path from 'path'
import { config as dotenvConfig } from 'dotenv'
import { getDb, closeDb } from '../database/db'
import { runMigrations } from '../database/migrate'
import { registerAllIpcHandlers } from './ipc/index'

// Handle app lifecycle
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Load .env explicitly so that process.env.VITE_EMPRESA_* is available in the
// Electron main process (e.g. for printing/company header in remito interno).
// Must run before any module reads process.env.
{
  const appRoot = isDev ? process.cwd() : (process.resourcesPath ?? app.getAppPath())
  const envPath = path.join(appRoot, '.env')
  const { error } = dotenvConfig({ path: envPath })
  if (error) {
    console.warn(`[main] .env not loaded from "${envPath}":`, error.message)
  } else {
    console.debug(`[main] .env loaded from "${envPath}"`)
  }

  // In production the app ships without a .env, so DB_PATH is unset.
  // Use the platform-appropriate user-data directory so the DB is always
  // written to a writable location (e.g. %APPDATA%\ventas-stock\ on Windows).
  if (!process.env.DB_PATH) {
    process.env.DB_PATH = path.join(app.getPath('userData'), 'ventas.db')
  }
  if (!process.env.BACKUP_DIR) {
    process.env.BACKUP_DIR = path.join(app.getPath('userData'), 'backups')
  }

  // Los paths de cert/key los construye config.ts dinámicamente según el ambiente
  // (certs/<homologacion|produccion>/cert.pem) — no se sobreescriben aquí.
  if (!process.env.AFIP_CUIT) {
    process.env.AFIP_CUIT = process.env.VITE_EMPRESA_CUIT ?? ''
  }
  // AFIP_AMBIENTE no se fuerza aquí — config.ts lo lee desde system-params.json
}

async function createWindow(): Promise<void> {
  const iconPath = isDev
    ? path.join(process.cwd(), 'build/icon.ico')
    : path.join(process.resourcesPath ?? app.getAppPath(), 'build/icon.ico')

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'Ventas-Stock',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false, // Show only after ready-to-show
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Open external links in default browser.
  // Only http/https — otherwise shell.openExternal() would happily hand a
  // file:/UNC path (\\servidor\recurso) to the OS shell, which on Windows can
  // trigger an automatic NTLM auth attempt and leak the session hash.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const { protocol } = new URL(url)
      if (protocol === 'http:' || protocol === 'https:') {
        shell.openExternal(url).catch(() => undefined)
      }
    } catch {
      // Malformed URL — ignore rather than pass it to the shell.
    }
    return { action: 'deny' }
  })

  if (isDev) {
    // electron-vite sets ELECTRON_RENDERER_URL to the actual dev-server URL
    // (port may differ from 5173 if that port is already in use).
    const rendererUrl = process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:5173'
    await mainWindow.loadURL(rendererUrl)
    mainWindow.webContents.openDevTools()
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

async function bootstrap(): Promise<void> {
  // Initialize database and run pending migrations
  try {
    const db = getDb()
    runMigrations()
    const { stockCountService, webCatalogServerService } = registerAllIpcHandlers(db)

    // Retoma los servidores locales (conteo de stock / catálogo web LAN) si
    // habían quedado activados en la sesión anterior. Debe ser la MISMA
    // instancia que ya usan los handlers IPC (no `new ...Service(...)` acá)
    // — el servidor HTTP que arranca vive como estado en memoria de esa
    // instancia puntual; con dos instancias separadas, la UI (que consulta
    // la de los handlers IPC) nunca se entera de que la otra ya está
    // escuchando el puerto, y termina reportando "Inactivo" mientras el
    // puerto sigue tomado por la primera.
    await stockCountService.autoStartIfEnabled()
    await webCatalogServerService.autoStartIfEnabled()

    // One-time fix: ventas marcadas como REJECTED por bug en updateAfipError
    // (la función sobreescribía el status a REJECTED después de setearlo a INTERNAL_RECEIPT).
    // Las ventas rechazadas realmente por AFIP aún no existen en este sistema,
    // así que es seguro convertir todos los REJECTED → INTERNAL_RECEIPT.
    try {
      const fixed = db
        .prepare(`UPDATE sales SET status = 'INTERNAL_RECEIPT' WHERE status = 'REJECTED'`)
        .run()
      if (fixed.changes > 0) {
        console.log(`[main] Corregidas ${fixed.changes} ventas de REJECTED → INTERNAL_RECEIPT`)
      }
    } catch (fixErr) {
      console.warn('[main] No se pudo corregir ventas REJECTED:', fixErr)
    }

    console.log('[main] Database initialized and IPC handlers registered')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[main] Failed to initialize database:', err)
    dialog.showErrorBox(
      'Error al iniciar la aplicación',
      `No se pudo inicializar la base de datos:\n\n${message}\n\nRuta: ${process.env.DB_PATH ?? '(no definida)'}`,
    )
    app.quit()
    return
  }

  await createWindow()
}

// Protocolo para servir imágenes del catálogo web sin pasar por IPC
protocol.registerSchemesAsPrivileged([
  { scheme: 'web-image', privileges: { secure: true, supportFetchAPI: true, bypassCSP: true } },
])

void app.whenReady().then(async () => {
  protocol.handle('web-image', request => {
    const filename = decodeURIComponent(request.url.replace('web-image://', ''))
    const filePath = path.join(app.getPath('userData'), 'web-images', filename)
    return net.fetch(`file:///${filePath.replace(/\\/g, '/')}`)
  })
  await bootstrap()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow()
  }
})

app.on('quit', () => {
  closeDb()
})

// Security: prevent navigation to external URLs
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url)
    const allowedHosts = ['localhost', '127.0.0.1']
    if (!allowedHosts.includes(parsedUrl.hostname) && !url.startsWith('file://')) {
      event.preventDefault()
    }
  })
})
