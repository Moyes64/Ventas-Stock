import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { webCatalogServer as webCatalogServerApi } from '../../lib/ipc'
import type { WebCatalogServerStatus, WebCatalogPairingInfo } from '../../types/ipc'
import { useConfirm } from '../../hooks/useConfirm'

export default function WebCatalogRemotePage() {
  const navigate = useNavigate()

  const [status, setStatus] = useState<WebCatalogServerStatus | null>(null)
  const [pairing, setPairing] = useState<WebCatalogPairingInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  const { confirm, dialog: confirmDialog } = useConfirm()

  async function loadAll() {
    setLoading(true)
    try {
      const s = await webCatalogServerApi.getStatus()
      setStatus(s)
      setPairing(s.running ? await webCatalogServerApi.getPairingInfo() : null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAll() }, [])

  async function handleToggle(enabled: boolean) {
    setToggling(true)
    try {
      const s = await webCatalogServerApi.setEnabled(enabled)
      setStatus(s)
      setPairing(s.running ? await webCatalogServerApi.getPairingInfo() : null)
    } finally {
      setToggling(false)
    }
  }

  async function handleRegenerateToken() {
    if (!(await confirm('Esto invalida el acceso de cualquier navegador ya pareado (ej. la Mac de Anabella). ¿Regenerar el token?'))) return
    const s = await webCatalogServerApi.regenerateToken()
    setStatus(s)
    setPairing(s.running ? await webCatalogServerApi.getPairingInfo() : null)
  }

  if (loading) return <div className="page"><p>Cargando...</p></div>

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">📡 Acceso remoto al catálogo web</h1>
        <button type="button" className="btn btn-ghost" onClick={() => navigate('/web-catalog')}>
          ← Volver
        </button>
      </div>

      <p className="muted-text" style={{ maxWidth: 640 }}>
        Activá esto para que se pueda editar el catálogo web desde otra computadora en la misma red
        (ej. la Mac de Anabella), sin instalar nada ahí — solo hace falta abrir la dirección de abajo
        en un navegador. Esta notebook tiene que seguir prendida y conectada a la red mientras se use.
      </p>

      <div className="params-layout">
        <div className="params-list-panel">
          <h2 className="params-form-title">Servidor local</h2>

          <div className="sync-status-card">
            <div className="sync-status-row">
              <span className="sync-status-label">Estado</span>
              <span className={`sync-badge ${status?.running ? 'sync-badge--on' : 'sync-badge--off'}`}>
                {status?.running ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            {status?.running && (
              <div className="sync-status-row">
                <span className="sync-status-label">Dirección</span>
                <span>{status.lanIp ? `${status.lanIp}:${status.port}` : 'Sin IP de red detectada'}</span>
              </div>
            )}
            {status?.running && (
              <div className="sync-status-row">
                <span className="sync-status-label">Token</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code>{status.token}</code>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => { void navigator.clipboard.writeText(status.token) }}
                  >
                    Copiar
                  </button>
                </span>
              </div>
            )}
            {status?.error && (
              <div className="sync-status-row">
                <span className="sync-status-label">Error</span>
                <span className="error">{status.error}</span>
              </div>
            )}
          </div>

          <div className="form-row" style={{ marginTop: 12 }}>
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={status?.enabled ?? false}
                disabled={toggling}
                onChange={e => { void handleToggle(e.target.checked) }}
              />
              <span className="toggle-text">
                {status?.enabled ? 'Activado' : 'Desactivado'}
              </span>
            </label>
            <span className="field-hint">
              La primera vez que lo actives, Windows puede pedir permiso de red — permitilo para que la
              otra computadora se pueda conectar.
            </span>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => { void handleRegenerateToken() }}
            style={{ marginTop: 4 }}
          >
            🔑 Regenerar token de acceso
          </button>
        </div>

        <div className="params-form-panel">
          <h2 className="params-form-title">Acceso desde otra computadora</h2>
          {!status?.running ? (
            <p className="field-hint">Activá el servidor local para generar la dirección de acceso.</p>
          ) : !pairing?.url ? (
            <p className="error">
              No se pudo generar la dirección de acceso: no se detectó una IP de red local. Verificá que
              esta notebook esté conectada a la red Wi-Fi/LAN.
            </p>
          ) : (
            <>
              <p className="muted-text">
                Desde la Mac (u otra máquina en la misma red), abrí esta dirección en el navegador:
              </p>
              <p style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <code style={{ wordBreak: 'break-all' }}>{pairing.url}</code>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => { void navigator.clipboard.writeText(pairing.url!) }}
                >
                  Copiar
                </button>
              </p>
              {pairing.qrDataUrl && (
                <>
                  <p className="muted-text" style={{ marginTop: 16 }}>
                    O escaneá este código con la cámara de la Mac/celular para abrirla directo:
                  </p>
                  <img src={pairing.qrDataUrl} alt="Código QR de acceso al catálogo web" style={{ width: 240, height: 240 }} />
                </>
              )}
            </>
          )}
        </div>
      </div>

      {confirmDialog}
    </div>
  )
}
