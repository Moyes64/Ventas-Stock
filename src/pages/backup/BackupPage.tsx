import { useEffect, useState } from 'react'
import { backup as backupApi } from '../../lib/ipc'
import type { BackupInfo } from '../../types/ipc'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function BackupPage() {
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function loadBackups() {
    setLoading(true)
    try {
      const data = await backupApi.list()
      setBackups(data)
    } catch {
      setMessage({ type: 'error', text: 'Error al cargar respaldos' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadBackups() }, [])

  async function handleCreate() {
    setCreating(true)
    setMessage(null)
    try {
      const result = await backupApi.create()
      if (result.success) {
        setMessage({ type: 'success', text: `Respaldo creado: ${result.backup?.filename}` })
        await loadBackups()
      } else {
        setMessage({ type: 'error', text: result.error ?? 'Error al crear respaldo' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error' })
    } finally {
      setCreating(false)
    }
  }

  async function handleRestore(filename: string) {
    if (!window.confirm(
      `¿Restaurar la base de datos desde "${filename}"?\n\n` +
      'ADVERTENCIA: Esta acción reemplazará la base de datos actual.\n' +
      'La aplicación deberá reiniciarse después.'
    )) return

    setRestoring(filename)
    setMessage(null)
    try {
      const result = await backupApi.restore(filename)
      if (result.success) {
        setMessage({
          type: 'success',
          text: 'Base de datos restaurada. Por favor reinicie la aplicación.',
        })
      } else {
        setMessage({ type: 'error', text: result.error ?? 'Error al restaurar' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error' })
    } finally {
      setRestoring(null)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Respaldos</h1>
        <button className="btn btn-primary" onClick={() => { void handleCreate() }} disabled={creating}>
          {creating ? '⏳ Creando...' : '💾 Crear Respaldo Ahora'}
        </button>
      </div>

      {message && (
        <div className={`alert alert--${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="info-box">
        <p>
          Los respaldos son copias de la base de datos SQLite.
          Se guardan en: <code>{process.env.BACKUP_DIR ?? './backups'}</code>
        </p>
        <p>Se recomienda crear un respaldo diario y almacenarlo en un lugar seguro.</p>
      </div>

      {loading && <p>Cargando...</p>}

      {!loading && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Archivo</th>
                <th>Tamaño</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {backups.map(b => (
                <tr key={b.filename}>
                  <td><code>{b.filename}</code></td>
                  <td>{formatBytes(b.sizeBytes)}</td>
                  <td>{new Date(b.createdAt).toLocaleString('es-AR')}</td>
                  <td>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => { void handleRestore(b.filename) }}
                      disabled={restoring === b.filename}
                    >
                      {restoring === b.filename ? '⏳' : '↺ Restaurar'}
                    </button>
                  </td>
                </tr>
              ))}
              {backups.length === 0 && (
                <tr><td colSpan={4} className="empty-row">Sin respaldos. Cree uno ahora.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
