import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { app } from 'electron'
import QRCode from 'qrcode'
import type { Server } from 'http'
import { createWebCatalogServer } from './server'
import type { WebCatalogService } from '../web-catalog/service'
import type {
  WebCatalogServerConfig,
  WebCatalogServerStatus,
  WebCatalogPairingInfo,
} from './types'

const CONFIG_FILENAME = 'web-catalog-server-config.json'
// Siguiente puerto libre después del 4278 que ya usa stock-count.
const DEFAULT_PORT = 4279

export class WebCatalogServerService {
  private readonly configPath: string
  private server: Server | null = null
  private lastError: string | null = null

  constructor(
    private readonly webCatalogService: WebCatalogService
  ) {
    this.configPath = path.join(app.getPath('userData'), CONFIG_FILENAME)
  }

  // ── Config ────────────────────────────────────────────────────────────────
  // (mismo esquema que electron/modules/stock-count/service.ts)

  getConfig(): WebCatalogServerConfig {
    let config: WebCatalogServerConfig = { enabled: false, port: DEFAULT_PORT, token: '' }
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8')
        config = { ...config, ...(JSON.parse(raw) as Partial<WebCatalogServerConfig>) }
      }
    } catch {
      // fall through to default
    }
    if (!config.token) {
      config.token = crypto.randomBytes(16).toString('hex')
      this.saveConfigFile(config)
    }
    return config
  }

  private saveConfigFile(config: WebCatalogServerConfig): void {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  // ── Lifecycle del servidor local ─────────────────────────────────────────

  /** Llamado desde main.ts al bootstrapear: retoma el estado 'activado' de la sesión anterior. */
  async autoStartIfEnabled(): Promise<void> {
    const config = this.getConfig()
    if (config.enabled) await this.startServer(config)
  }

  async setEnabled(enabled: boolean): Promise<WebCatalogServerStatus> {
    const config = this.getConfig()
    config.enabled = enabled
    this.saveConfigFile(config)
    if (enabled) {
      await this.startServer(config)
    } else {
      await this.stopServer()
    }
    return this.getServerStatus()
  }

  async regenerateToken(): Promise<WebCatalogServerStatus> {
    const config = this.getConfig()
    config.token = crypto.randomBytes(16).toString('hex')
    this.saveConfigFile(config)
    // Reinicia para que el server tome el nuevo token de inmediato (invalida
    // a propósito cualquier browser ya pareado con el token anterior).
    if (this.server) {
      await this.stopServer()
      await this.startServer(config)
    }
    return this.getServerStatus()
  }

  // start/stopServer son awaitables por la misma razón que en stock-count:
  // server.listen()/close() resuelven en un tick posterior (evento
  // 'listening'/'error'/'close'), y reportar el estado antes de eso hacía que
  // la UI mostrara "Activo" de forma optimista antes de un EADDRINUSE real.
  private startServer(config: WebCatalogServerConfig): Promise<void> {
    if (this.server) return Promise.resolve()

    return new Promise(resolve => {
      const server = createWebCatalogServer({
        getToken: () => this.getConfig().token,
        listCategories: () => this.webCatalogService.listCategories(),
        saveCategory: (id, input) => this.webCatalogService.saveCategory(id, input),
        deleteCategory: id => this.webCatalogService.deleteCategory(id),
        listProducts: () => this.webCatalogService.listWebProducts(),
        getProduct: productId => this.webCatalogService.getWebProduct(productId),
        saveProduct: input => this.webCatalogService.saveWebProduct(input),
        listUnpublished: () => this.webCatalogService.listUnpublishedProducts(),
        getNextSortOrder: webCategoryId => this.webCatalogService.getNextSortOrder(webCategoryId),
        getNextFeaturedOrder: () => this.webCatalogService.getNextFeaturedOrder(),
        saveImage: (productId, sortOrder, base64) =>
          this.webCatalogService.saveImageFromBuffer(productId, decodeBase64Image(base64), sortOrder),
        deleteImage: imageId => this.webCatalogService.deleteImage(imageId),
        reorderImages: (productId, orderedIds) => this.webCatalogService.reorderImages(productId, orderedIds),
        getImagePath: filename => this.webCatalogService.getImagePath(filename),
        staticDir: () => this.getStaticDir(),
      })

      // Guarda contra eventos tardíos de un server VIEJO — ver el comentario
      // equivalente en stock-count/service.ts.
      server.on('error', (err: NodeJS.ErrnoException) => {
        if (this.server !== server) { resolve(); return }
        this.lastError =
          err.code === 'EADDRINUSE'
            ? `El puerto ${config.port} ya está en uso por otro proceso`
            : (err.message ?? String(err))
        this.server = null
        resolve()
      })

      server.listen(config.port, '0.0.0.0', () => {
        if (this.server === server) this.lastError = null
        resolve()
      })

      this.server = server
    })
  }

  private stopServer(): Promise<void> {
    if (!this.server) {
      this.lastError = null
      return Promise.resolve()
    }
    const server = this.server
    this.server = null
    this.lastError = null
    return new Promise(resolve => {
      server.close(() => resolve())
    })
  }

  getServerStatus(): WebCatalogServerStatus {
    const config = this.getConfig()
    return {
      running: this.server !== null && !this.lastError,
      enabled: config.enabled,
      port: config.port,
      lanIp: this.getLanIp(),
      token: config.token,
      error: this.lastError,
    }
  }

  private getLanIp(): string | null {
    const interfaces = os.networkInterfaces()
    for (const entries of Object.values(interfaces)) {
      for (const iface of entries ?? []) {
        if (iface.family === 'IPv4' && !iface.internal) return iface.address
      }
    }
    return null
  }

  /** URL de pairing (con el token embebido) + su QR en PNG data URL; ambos null si no hay IP de LAN detectable. */
  async getPairingInfo(): Promise<WebCatalogPairingInfo> {
    const config = this.getConfig()
    const host = this.getLanIp()
    if (!host) return { url: null, qrDataUrl: null }
    const url = `http://${host}:${config.port}/?token=${config.token}`
    const qrDataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 240 })
    return { url, qrDataUrl }
  }

  // ── Carpeta del cliente web estático ─────────────────────────────────────

  private getStaticDir(): string | null {
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
    const candidate = isDev
      ? path.join(process.cwd(), 'web-catalog-client', 'dist')
      : path.join(process.resourcesPath ?? app.getAppPath(), 'web-catalog-client')
    return fs.existsSync(path.join(candidate, 'index.html')) ? candidate : null
  }
}

function decodeBase64Image(base64: string): Buffer {
  // Acepta tanto un data URL completo ("data:image/jpeg;base64,...") como el
  // base64 pelado.
  const commaIdx = base64.indexOf(',')
  const raw = base64.startsWith('data:') && commaIdx !== -1 ? base64.slice(commaIdx + 1) : base64
  return Buffer.from(raw, 'base64')
}
