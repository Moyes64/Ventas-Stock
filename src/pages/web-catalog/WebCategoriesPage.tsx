import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { webCatalog } from '../../lib/ipc'
import type { WebCategory } from '../../types/ipc'

const EMPTY = { name: '', description: '', sortOrder: 0, active: true }

export default function WebCategoriesPage() {
  const navigate = useNavigate()
  const [categories, setCats] = useState<WebCategory[]>([])
  const [editing, setEditing]  = useState<WebCategory | null>(null)
  const [form, setForm]        = useState(EMPTY)
  const [saving, setSaving]    = useState(false)
  const [error, setError]      = useState<string | null>(null)

  async function load() {
    setCats(await webCatalog.listCategories())
  }

  useEffect(() => { void load() }, [])

  function startAdd() {
    setEditing(null)
    setForm(EMPTY)
    setError(null)
  }

  function startEdit(c: WebCategory) {
    setEditing(c)
    setForm({ name: c.name, description: c.description, sortOrder: c.sortOrder, active: c.active })
    setError(null)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('El nombre es obligatorio.'); return }
    setSaving(true)
    setError(null)
    try {
      await webCatalog.saveCategory(editing?.id ?? null, form)
      setEditing(null)
      setForm(EMPTY)
      void load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar esta categoría? Los productos quedarán sin categoría.')) return
    await webCatalog.deleteCategory(id)
    void load()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button className="btn btn-ghost" onClick={() => navigate('/web-catalog')}>← Volver</button>
          <h1 className="page-title" style={{ display: 'inline', marginLeft: 12 }}>🗂️ Categorías Web</h1>
        </div>
        <button className="btn btn-primary" onClick={startAdd}>+ Nueva categoría</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24 }}>

        {/* Lista */}
        <div>
          {categories.length === 0 ? (
            <div className="empty-state"><p>No hay categorías creadas.</p></div>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Nombre</th><th>Descripción</th><th>Orden</th><th>Estado</th><th></th></tr>
              </thead>
              <tbody>
                {categories.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong><br /><small className="muted">{c.slug}</small></td>
                    <td><small className="muted">{c.description || '—'}</small></td>
                    <td>{c.sortOrder}</td>
                    <td><span className={c.active ? 'badge badge--success' : 'badge badge--neutral'}>{c.active ? 'Activa' : 'Inactiva'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => startEdit(c)}>Editar</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => void handleDelete(c.id)}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Formulario */}
        <div className="sysparam-section">
          <h2 className="sysparam-section-title">{editing ? `Editar: ${editing.name}` : 'Nueva categoría'}</h2>
          <div className="form-group">
            <label className="label">Nombre *</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Rompecabezas" />
          </div>
          <div className="form-group">
            <label className="label">Descripción</label>
            <input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Breve descripción de la categoría" />
          </div>
          <div className="form-group">
            <label className="label">Orden en el menú</label>
            <input className="input" type="number" min={0} value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} />
          </div>
          <div className="form-group">
            <label className="wc-switch-label">
              <input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} className="wc-switch-input" />
              <span className="wc-switch"></span>
              <span>Categoría activa</span>
            </label>
          </div>
          {error && <p className="error">{error}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Guardando...' : '💾 Guardar'}
            </button>
            {editing && <button className="btn btn-ghost" onClick={() => { setEditing(null); setForm(EMPTY) }}>Cancelar</button>}
          </div>
        </div>

      </div>
    </div>
  )
}
