import { useEffect, useState } from 'react'
import { auth as authApi } from '../../lib/ipc'
import type { User, Role } from '../../types/ipc'

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)

  async function loadData() {
    setLoading(true)
    try {
      const [u, r] = await Promise.all([authApi.listUsers(), authApi.listRoles()])
      setUsers(u)
      setRoles(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, [])

  async function handleToggleActive(user: User) {
    try {
      await authApi.updateUser(user.id, { active: !user.active } as Partial<User>)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar')
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('¿Eliminar este usuario?')) return
    try {
      await authApi.deleteUser(id)
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  const getRoleName = (roleId: number) =>
    roles.find(r => r.id === roleId)?.name ?? String(roleId)

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Usuarios</h1>
        <button className="btn btn-primary" onClick={() => { setEditUser(null); setShowForm(true) }}>
          + Nuevo Usuario
        </button>
      </div>

      {loading && <p>Cargando...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Creado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className={!u.active ? 'row--inactive' : ''}>
                  <td><code>{u.username}</code></td>
                  <td>{u.name}</td>
                  <td><span className="badge">{getRoleName(u.roleId)}</span></td>
                  <td>
                    <span className={u.active ? 'badge badge--success' : 'badge badge--danger'}>
                      {u.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>{new Date(u.createdAt).toLocaleDateString('es-AR')}</td>
                  <td>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => { setEditUser(u); setShowForm(true) }}
                    >Editar</button>
                    <button
                      className={`btn btn-sm ${u.active ? 'btn-warning' : 'btn-secondary'}`}
                      onClick={() => { void handleToggleActive(u) }}
                    >
                      {u.active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => { void handleDelete(u.id) }}
                    >Eliminar</button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={6} className="empty-row">Sin usuarios</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <UserForm
          user={editUser}
          roles={roles}
          onClose={() => setShowForm(false)}
          onSaved={() => { void loadData() }}
        />
      )}
    </div>
  )
}

function UserForm({
  user,
  roles,
  onClose,
  onSaved,
}: {
  user: User | null
  roles: Role[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    username: user?.username ?? '',
    name: user?.name ?? '',
    roleId: user?.roleId ?? roles[0]?.id ?? 1,
    password: '',
    confirmPassword: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user && !form.password) {
      setError('La contraseña es obligatoria para nuevos usuarios')
      return
    }
    if (form.password && form.password !== form.confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (user) {
        const update: Record<string, unknown> = { name: form.name, roleId: form.roleId }
        if (form.password) update.password = form.password
        await authApi.updateUser(user.id, update as Partial<User>)
      } else {
        await authApi.createUser({
          username: form.username,
          name: form.name,
          roleId: form.roleId,
          password: form.password,
          active: true,
        } as User & { password: string })
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>{user ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={e => { void handleSubmit(e) }} className="form">
          <div className="form-row">
            <label className="label">Usuario *</label>
            <input
              type="text" value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })}
              required disabled={!!user} className="input"
            />
          </div>
          <div className="form-row">
            <label className="label">Nombre completo *</label>
            <input
              type="text" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required className="input"
            />
          </div>
          <div className="form-row">
            <label className="label">Rol *</label>
            <select value={form.roleId} onChange={e => setForm({ ...form, roleId: Number(e.target.value) })} className="select">
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label className="label">{user ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}</label>
            <input
              type="password" value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              required={!user} className="input"
            />
          </div>
          {form.password && (
            <div className="form-row">
              <label className="label">Confirmar contraseña</label>
              <input
                type="password" value={form.confirmPassword}
                onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                className="input"
              />
            </div>
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
