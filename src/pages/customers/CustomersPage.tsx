import { useEffect, useState } from 'react'
import { customers as customersApi } from '../../lib/ipc'
import type { Customer } from '../../types/ipc'

export default function CustomersPage() {
  const [customerList, setCustomerList] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null)

  async function loadCustomers() {
    setLoading(true)
    try {
      const data = search.length >= 2
        ? await customersApi.search(search)
        : await customersApi.list()
      setCustomerList(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar clientes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCustomers() }, [search])

  async function handleDelete(id: number) {
    if (!window.confirm('¿Eliminar este cliente?')) return
    try {
      await customersApi.delete(id)
      await loadCustomers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Clientes</h1>
        <button className="btn btn-primary" onClick={() => { setEditCustomer(null); setShowForm(true) }}>
          + Nuevo Cliente
        </button>
      </div>

      <div className="filter-bar">
        <input
          type="text"
          placeholder="Buscar por nombre, CUIT/DNI o email..."
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
                <th>Tipo Doc.</th>
                <th>CUIT/DNI</th>
                <th>Cond. IVA</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {customerList.map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.docType}</td>
                  <td>{c.cuitDni || '—'}</td>
                  <td>{c.condicionIva.replace(/_/g, ' ')}</td>
                  <td>{c.email || '—'}</td>
                  <td>{c.phone || '—'}</td>
                  <td>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => { setEditCustomer(c); setShowForm(true) }}
                    >Editar</button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDelete(c.id)}
                    >Eliminar</button>
                  </td>
                </tr>
              ))}
              {customerList.length === 0 && (
                <tr><td colSpan={7} className="empty-row">Sin clientes</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <CustomerForm
          customer={editCustomer}
          onClose={() => setShowForm(false)}
          onSaved={loadCustomers}
        />
      )}
    </div>
  )
}

function CustomerForm({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    cuitDni: customer?.cuitDni ?? '',
    docType: customer?.docType ?? 'DNI',
    condicionIva: customer?.condicionIva ?? 'CONSUMIDOR_FINAL',
    address: customer?.address ?? '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
    notes: customer?.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (customer) {
        await customersApi.update(customer.id, form)
      } else {
        await customersApi.create(form)
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
          <h2>{customer ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
          <button className="btn btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="form">
          <div className="form-row">
            <label className="label">Nombre / Razón Social *</label>
            <input
              type="text" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required className="input"
            />
          </div>
          <div className="form-row">
            <label className="label">Tipo Documento</label>
            <select value={form.docType} onChange={e => setForm({ ...form, docType: e.target.value })} className="select">
              <option value="DNI">DNI</option>
              <option value="CUIT">CUIT</option>
              <option value="CUIL">CUIL</option>
              <option value="PASAPORTE">Pasaporte</option>
              <option value="SIN_IDENTIFICAR">Sin Identificar</option>
            </select>
          </div>
          <div className="form-row">
            <label className="label">CUIT / DNI</label>
            <input
              type="text" value={form.cuitDni}
              onChange={e => setForm({ ...form, cuitDni: e.target.value })}
              className="input"
            />
          </div>
          <div className="form-row">
            <label className="label">Condición IVA</label>
            <select value={form.condicionIva} onChange={e => setForm({ ...form, condicionIva: e.target.value })} className="select">
              <option value="CONSUMIDOR_FINAL">Consumidor Final</option>
              <option value="RESPONSABLE_INSCRIPTO">Responsable Inscripto</option>
              <option value="MONOTRIBUTISTA">Monotributista</option>
              <option value="EXENTO">Exento</option>
            </select>
          </div>
          <div className="form-row">
            <label className="label">Domicilio</label>
            <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="input" />
          </div>
          <div className="form-row">
            <label className="label">Email</label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input" />
          </div>
          <div className="form-row">
            <label className="label">Teléfono</label>
            <input type="text" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="input" />
          </div>
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
