import { useEffect, useState } from 'react'
import { principal as principalApi } from '../../lib/ipc'
import type { PrincipalStatus } from '../../types/ipc'
import { useConfirm } from '../../hooks/useConfirm'
import { formatDateTime } from '../../lib/date'

/**
 * Parámetros del sistema > PC principal: la única que sincroniza con la web,
 * arranca los servidores locales y factura con AFIP.
 */
export default function PrincipalPcSection() {
  const [status, setStatus] = useState<PrincipalStatus | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { confirm, dialog: confirmDialog } = useConfirm()

  useEffect(() => {
    void principalApi.getStatus().then(setStatus)
  }, [])

  async function handleSetPrincipal() {
    if (!status) return
    const message = status.principalName
      ? `¿Hacer principal a esta PC (${status.machineName})? ${status.principalName} deja de sincronizar con la web y de facturar con AFIP. Esta PC tiene que tener los certificados de AFIP.`
      : `¿Hacer principal a esta PC (${status.machineName})? Va a sincronizar con la web y facturar con AFIP: tiene que tener los certificados de AFIP.`
    if (!(await confirm(message))) return
    setSaving(true)
    setError(null)
    try {
      setStatus(await principalApi.setThisAsPrincipal())
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (!status) return null

  return (
    <div className="sysparam-section">
      <h2 className="sysparam-section-title">🖥️ PC principal</h2>
      <p className="text-muted">
        La PC principal es la única que sincroniza con la web, atiende el conteo de stock con el celular y factura con AFIP.
      </p>
      {!status.sharedDb ? (
        <p>Esta PC usa la base de datos local: es la PC principal.</p>
      ) : (
        <>
          <p>Esta PC: <strong>{status.machineName}</strong></p>
          <p>
            PC principal:{' '}
            {status.principalName ? (
              <strong>{status.principalName}</strong>
            ) : (
              <strong className="text-danger">ninguna — elegí una para sincronizar y facturar</strong>
            )}
            {status.principalSince && <span className="text-muted"> (desde {formatDateTime(status.principalSince)})</span>}
          </p>
          {status.isPrincipal ? (
            <span className="badge badge--success">Esta PC es la principal</span>
          ) : (
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => { void handleSetPrincipal() }}>
              {saving ? 'Guardando...' : 'Hacer principal a esta PC'}
            </button>
          )}
          {error && <p className="error">{error}</p>}
        </>
      )}
      {confirmDialog}
    </div>
  )
}
