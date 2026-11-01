import { useEffect, useState } from 'react'
import { auth as authApi } from '../../lib/ipc'
import type { PermissionAreaInfo, RoleWithPermissions } from '../../types/ipc'
import { useConfirm } from '../../hooks/useConfirm'

const cleanIpcError = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : fallback

/** Usuarios > Roles y permisos: qué secciones del sistema ve cada rol. */
export default function RolesPanel() {
  const [roles, setRoles] = useState<RoleWithPermissions[]>([])
  const [areas, setAreas] = useState<PermissionAreaInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<RoleWithPermissions | 'new' | null>(null)
  const { confirm, dialog: confirmDialog } = useConfirm()

  async function loadData() {
    setLoading(true)
    try {
      const [r, a] = await Promise.all([authApi.listRolesWithPermissions(), authApi.listPermissionAreas()])
      setRoles(r)
      setAreas(a)
    } catch (err) {
      setError(cleanIpcError(err, 'Error al cargar'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, [])

  async function handleDelete(role: RoleWithPermissions) {
    if (!(await confirm(`¿Eliminar el rol ${role.name}?`, { danger: true }))) return
    try {
      setError(null)
      await authApi.deleteRole(role.id)
      await loadData()
    } catch (err) {
      setError(cleanIpcError(err, 'Error al eliminar'))
    }
  }

  const areaLabel = (key: string) => areas.find(a => a.key === key)?.label ?? key

  return (
    <>
      <div className="page-header">
        <p className="text-muted">
          Cada rol ve solo las secciones marcadas. El rol <strong>admin</strong> tiene acceso a todo y no se puede modificar.
        </p>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Nuevo Rol</button>
      </div>

      {loading && <p>Cargando...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Rol</th>
                <th>Descripción</th>
                <th>Usuarios</th>
                <th>Secciones</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {roles.map(role => {
                const isAdmin = role.name === 'admin'
                return (
                  <tr key={role.id}>
                    <td><span className="badge">{role.name}</span></td>
                    <td>{role.description}</td>
                    <td>{role.userCount}</td>
                    <td>
                      {isAdmin ? (
                        <span className="badge badge--info">Todas</span>
                      ) : role.permissions.length === 0 ? (
                        <span className="text-muted">Ninguna</span>
                      ) : (
                        <div className="role-areas">
                          {role.permissions.map(p => <span key={p.module} className="badge">{areaLabel(p.module)}</span>)}
                        </div>
                      )}
                    </td>
                    <td>
                      {!isAdmin && (
                        <>
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(role)}>Editar</button>
                          <button className="btn btn-danger btn-sm" onClick={() => { void handleDelete(role) }}>Eliminar</button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <RoleForm
          role={editing === 'new' ? null : editing}
          areas={areas}
          onClose={() => setEditing(null)}
          onSaved={() => { void loadData() }}
        />
      )}

      {confirmDialog}
    </>
  )
}

function RoleForm({
  role,
  areas,
  onClose,
  onSaved,
}: {
  role: RoleWithPermissions | null
  areas: PermissionAreaInfo[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(role?.name ?? '')
  const [description, setDescription] = useState(role?.description ?? '')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(role?.permissions.map(p => p.module) ?? []))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(key: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const data = { name, description, areas: [...selected] }
      if (role) await authApi.updateRole(role.id, data)
      else await authApi.createRole(data)
      onSaved()
      onClose()
    } catch (err) {
      setError(cleanIpcError(err, 'Error al guardar'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>{role ? `Editar rol ${role.name}` : 'Nuevo Rol'}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={e => { void handleSubmit(e) }} className="form">
          <div className="form-row">
            <label className="label">Nombre *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} required className="input" />
          </div>
          <div className="form-row">
            <label className="label">Descripción</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="input" />
          </div>
          <div className="form-row">
            <label className="label">Secciones a las que accede</label>
            <div className="role-area-grid">
              {areas.map(area => (
                <label key={area.key} className="role-area-option">
                  <input type="checkbox" checked={selected.has(area.key)} onChange={() => toggle(area.key)} />
                  <span>
                    {area.label}
                    {area.description && <span className="hint">{area.description}</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>
          {role && role.userCount > 0 && (
            <p className="hint">
              Los cambios rigen enseguida para las operaciones; el menú de quien ya inició sesión se actualiza
              al volver a entrar.
            </p>
          )}
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
