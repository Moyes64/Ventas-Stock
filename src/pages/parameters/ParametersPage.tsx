import { useEffect, useState } from 'react'
import { parameters as parametersApi } from '../../lib/ipc'
import type { Parameter } from '../../types/ipc'

const EMPTY_FORM = { descripcion: '', porcentaje: '', tipo: '+' as '+' | '-' }

export default function ParametersPage() {
  const [paramList, setParamList] = useState<Parameter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selected, setSelected] = useState<Parameter | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  async function loadParameters() {
    setLoading(true)
    try {
      setParamList(await parametersApi.list())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar parámetros')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadParameters() }, [])

  function selectParameter(p: Parameter) {
    setSelected(p)
    setForm({ descripcion: p.descripcion, porcentaje: String(p.porcentaje), tipo: p.tipo })
    setFormError(null)
    setSuccessMsg(null)
  }

  function clearForm() {
    setSelected(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setSuccessMsg(null)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setSuccessMsg(null)

    const porcentaje = parseFloat(form.porcentaje)
    if (!form.descripcion.trim()) {
      setFormError('La descripción es obligatoria')
      return
    }
    if (isNaN(porcentaje)) {
      setFormError('El porcentaje debe ser un número válido')
      return
    }

    setSaving(true)
    try {
      if (selected) {
        await parametersApi.update(selected.id, { descripcion: form.descripcion.trim(), porcentaje, tipo: form.tipo })
        setSuccessMsg('Parámetro actualizado')
      } else {
        await parametersApi.create({ descripcion: form.descripcion.trim(), porcentaje, tipo: form.tipo })
        setSuccessMsg('Parámetro creado')
        clearForm()
      }
      await loadParameters()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selected) return
    if (!window.confirm(`¿Eliminar el parámetro "${selected.descripcion}"?`)) return
    setFormError(null)
    setSaving(true)
    try {
      await parametersApi.delete(selected.id)
      clearForm()
      await loadParameters()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al eliminar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Parámetros</h1>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="params-layout">
        {/* ── Left: scrollable list ── */}
        <div className="params-list-panel">
          {loading ? (
            <p>Cargando...</p>
          ) : (
            <div className="params-table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>ID</th>
                    <th>Descripción</th>
                    <th style={{ width: '50px', textAlign: 'center' }}>+/-</th>
                    <th style={{ width: '80px' }}>%</th>
                  </tr>
                </thead>
                <tbody>
                  {paramList.map(p => (
                    <tr
                      key={p.id}
                      className={selected?.id === p.id ? 'params-row--selected' : ''}
                      onClick={() => selectParameter(p)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{p.id}</td>
                      <td>{p.descripcion}</td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{p.tipo}</td>
                      <td>{p.porcentaje}</td>
                    </tr>
                  ))}
                  {paramList.length === 0 && (
                    <tr>
                      <td colSpan={4} className="empty-row">Sin parámetros</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Right: form panel ── */}
        <div className="params-form-panel">
          <h2 className="params-form-title">
            {selected ? 'Editar Parámetro' : 'Nuevo Parámetro'}
          </h2>

          <form onSubmit={e => { void handleSave(e) }} className="form params-form">
            <div className="form-row">
              <label className="label">ID</label>
              <input
                type="text"
                value={selected ? String(selected.id) : '(automático)'}
                readOnly
                className="input input--readonly"
              />
            </div>
            <div className="form-row">
              <label className="label">Descripción *</label>
              <input
                type="text"
                value={form.descripcion}
                onChange={e => setForm({ ...form, descripcion: e.target.value })}
                className="input"
                placeholder="Descripción del parámetro"
              />
            </div>
            <div className="form-row">
              <label className="label">% *</label>
              <input
                type="number"
                value={form.porcentaje}
                onChange={e => setForm({ ...form, porcentaje: e.target.value })}
                className="input"
                placeholder="0"
                step="any"
              />
            </div>
            <div className="form-row">
              <label className="label">Tipo</label>
              <div className="params-tipo-group">
                <label className="params-tipo-option">
                  <input
                    type="radio"
                    name="tipo"
                    value="+"
                    checked={form.tipo === '+'}
                    onChange={() => setForm({ ...form, tipo: '+' })}
                  />
                  <span>+ (Incremento)</span>
                </label>
                <label className="params-tipo-option">
                  <input
                    type="radio"
                    name="tipo"
                    value="-"
                    checked={form.tipo === '-'}
                    onChange={() => setForm({ ...form, tipo: '-' })}
                  />
                  <span>- (Descuento)</span>
                </label>
              </div>
            </div>

            {formError && <p className="error">{formError}</p>}
            {successMsg && <p className="params-success">{successMsg}</p>}

            <div className="form-actions params-form-actions">
              {selected && (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => { void handleDelete() }}
                  disabled={saving}
                >
                  Eliminar
                </button>
              )}
              <div className="params-spacer" />
              {selected && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={clearForm}
                  disabled={saving}
                >
                  Cancelar
                </button>
              )}
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando...' : selected ? 'Actualizar' : 'Crear'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
