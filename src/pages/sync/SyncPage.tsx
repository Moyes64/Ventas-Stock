import { useEffect, useState } from 'react'
import { sync as syncApi, principal as principalApi } from '../../lib/ipc'
import type { PrincipalStatus, SyncConfig, SyncResult } from '../../types/ipc'
import { formatDateTime } from '../../lib/date'

const DEFAULT_CONFIG: SyncConfig = {
  enabled: false,
  apiUrl: '',
  apiKey: '',
  intervalMinutes: 15,
}

export default function SyncPage() {
  const [config, setConfig] = useState<SyncConfig>(DEFAULT_CONFIG)
  const [lastResult, setLastResult] = useState<SyncResult | null>(null)
  const [pc, setPc] = useState<PrincipalStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [cfg, result, status] = await Promise.all([
        syncApi.getConfig(), syncApi.getLastResult(), principalApi.getStatus().catch(() => null),
      ])
      setConfig(cfg)
      setLastResult(result)
      setPc(status)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaveMsg(null)
    setSaveErr(null)
    setSaving(true)
    try {
      await syncApi.saveConfig(config)
      setSaveMsg('Configuración guardada')
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleSyncNow() {
    setSyncing(true)
    try {
      const result = await syncApi.triggerNow()
      setLastResult(result)
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <div className="page"><p>Cargando...</p></div>

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Sincronización Web</h1>
      </div>

      <div className="params-layout">
        {/* ── Left: estado ── */}
        <div className="params-list-panel">
          <h2 className="params-form-title">Estado</h2>

          <div className="sync-status-card">
            <div className="sync-status-row">
              <span className="sync-status-label">Sincronización automática</span>
              <span className={`sync-badge ${config.enabled ? 'sync-badge--on' : 'sync-badge--off'}`}>
                {config.enabled ? 'Activa' : 'Inactiva'}
              </span>
            </div>
            {config.enabled && config.intervalMinutes > 0 && (
              <div className="sync-status-row">
                <span className="sync-status-label">Intervalo</span>
                <span>Cada {config.intervalMinutes} minutos</span>
              </div>
            )}
          </div>

          {lastResult && (
            <div className={`sync-result ${lastResult.success ? 'sync-result--ok' : 'sync-result--err'}`}>
              <div className="sync-result-icon">{lastResult.success ? '✅' : '❌'}</div>
              <div>
                <div className="sync-result-title">
                  {lastResult.success ? 'Última sincronización exitosa' : 'Error en última sincronización'}
                </div>
                <div className="sync-result-time">
                  {formatDateTime(lastResult.timestamp)}
                </div>
                {lastResult.error && (
                  <div className="sync-result-error">{lastResult.error}</div>
                )}
              </div>
            </div>
          )}

          {!lastResult && (
            <p className="muted-text">Aún no se realizó ninguna sincronización.</p>
          )}

          <button
            type="button"
            className="btn btn-primary sync-now-btn"
            onClick={() => { void handleSyncNow() }}
            disabled={syncing || !config.apiUrl || !config.apiKey}
          >
            {syncing ? 'Sincronizando...' : '🔄 Sincronizar ahora'}
          </button>

          {pc?.sharedDb && !pc.isPrincipal && (
            <div className="sync-info-box">
              Este equipo sube a la web sus cambios de catálogo, catálogo web, precios y stock
              (solo, unos segundos después de guardarlos) y con este botón. La sincronización
              periódica y las órdenes web las hace la PC principal
              {pc.principalName ? ` (${pc.principalName})` : ''}.
            </div>
          )}

          <div className="sync-info-box">
            <strong>¿Qué se sincroniza?</strong>
            <ul>
              <li>Stock actual de todos los productos</li>
              <li>Ventas del día (totales y por método de pago)</li>
              <li>Estado de caja (apertura, efectivo, ingresos/egresos)</li>
            </ul>
          </div>
        </div>

        {/* ── Right: configuración ── */}
        <div className="params-form-panel">
          <h2 className="params-form-title">Configuración</h2>

          <form onSubmit={e => { void handleSave(e) }} className="form params-form">
            <div className="form-row">
              <label className="label">Activar sincronización automática</label>
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={e => setConfig({ ...config, enabled: e.target.checked })}
                />
                <span className="toggle-text">{config.enabled ? 'Activada' : 'Desactivada'}</span>
              </label>
            </div>

            <div className="form-row">
              <label className="label">URL del endpoint *</label>
              <input
                type="url"
                value={config.apiUrl}
                onChange={e => setConfig({ ...config, apiUrl: e.target.value })}
                className="input"
                placeholder="https://tudominio.com/pandorabox/api/sync.php"
              />
              <span className="field-hint">URL completa del archivo sync.php en Hostinger</span>
            </div>

            <div className="form-row">
              <label className="label">API Key *</label>
              <input
                type="password"
                value={config.apiKey}
                onChange={e => setConfig({ ...config, apiKey: e.target.value })}
                className="input"
                placeholder="Clave secreta"
              />
              <span className="field-hint">Debe coincidir con EXPECTED_API_KEY en sync.php</span>
            </div>

            <div className="form-row">
              <label className="label">Intervalo (minutos)</label>
              <input
                type="number"
                min={1}
                max={60}
                value={config.intervalMinutes}
                onChange={e => setConfig({ ...config, intervalMinutes: parseInt(e.target.value) || 15 })}
                onFocus={e => e.target.select()}
                className="input"
              />
            </div>

            {saveMsg && <p className="params-success">{saveMsg}</p>}
            {saveErr && <p className="error">{saveErr}</p>}

            <div className="form-actions params-form-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar configuración'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
