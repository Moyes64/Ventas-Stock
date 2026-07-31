import { useEffect, useState } from 'react'
import { finance, suppliers } from '../../lib/ipc'
import { localFirstOfMonth, localToday } from '../../lib/date'
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceMovement,
  FinancePartner,
  Supplier,
} from '../../types/ipc'

const RETIRO_SOCIO = 'Retiro de Socio'
const PAGO_PROVEEDORES = 'Pago a Proveedores'

export default function MovementsPage() {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [partners, setPartners] = useState<FinancePartner[]>([])
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([])
  const [movements, setMovements] = useState<FinanceMovement[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filtros
  const [filterDateFrom, setFilterDateFrom] = useState(localFirstOfMonth)
  const [filterDateTo, setFilterDateTo] = useState(localToday)
  const [filterAccountId, setFilterAccountId] = useState<number | ''>('')
  const [filterTipo, setFilterTipo] = useState<'ingreso' | 'egreso' | ''>('')

  // Form de alta
  const [accountId, setAccountId] = useState<number | ''>('')
  const [tipo, setTipo] = useState<'ingreso' | 'egreso'>('ingreso')
  const [categoriaId, setCategoriaId] = useState<number | ''>('')
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fecha, setFecha] = useState(localToday)
  const [partnerId, setPartnerId] = useState<number | ''>('')
  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const categoriasDelTipo = categories.filter(c => c.appliesTo === tipo || c.appliesTo === 'ambos')
  const categoriaSeleccionada = categories.find(c => c.id === categoriaId)
  const requiereSocio = categoriaSeleccionada?.name === RETIRO_SOCIO
  const permiteProveedor = categoriaSeleccionada?.name === PAGO_PROVEEDORES

  async function loadCatalogs() {
    const [accs, cats, parts, sups] = await Promise.all([
      finance.listAccounts(),
      finance.listCategories(),
      finance.listPartners(),
      suppliers.list(true),
    ])
    setAccounts(accs)
    setCategories(cats)
    setPartners(parts)
    setSuppliersList(sups)
    if (accs.length > 0) setAccountId(accs[0].id)
  }

  async function loadMovements() {
    setLoading(true)
    setError(null)
    try {
      const data = await finance.listMovements({
        dateFrom: filterDateFrom,
        dateTo: filterDateTo,
        accountId: filterAccountId === '' ? undefined : filterAccountId,
        tipo: filterTipo === '' ? undefined : filterTipo,
      })
      setMovements(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar movimientos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadCatalogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void loadMovements()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDateFrom, filterDateTo, filterAccountId, filterTipo])

  function resetForm() {
    setCategoriaId('')
    setMonto('')
    setDescripcion('')
    setPartnerId('')
    setSupplierId('')
  }

  async function handleSave() {
    const montoNum = parseFloat(monto)
    if (accountId === '') {
      setSaveError('Seleccioná una cuenta')
      return
    }
    if (!descripcion.trim()) {
      setSaveError('La descripción es obligatoria')
      return
    }
    if (isNaN(montoNum) || montoNum <= 0) {
      setSaveError('El monto debe ser mayor a cero')
      return
    }
    if (requiereSocio && partnerId === '') {
      setSaveError('Seleccioná el socio que realiza el retiro')
      return
    }

    setSaving(true)
    setSaveError(null)
    try {
      await finance.createMovement({
        accountId,
        tipo,
        categoriaId: categoriaId === '' ? null : categoriaId,
        monto: montoNum,
        descripcion: descripcion.trim(),
        fecha,
        partnerId: partnerId === '' ? null : partnerId,
        supplierId: supplierId === '' ? null : supplierId,
      })
      resetForm()
      await loadMovements()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error al guardar el movimiento')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    try {
      await finance.deleteMovement(id)
      await loadMovements()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar el movimiento')
    }
  }

  const currency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  const accountName = (id: number) => accounts.find(a => a.id === id)?.name ?? '—'
  const categoryName = (id: number | null) => (id === null ? '—' : categories.find(c => c.id === id)?.name ?? '—')
  const partnerName = (id: number | null) => (id === null ? '—' : partners.find(p => p.id === id)?.name ?? '—')
  const supplierName = (id: number | null) => (id === null ? '—' : suppliersList.find(s => s.id === id)?.name ?? '—')

  const totalIngresos = movements.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
  const totalEgresos = movements.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0)

  return (
    <div className="caja-section">
      <h2 className="section-title">📋 Movimientos de Ingresos y Egresos</h2>

      {/* Nuevo movimiento */}
      <div className="caja-movement-form">
        <h3>Nuevo movimiento</h3>
        <div className="form-row">
          <div className="form-group">
            <label className="label">Cuenta</label>
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value === '' ? '' : parseInt(e.target.value))}
              className="select"
            >
              <option value="">— Seleccionar —</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Tipo</label>
            <select
              value={tipo}
              onChange={e => { setTipo(e.target.value as 'ingreso' | 'egreso'); setCategoriaId('') }}
              className="select"
            >
              <option value="ingreso">↑ Ingreso</option>
              <option value="egreso">↓ Egreso</option>
            </select>
          </div>
          <div className="form-group">
            <label className="label">Categoría</label>
            <select
              value={categoriaId}
              onChange={e => setCategoriaId(e.target.value === '' ? '' : parseInt(e.target.value))}
              className="select"
            >
              <option value="">— Sin categoría —</option>
              {categoriasDelTipo.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="input" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group form-group--grow">
            <label className="label">Descripción</label>
            <input
              type="text"
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Ej: Pago alquiler local, Venta cajas de escape..."
              className="input"
            />
          </div>
          <div className="form-group">
            <label className="label">Monto</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              onFocus={e => e.target.select()}
              placeholder="0.00"
              className="input"
            />
          </div>
          {requiereSocio && (
            <div className="form-group">
              <label className="label">Socio</label>
              <select
                value={partnerId}
                onChange={e => setPartnerId(e.target.value === '' ? '' : parseInt(e.target.value))}
                className="select"
              >
                <option value="">— Seleccionar —</option>
                {partners.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.ownershipPct}%)</option>
                ))}
              </select>
            </div>
          )}
          {permiteProveedor && (
            <div className="form-group">
              <label className="label">Proveedor (opcional)</label>
              <select
                value={supplierId}
                onChange={e => setSupplierId(e.target.value === '' ? '' : parseInt(e.target.value))}
                className="select"
              >
                <option value="">— Sin proveedor —</option>
                {suppliersList.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="form-group form-group--action">
            <label className="label">&nbsp;</label>
            <button
              className="btn btn-primary"
              onClick={() => { void handleSave() }}
              disabled={saving}
            >
              {saving ? '⏳' : '+ Agregar'}
            </button>
          </div>
        </div>
        {saveError && <p className="error">{saveError}</p>}
      </div>

      {/* Filtros */}
      <div className="filter-bar filter-bar--wrap">
        <label>
          Desde:
          <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="input" />
        </label>
        <label>
          Hasta:
          <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="input" />
        </label>
        <label>
          Cuenta:
          <select
            value={filterAccountId}
            onChange={e => setFilterAccountId(e.target.value === '' ? '' : parseInt(e.target.value))}
            className="input"
          >
            <option value="">Todas</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>
        <label>
          Tipo:
          <select
            value={filterTipo}
            onChange={e => setFilterTipo(e.target.value as 'ingreso' | 'egreso' | '')}
            className="input"
          >
            <option value="">Todos</option>
            <option value="ingreso">Ingreso</option>
            <option value="egreso">Egreso</option>
          </select>
        </label>
      </div>

      {loading && <p>Cargando...</p>}
      {error && <p className="error">{error}</p>}

      {!loading && (
        <>
          {movements.length === 0 ? (
            <p className="empty-message">No hay movimientos para el período seleccionado.</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cuenta</th>
                    <th>Tipo</th>
                    <th>Categoría</th>
                    <th>Socio / Proveedor</th>
                    <th>Descripción</th>
                    <th>Monto</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map(m => (
                    <tr key={m.id}>
                      <td>{m.fecha}</td>
                      <td>{accountName(m.accountId)}</td>
                      <td>
                        <span className={`badge badge--${m.tipo === 'ingreso' ? 'success' : 'danger'}`}>
                          {m.tipo === 'ingreso' ? '↑ Ingreso' : '↓ Egreso'}
                        </span>
                      </td>
                      <td>{categoryName(m.categoriaId)}</td>
                      <td>{m.partnerId ? partnerName(m.partnerId) : m.supplierId ? supplierName(m.supplierId) : '—'}</td>
                      <td>{m.descripcion}</td>
                      <td className={m.tipo === 'egreso' ? 'text-danger' : ''}>
                        {m.tipo === 'egreso' ? '−' : '+'}{currency(m.monto)}
                      </td>
                      <td>
                        {m.saleId ? (
                          <span
                            className="text-muted"
                            title="Generado automáticamente por una venta — para revertirlo, cancelá la venta en Ventas"
                          >
                            🔒
                          </span>
                        ) : (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => { void handleDelete(m.id) }}
                          >✕</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6}><strong>Totales</strong></td>
                    <td>
                      <div>+{currency(totalIngresos)}</div>
                      <div className="text-danger">−{currency(totalEgresos)}</div>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
