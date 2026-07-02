import { useEffect, useState } from 'react'
import { customers as customersApi, credits } from '../../lib/ipc'
import type { Customer, CreditRecord } from '../../types/ipc'

export default function CustomersPage() {
  const [customerList, setCustomerList] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null)
  const [creditCustomer, setCreditCustomer] = useState<Customer | null>(null)
  const [creditBalance, setCreditBalance] = useState<number>(0)
  const [creditHistory, setCreditHistory] = useState<CreditRecord[]>([])
  const [loadingCredit, setLoadingCredit] = useState(false)

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadCustomers() }, [search])

  async function handleDelete(id: number) {
    if (!window.confirm('¿Eliminar este cliente?')) return
    try {
      await customersApi.delete(id)
      await loadCustomers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  async function handleShowCredit(c: Customer) {
    setCreditCustomer(c)
    setLoadingCredit(true)
    const [bal, hist] = await Promise.all([
      credits.getBalance(c.id),
      credits.getHistory(c.id),
    ])
    setCreditBalance(bal)
    setCreditHistory(hist)
    setLoadingCredit(false)
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const currency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  const TYPE_LABELS: Record<string, string> = {
    CAMBIO: '🔄 Cambio', DEVOLUCION: '↩️ Devolución', USO: '🛒 Uso en venta', AJUSTE: '✏️ Ajuste',
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
                <th>Crédito</th>
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
                      onClick={() => void handleShowCredit(c)}
                      title="Ver crédito"
                    >🎁</button>
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => { setEditCustomer(c); setShowForm(true) }}
                    >Editar</button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => { void handleDelete(c.id) }}
                    >Eliminar</button>
                  </td>
                </tr>
              ))}
              {customerList.length === 0 && (
                <tr><td colSpan={9} className="empty-row">Sin clientes</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <CustomerForm
          customer={editCustomer}
          onClose={() => setShowForm(false)}
          onSaved={() => { void loadCustomers() }}
        />
      )}

      {creditCustomer && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '12px', padding: '28px',
            width: '480px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '2px' }}>
                  🎁 Crédito de {creditCustomer.name}
                </h2>
                <p style={{ fontSize: '12px', color: '#6b7280' }}>Historial de movimientos</p>
              </div>
              <button onClick={() => setCreditCustomer(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9ca3af' }}>×</button>
            </div>

            <div style={{
              padding: '14px', borderRadius: '8px', marginBottom: '16px',
              backgroundColor: creditBalance > 0 ? '#f0fdf4' : '#f9fafb',
              border: `1px solid ${creditBalance > 0 ? '#86efac' : '#e5e7eb'}`,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>Saldo disponible</div>
              <div style={{ fontSize: '24px', fontWeight: 800, color: creditBalance > 0 ? '#16a34a' : '#374151' }}>
                {currency(creditBalance)}
              </div>
            </div>

            {loadingCredit ? (
              <p style={{ fontSize: '13px', color: '#9ca3af', textAlign: 'center', padding: '24px 0' }}>Cargando...</p>
            ) : creditHistory.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#9ca3af', textAlign: 'center', padding: '24px 0' }}>Sin movimientos</p>
            ) : (
              <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {creditHistory.map(rec => (
                  <div key={rec.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 10px', borderRadius: '6px', backgroundColor: '#f9fafb',
                    border: '1px solid #f3f4f6', fontSize: '12px',
                  }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{TYPE_LABELS[rec.type] ?? rec.type}</div>
                      {rec.notes && <div style={{ color: '#6b7280' }}>{rec.notes}</div>}
                      <div style={{ color: '#9ca3af' }}>{fmtDate(rec.created_at)}</div>
                    </div>
                    <div style={{
                      fontWeight: 700, fontSize: '13px',
                      color: rec.amount >= 0 ? '#16a34a' : '#dc2626',
                    }}>
                      {rec.amount >= 0 ? '+' : ''}{currency(rec.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
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
        <form onSubmit={e => { void handleSubmit(e) }} className="form">
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
