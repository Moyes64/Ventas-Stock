import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import type { Database } from 'better-sqlite3'
import { app } from 'electron'
import QRCode from 'qrcode'
import { StockCountRepository } from './repository'
import { StockService } from '../stock/service'
import { createStockCountServer } from './server'
import type { Server } from 'http'
import type {
  StockCountSession,
  StockCountSessionStatus,
  StockCountServerConfig,
  StockCountServerStatus,
  ReconciliationRow,
  ApplyReconciliationDecision,
  StockCountPairingPayload,
} from './types'

const CONFIG_FILENAME = 'stock-count-config.json'
const DEFAULT_PORT = 4278

export class StockCountService {
  private readonly repo: StockCountRepository
  private readonly stockService: StockService
  private readonly configPath: string
  private server: Server | null = null
  private lastError: string | null = null

  constructor(private readonly db: Database) {
    this.repo = new StockCountRepository(db)
    this.stockService = new StockService(db)
    this.configPath = path.join(app.getPath('userData'), CONFIG_FILENAME)
  }

  // ── Config ────────────────────────────────────────────────────────────────

  getConfig(): StockCountServerConfig {
    let config: StockCountServerConfig = { enabled: false, port: DEFAULT_PORT, token: '' }
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8')
        config = { ...config, ...(JSON.parse(raw) as Partial<StockCountServerConfig>) }
      }
    } catch {
      // fall through to default
    }
    // El token de pairing se genera solo una vez, en el primer acceso.
    if (!config.token) {
      config.token = crypto.randomBytes(16).toString('hex')
      this.saveConfigFile(config)
    }
    return config
  }

  private saveConfigFile(config: StockCountServerConfig): void {
    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf-8')
  }

  // ── Lifecycle del servidor local ─────────────────────────────────────────

  /** Llamado desde main.ts al bootstrapear: retoma el estado 'activado' de la sesión anterior. */
  async autoStartIfEnabled(): Promise<void> {
    const config = this.getConfig()
    if (config.enabled) await this.startServer(config)
  }

  async setEnabled(enabled: boolean): Promise<StockCountServerStatus> {
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

  async regenerateToken(): Promise<StockCountServerStatus> {
    const config = this.getConfig()
    config.token = crypto.randomBytes(16).toString('hex')
    this.saveConfigFile(config)
    // Reinicia para que el server tome el nuevo token de inmediato (invalida
    // a propósito cualquier celular ya pareado con el token anterior).
    if (this.server) {
      await this.stopServer()
      await this.startServer(config)
    }
    return this.getServerStatus()
  }

  /**
   * `server.listen()` es asíncrono: el bind (o el EADDRINUSE si el puerto
   * está ocupado) se resuelve en un tick posterior, vía el evento 'listening'
   * o 'error'. Devolver el estado antes de esperar ese resultado hacía que la
   * UI mostrara "Activo" de forma optimista un instante antes de que llegara
   * el error real — por eso este método ahora es awaitable y setEnabled/
   * regenerateToken/autoStartIfEnabled esperan a que se resuelva antes de
   * reportar el estado.
   */
  private startServer(config: StockCountServerConfig): Promise<void> {
    if (this.server) return Promise.resolve()

    return new Promise(resolve => {
      const server = createStockCountServer({
        getToken: () => this.getConfig().token,
        getSessionForDownload: sessionId => {
          const session = this.repo.getSession(sessionId)
          if (!session || session.status !== 'open') return null
          return { label: session.label, products: this.repo.listSessionProducts(sessionId) }
        },
        submitItems: (sessionId, items) => {
          const session = this.repo.getSession(sessionId)
          if (!session) return { ok: false, error: 'Sesión no encontrada' }
          if (session.status !== 'open') {
            return { ok: false, error: `La sesión ya no está abierta (estado: ${session.status})` }
          }
          this.repo.replaceSessionItems(sessionId, items)
          return { ok: true }
        },
      })

      // Guarda contra eventos tardíos de un server VIEJO (ya reemplazado por
      // uno nuevo, p. ej. tras un apagar+prender rápido): si para cuando
      // llega el evento `this.server` ya no es ESTE objeto puntual, no tocar
      // el estado compartido — sería pisar el estado del server actual con
      // el de uno que ya no existe.
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

  /**
   * `server.close()` no libera el puerto a nivel SO de forma sincrónica —
   * solo dispara el cierre y emite 'close' cuando termina. Intentar volver a
   * escuchar el mismo puerto antes de que ese evento llegue puede fallar con
   * EADDRINUSE de forma transitoria (exactamente lo que pasa si el usuario
   * destilda y tilda "Activado" rápido en la UI) — por eso esto también es
   * awaitable, y setEnabled/regenerateToken esperan el cierre real antes de
   * intentar un nuevo bind.
   */
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

  getServerStatus(): StockCountServerStatus {
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

  /** Data URL (PNG) del QR de pairing para una sesión puntual; null si no hay IP de LAN detectable. */
  async getSessionPairingQr(sessionId: number): Promise<string | null> {
    const config = this.getConfig()
    const host = this.getLanIp()
    if (!host) return null
    const payload: StockCountPairingPayload = { v: 1, host, port: config.port, token: config.token, sessionId }
    return QRCode.toDataURL(JSON.stringify(payload), { errorCorrectionLevel: 'M', margin: 1, width: 240 })
  }

  // ── Sesiones ──────────────────────────────────────────────────────────────

  createSession(label: string, webCategoryId: number | null): number {
    if (!label.trim()) throw new Error('La sesión necesita un nombre')
    return this.repo.createSession(label.trim(), webCategoryId)
  }

  listSessions(statusFilter?: StockCountSessionStatus): StockCountSession[] {
    return this.repo.listSessions(statusFilter)
  }

  getSession(id: number): StockCountSession | undefined {
    return this.repo.getSession(id)
  }

  getReconciliation(sessionId: number): ReconciliationRow[] {
    return this.repo.getReconciliationRows(sessionId)
  }

  /** Aplica (o descarta) cada decisión de conciliación; los aplicados generan un ADJUSTMENT auditable en stock_movements. */
  applyReconciliation(sessionId: number, decisions: ApplyReconciliationDecision[]): void {
    for (const decision of decisions) {
      const item = this.repo.getItem(decision.itemId)
      if (!item || item.sessionId !== sessionId) continue
      if (decision.apply) {
        this.stockService.adjustStockAbsolute(item.productId, item.countedQuantity)
      }
      this.repo.markItemReconciled(decision.itemId)
    }
    this.repo.markSessionReconciledIfComplete(sessionId)
  }

  cancelSession(id: number): void {
    this.repo.cancelSession(id)
  }

  deleteSession(id: number): void {
    this.repo.deleteSession(id)
  }
}
