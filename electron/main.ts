import { app, BrowserWindow, shell } from 'electron'
import path from 'path'
import { getDb, closeDb } from '../database/db'
import { runMigrations } from '../database/migrate'
import { registerAllIpcHandlers } from './ipc/index'

// Handle app lifecycle
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

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
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    // electron-vite dev server
    await mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

async function bootstrap(): Promise<void> {
  // Initialize database and run pending migrations
  try {
    const db = getDb()
    await runMigrations()
    registerAllIpcHandlers(db)
    console.log('[main] Database initialized and IPC handlers registered')
  } catch (err) {
    console.error('[main] Failed to initialize database:', err)
    app.quit()
    return
  }

  await createWindow()
}

app.whenReady().then(bootstrap)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
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
