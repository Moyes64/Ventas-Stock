import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { stockCount as stockCountApi, webCatalog as webCatalogApi } from '../../lib/ipc'
import type { StockCountServerStatus, StockCountSession, WebCategory } from '../../types/ipc'

const STATUS_LABEL: Record<StockCountSession['status'], string> = {
  open: 'Abierta',
  uploaded: 'Subida — falta conciliar',
  reconciled: 'Conciliada',
  cancelled: 'Cancelada',
}

const STATUS_BADGE: Record<StockCountSession['status'], string> = {
  open: 'badge--info',
  uploaded: 'badge--warning',
  reconciled: 'badge--success',
  cancelled: 'badge--danger',
}

export default function StockCountPage() {
  const navigate = useNavigate()

  const [status, setStatus] = useState<StockCountServerStatus | null>(null)
  const [sessions, setSessions] = useState<StockCountSession[]>([])
  const [categories, setCategories] = useState<WebCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  const [label, setLabel] = useState('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)

  const [pairing, setPairing] = useState<{ session: StockCountSession; qr: string | null } | null>(null)

  async function loadAll() {
    setLoading(true)
    try {
      const [s, list, cats] = await Promise.all([
        stockCountApi.getServerStatus(),
        stockCountApi.listSessions(),
        webCatalogApi.listCategories(),
      ])
      setStatus(s)
      setSessions(list)
      setCategories(cats)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadAll() }, [])

  async function handleToggle(enabled: boolean) {
    setToggling(true)
    try {
      const s = await stockCountApi.setServerEnabled(enabled)
      setStatus(s)
    } finally {
      setToggling(false)
    }
  }

  async function handleRegenerateToken() {
    if (!window.confirm('Esto invalida el pairing de cualquier celular ya conectado. ¿Regenerar el token?')) return
    const s = await stockCountApi.regenerateToken()
    setStatus(s)
  }

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault()
    setCreateErr(null)
    setCreating(true)
    try {
      const id = await stockCountApi.createSession(label, categoryId ? Number(categoryId) : null)
      const [session, qr] = await Promise.all([
        stockCountApi.getSession(id),
        stockCountApi.getSessionPairingQr(id),
      ])
      if (session) setPairing({ session, qr })
      setLabel('')
      setCategoryId('')
      await loadAll()
    } catch (err) {
      setCreateErr(err instanceof Error ? err.message : 'Error al crear la sesión')
    } finally {
      setCreating(false)
    }
  }

  async function handleCancelSession(id: number) {
    if (!window.confirm('¿Cancelar esta sesión de conteo?')) return
    await stockCountApi.cancelSession(id)
    await loadAll()
  }

  async function handleDeleteSession(id: number) {
    if (!window.confirm('¿Eliminar esta sesión de conteo? Esta acción no se puede deshacer.')) return
    await stockCountApi.deleteSession(id)
    await loadAll()
  }

  if (loading) return <div className="page"><p>Cargando...</p></div>

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">📱 Conteo de stock</h1>
      </div>

      <div className="params-layout">
        {/* ── Left: estado del servidor + sesiones ── */}
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
              La primera vez que lo actives, Windows puede pedir permiso de red — permitilo para que el celular se pueda conectar.
            </span>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => { void handleRegenerateToken() }}
            style={{ marginTop: 4 }}
          >
            🔑 Regenerar token de pairing
          </button>

          <h2 className="params-form-title" style={{ marginTop: 24 }}>Sesiones</h2>

          {sessions.length === 0 ? (
            <p className="muted-text">Todavía no creaste ninguna sesión de conteo.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Sesión</th>
                  <th>Categoría</th>
                  <th>Estado</th>
                  <th className="text-right">Ítems</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id}>
                    <td>{s.label}</td>
                    <td className="muted-text">{s.webCategoryName ?? 'Todas'}</td>
                    <td><span className={`badge ${STATUS_BADGE[s.status]}`}>{STATUS_LABEL[s.status]}</span></td>
                    <td className="text-right">{s.itemCount}</td>
                    <td className="text-right">
                      {(s.status === 'uploaded' || s.status === 'reconciled') && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => navigate(`/stock/conteo/${s.id}`)}
                        >
                          {s.status === 'uploaded' ? 'Conciliar' : 'Ver'}
                        </button>
                      )}
                      {s.status === 'open' && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => { void handleCancelSession(s.id) }}
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => { void handleDeleteSession(s.id) }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Right: nueva sesión / QR de pairing ── */}
        <div className="params-form-panel">
          {pairing ? (
            <>
              <h2 className="params-form-title">Escaneá con la app Android</h2>
              <p className="muted-text">Sesión: <strong>{pairing.session.label}</strong></p>
              {pairing.qr ? (
                <img src={pairing.qr} alt="Código QR de pairing" style={{ width: 240, height: 240 }} />
              ) : (
                <p className="error">No se pudo generar el QR: no se detectó una IP de red local. Verificá que el equipo esté conectado a la red Wi-Fi/LAN.</p>
              )}
              <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setPairing(null)}>
                Listo
              </button>
            </>
          ) : (
            <>
              <h2 className="params-form-title">Nueva sesión</h2>
              <form onSubmit={e => { void handleCreateSession(e) }} className="form params-form">
                <div className="form-row">
                  <label className="label">Nombre de la sesión *</label>
                  <input
                    type="text"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    className="input"
                    placeholder="Ej: Estantería 3 - Juegos de mesa"
                    required
                  />
                </div>

                <div className="form-row">
                  <label className="label">Categoría</label>
                  <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="input">
                    <option value="">Todas las categorías</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <span className="field-hint">
                    Son las categorías de Catálogo Web. Si un producto no está publicado en la tienda online,
                    solo va a aparecer contando &quot;Todas las categorías&quot;.
                  </span>
                </div>

                {createErr && <p className="error">{createErr}</p>}

                <div className="form-actions params-form-actions">
                  <button type="submit" className="btn btn-primary" disabled={creating || !status?.running}>
                    {creating ? 'Creando...' : 'Crear sesión'}
                  </button>
                </div>
                {!status?.running && (
                  <p className="field-hint">Activá el servidor local para poder crear sesiones.</p>
                )}
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
