import type { Database } from 'better-sqlite3'
import https from 'https'
import http from 'http'
import { SyncService } from '../sync/service'
import type { SearchAnalyticsFilters, SearchAnalyticsReport } from './types'

// Mismo criterio que sync/service.ts: el host de Hostinger tiene un problema
// de cadena de certificado que hace fallar la verificación TLS por defecto.
const httpsAgent = new https.Agent({ rejectUnauthorized: false })

/**
 * Trae el reporte de preferencias de búsqueda (precio / edad / jugadores) del
 * buscador rápido de pandorabox-web, para mostrarlo en Reportes. No guarda
 * nada en SQLite local — es una consulta en vivo al mismo backend Hostinger
 * que ya usa "Sync Web" (misma URL/API key), igual que pullOrders().
 */
export class SearchAnalyticsService {
  private readonly syncService: SyncService

  constructor(db: Database) {
    this.syncService = new SyncService(db)
  }

  async getReport(filters: SearchAnalyticsFilters): Promise<SearchAnalyticsReport> {
    const config = this.syncService.getConfig()
    if (!config.apiUrl || !config.apiKey) {
      throw new Error('Sync Web no está configurado (falta URL o API key) — configuralo en el menú "Sync Web"')
    }

    const baseUrl = config.apiUrl.replace(/\/api\/sync\.php$/, '').replace(/\/sync\/?$/, '')
    const qs = new URLSearchParams()
    if (filters.dateFrom) qs.set('dateFrom', filters.dateFrom)
    if (filters.dateTo) qs.set('dateTo', filters.dateTo)
    if (filters.includeInternal) qs.set('includeInternal', '1')

    return this.fetchReport(config.apiKey, `${baseUrl}/api/search-logs.php?${qs.toString()}`)
  }

  private fetchReport(apiKey: string, urlStr: string): Promise<SearchAnalyticsReport> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr)
      const isHttps = url.protocol === 'https:'
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        headers: { 'X-Api-Key': apiKey },
        agent: isHttps ? httpsAgent : undefined,
      }
      const req = (isHttps ? https : http).request(options, res => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data) as SearchAnalyticsReport)
            } catch {
              reject(new Error('Respuesta inválida del servidor'))
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`))
          }
        })
      })
      req.on('error', reject)
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')) })
      req.end()
    })
  }
}
