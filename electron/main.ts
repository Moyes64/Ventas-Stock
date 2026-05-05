import { app, BrowserWindow, shell, dialog } from 'electron'
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
}

async function createWindow(): Promise<void> {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'Ventas-Stock',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false, // Show only after ready-to-show
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => undefined)
    return { action: 'deny' }
  })

  if (isDev) {
    // electron-vite sets ELECTRON_RENDERER_URL to the actual dev-server URL
    // (port may differ from 5173 if that port is already in use).
    const devUrl = process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:5173'
    await mainWindow.loadURL(devUrl)
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
    registerAllIpcHandlers(db)
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

void app.whenReady().then(bootstrap)

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
