import { useEffect, useState } from 'react'
import { suppliers as suppliersApi } from '../../lib/ipc'
import type { Supplier } from '../../types/ipc'

export default function SuppliersPage() {
  const [supplierList, setSupplierList] = useState<Supplier[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null)

  async function loadSuppliers() {
    setLoading(true)
    try {
      const data = search.length >= 2
        ? await suppliersApi.search(search)
        : await suppliersApi.list()
      setSupplierList(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar proveedores')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSuppliers() }, [search])

  async function handleDelete(id: number) {
    if (!window.confirm('¿Desactivar este proveedor?')) return
    try {
      await suppliersApi.delete(id)
      await loadSuppliers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Proveedores</h1>
        <button className="btn btn-primary" onClick={() => { setEditSupplier(null); setShowForm(true) }}>
          + Nuevo Proveedor
        </button>
      </div>

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Buscar por nombre, CUIT o email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input input--search"
        />
      </div>

      {loading && <p>Cargando...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>CUIT</th>
                <th>Contacto</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {supplierList.map(s => (
                <tr key={s.id} className={!s.active ? 'row--inactive' : ''}>
                  <td>{s.name}</td>
                  <td>{s.cuit || '—'}</td>
                  <td>{s.contact || '—'}</td>
                  <td>{s.email || '—'}</td>
                  <td>{s.phone || '—'}</td>
                  <td>
                    <span className={s.active ? 'badge badge--success' : 'badge badge--danger'}>
                      {s.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditSupplier(s); setShowForm(true) }}>Editar</button>
                    {s.active && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.id)}>Desactivar</button>
                    )}
                  </td>
                </tr>
              ))}
              {supplierList.length === 0 && (
                <tr><td colSpan={7} className="empty-row">Sin proveedores</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <SupplierForm
          supplier={editSupplier}
          onClose={() => setShowForm(false)}
          onSaved={loadSuppliers}
        />
      )}
    </div>
  )
}

function SupplierForm({
  supplier,
  onClose,
  onSaved,
}: {
  supplier: Supplier | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: supplier?.name ?? '',
    cuit: supplier?.cuit ?? '',
    address: supplier?.address ?? '',
    email: supplier?.email ?? '',
    phone: supplier?.phone ?? '',
    contact: supplier?.contact ?? '',
    notes: supplier?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (supplier) {
        await suppliersApi.update(supplier.id, form)
      } else {
        await suppliersApi.create(form)
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
          <h2>{supplier ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="form">
          {[
            { label: 'Nombre / Razón Social *', key: 'name', required: true },
            { label: 'CUIT', key: 'cuit' },
            { label: 'Domicilio', key: 'address' },
            { label: 'Email', key: 'email' },
            { label: 'Teléfono', key: 'phone' },
            { label: 'Nombre de Contacto', key: 'contact' },
          ].map(field => (
            <div key={field.key} className="form-row">
              <label className="label">{field.label}</label>
              <input
                type="text"
                value={form[field.key as keyof typeof form]}
                onChange={e => setForm({ ...form, [field.key]: e.target.value })}
                required={field.required}
                className="input"
              />
            </div>
          ))}
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
