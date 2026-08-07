import { useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import type { WebCategory, SaveWebCategoryInput } from '../types/contract'

const EMPTY_FORM: SaveWebCategoryInput = { name: '', description: '', sortOrder: 0, active: true }

export default function CategoriesView() {
  const [categories, setCategories] = useState<WebCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<SaveWebCategoryInput>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setCategories(await api.listCategories())
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al cargar categorías')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  function startEdit(cat: WebCategory) {
    setEditingId(cat.id)
    setForm({ name: cat.name, description: cat.description, sortOrder: cat.sortOrder, active: cat.active })
  }

  function startNew() {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, sortOrder: categories.length })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      if (editingId !== null) {
        await api.updateCategory(editingId, form)
      } else {
        await api.createCategory(form)
      }
      startNew()
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('¿Eliminar esta categoría? Los productos quedan sin categoría.')) return
    try {
      await api.deleteCategory(id)
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al eliminar')
    }
  }

  if (loading) return <p className="muted">Cargando...</p>

  return (
    <div className="field-row" style={{ alignItems: 'flex-start' }}>
      <div className="panel" style={{ flex: 2, minWidth: 280 }}>
        <h2>Categorías</h2>
        {error && <p className="error">{error}</p>}
        <table>
          <thead>
            <tr><th>Nombre</th><th>Orden</th><th>Activa</th><th></th></tr>
          </thead>
          <tbody>
            {categories.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.sortOrder}</td>
                <td>{c.active ? 'Sí' : 'No'}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-sm" onClick={() => startEdit(c)}>Editar</button>
                  <button className="btn btn-sm btn-danger" onClick={() => { void handleDelete(c.id) }}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="panel" style={{ flex: 1, minWidth: 260 }} onSubmit={e => { void handleSave(e) }}>
        <h2>{editingId !== null ? 'Editar categoría' : 'Nueva categoría'}</h2>
        <div className="field">
          <label>Nombre *</label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="field">
          <label>Descripción</label>
          <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Orden</label>
            <input
              type="number"
              value={form.sortOrder}
              onChange={e => setForm({ ...form, sortOrder: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label className="toggle">
              <input
                type="checkbox"
                checked={form.active}
                onChange={e => setForm({ ...form, active: e.target.checked })}
              />
              Activa
            </label>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : editingId !== null ? 'Guardar cambios' : 'Crear'}
          </button>
          {editingId !== null && (
            <button type="button" className="btn" onClick={startNew}>Cancelar</button>
          )}
        </div>
      </form>
    </div>
  )
}
