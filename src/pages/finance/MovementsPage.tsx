import { useEffect, useState } from 'react'
import { finance, suppliers } from '../../lib/ipc'
import { localFirstOfMonth, localToday } from '../../lib/date'
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceMovement,
  FinancePartner,
  FinancePendingAccreditation,
  FinanceTransfer,
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
  const [pending, setPending] = useState<FinancePendingAccreditation[]>([])
  const [transfers, setTransfers] = useState<FinanceTransfer[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [foundingDate, setFoundingDate] = useState<string | null>(null)

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
  const [fechaAcreditacion, setFechaAcreditacion] = useState('')
  const [partnerId, setPartnerId] = useState<number | ''>('')
  const [supplierId, setSupplierId] = useState<number | ''>('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Form de transferencia entre cuentas
  const [transferFrom, setTransferFrom] = useState<number | ''>('')
  const [transferTo, setTransferTo] = useState<number | ''>('')
  const [transferMonto, setTransferMonto] = useState('')
  const [transferFecha, setTransferFecha] = useState(localToday)
  const [transferDescripcion, setTransferDescripcion] = useState('')
  const [transferSaving, setTransferSaving] = useState(false)
  const [transferError, setTransferError] = useState<string | null>(null)

  // Acreditación manual anticipada de un pendiente
  const [accreditingId, setAccreditingId] = useState<number | null>(null)
  const [accreditDate, setAccreditDate] = useState('')
  const [accreditSaving, setAccreditSaving] = useState(false)
  const [accreditError, setAccreditError] = useState<string | null>(null)

  const categoriasDelTipo = categories.filter(c => c.appliesTo === tipo || c.appliesTo === 'ambos')
  const categoriaSeleccionada = categories.find(c => c.id === categoriaId)
  const requiereSocio = categoriaSeleccionada?.name === RETIRO_SOCIO
  const permiteProveedor = categoriaSeleccionada?.name === PAGO_PROVEEDORES

  async function loadCatalogs() {
    const [accs, cats, parts, sups, fd] = await Promise.all([
      finance.listAccounts(),
      finance.listCategories(),
      finance.listPartners(),
      suppliers.list(true),
      finance.getFoundingDate(),
    ])
    setAccounts(accs)
    setCategories(cats)
    setPartners(parts)
    setSuppliersList(sups)
    if (accs.length > 0) setAccountId(accs[0].id)
    if (accs.length > 0) setTransferFrom(accs[0].id)
    if (accs.length > 1) setTransferTo(accs[1].id)
    setFoundingDate(fd)
    setFilterDateFrom(prev => (prev < fd ? fd : prev))
    setFecha(prev => (prev < fd ? fd : prev))
    setTransferFecha(prev => (prev < fd ? fd : prev))
  }

  async function loadMovements() {
    setLoading(true)
    setError(null)
    try {
      const [data, transfersData] = await Promise.all([
        finance.listMovements({
          dateFrom: filterDateFrom,
          dateTo: filterDateTo,
          accountId: filterAccountId === '' ? undefined : filterAccountId,
          tipo: filterTipo === '' ? undefined : filterTipo,
        }),
        finance.listTransfers({
          dateFrom: filterDateFrom,
          dateTo: filterDateTo,
          accountId: filterAccountId === '' ? undefined : filterAccountId,
        }),
      ])
      setMovements(data)
      setTransfers(transfersData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar movimientos')
    } finally {
      setLoading(false)
    }
  }

  async function loadPending() {
    try {
      setPending(await finance.getPendingAccreditations())
    } catch {
      // No es crítico: si falla, el resumen de pendientes simplemente no se muestra.
    }
  }

  useEffect(() => {
    void loadCatalogs()
    void loadPending()
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
    setFechaAcreditacion('')
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
    if (fechaAcreditacion && fechaAcreditacion < fecha) {
      setSaveError('La fecha de acreditación no puede ser anterior a la fecha del movimiento')
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
        fechaAcreditacion: tipo === 'ingreso' && fechaAcreditacion ? fechaAcreditacion : null,
        partnerId: partnerId === '' ? null : partnerId,
        supplierId: supplierId === '' ? null : supplierId,
      })
      resetForm()
      await loadMovements()
      await loadPending()
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
      await loadPending()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar el movimiento')
    }
  }

  async function handleTransferSave() {
    const montoNum = parseFloat(transferMonto)
    if (transferFrom === '' || transferTo === '') {
      setTransferError('Seleccioná cuenta de origen y destino')
      return
    }
    if (transferFrom === transferTo) {
      setTransferError('La cuenta de origen y destino no pueden ser la misma')
      return
    }
    if (isNaN(montoNum) || montoNum <= 0) {
      setTransferError('El monto debe ser mayor a cero')
      return
    }

    setTransferSaving(true)
    setTransferError(null)
    try {
      await finance.createTransfer({
        fromAccountId: transferFrom,
        toAccountId: transferTo,
        monto: montoNum,
        descripcion: transferDescripcion.trim() || null,
        fecha: transferFecha,
      })
      setTransferMonto('')
      setTransferDescripcion('')
      await loadMovements()
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : 'Error al guardar la transferencia')
    } finally {
      setTransferSaving(false)
    }
  }

  async function handleDeleteTransfer(id: number) {
    try {
      await finance.deleteTransfer(id)
      await loadMovements()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar la transferencia')
    }
  }

  function startAccredit(p: FinancePendingAccreditation) {
    setAccreditingId(p.movementId)
    setAccreditDate(today < p.fechaAcreditacion ? today : p.fechaAcreditacion)
    setAccreditError(null)
  }

  function cancelAccredit() {
    setAccreditingId(null)
    setAccreditError(null)
  }

  async function confirmAccredit(p: FinancePendingAccreditation) {
    setAccreditSaving(true)
    setAccreditError(null)
    try {
      await finance.accreditMovement(p.movementId, accreditDate)
      setAccreditingId(null)
      await loadPending()
      await loadMovements()
    } catch (err) {
      setAccreditError(err instanceof Error ? err.message : 'Error al acreditar el movimiento')
    } finally {
      setAccreditSaving(false)
    }
  }

  const currency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
  const today = localToday()

  const accountName = (id: number) => accounts.find(a => a.id === id)?.name ?? '—'
  const categoryName = (id: number | null) => (id === null ? '—' : categories.find(c => c.id === id)?.name ?? '—')
  const partnerName = (id: number | null) => (id === null ? '—' : partners.find(p => p.id === id)?.name ?? '—')
  const supplierName = (id: number | null) => (id === null ? '—' : suppliersList.find(s => s.id === id)?.name ?? '—')

  const totalIngresos = movements.filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0)
  const totalEgresos = movements.filter(m => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0)

  return (
    <div className="caja-section caja-section--wide">
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
            <input
              type="date"
              value={fecha}
              min={foundingDate ?? undefined}
              onChange={e => setFecha(e.target.value)}
              className="input"
            />
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
          {tipo === 'ingreso' && (
            <div className="form-group">
              <label className="label" title="Dejar vacío si el dinero ya está disponible de inmediato">
                Fecha de acreditación (opcional)
              </label>
              <input
                type="date"
                value={fechaAcreditacion}
                min={fecha}
                onChange={e => setFechaAcreditacion(e.target.value)}
                className="input"
              />
            </div>
          )}
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

      {/* Transferencia entre cuentas */}
      <div className="caja-movement-form">
        <h3>🔁 Transferencia entre cuentas</h3>
        <div className="form-row">
          <div className="form-group">
            <label className="label">Origen</label>
            <select
              value={transferFrom}
              onChange={e => setTransferFrom(e.target.value === '' ? '' : parseInt(e.target.value))}
              className="select"
            >
              <option value="">— Seleccionar —</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id} disabled={a.id === transferTo}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Destino</label>
            <select
              value={transferTo}
              onChange={e => setTransferTo(e.target.value === '' ? '' : parseInt(e.target.value))}
              className="select"
            >
              <option value="">— Seleccionar —</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id} disabled={a.id === transferFrom}>{a.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="label">Monto</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={transferMonto}
              onChange={e => setTransferMonto(e.target.value)}
              onFocus={e => e.target.select()}
              placeholder="0.00"
              className="input"
            />
          </div>
          <div className="form-group">
            <label className="label">Fecha</label>
            <input
              type="date"
              value={transferFecha}
              min={foundingDate ?? undefined}
              onChange={e => setTransferFecha(e.target.value)}
              className="input"
            />
          </div>
          <div className="form-group form-group--grow">
            <label className="label">Descripción (opcional)</label>
            <input
              type="text"
              value={transferDescripcion}
              onChange={e => setTransferDescripcion(e.target.value)}
              placeholder="Ej: Refuerzo de caja para pago a proveedor"
              className="input"
            />
          </div>
          <div className="form-group form-group--action">
            <label className="label">&nbsp;</label>
            <button
              className="btn btn-primary"
              onClick={() => { void handleTransferSave() }}
              disabled={transferSaving}
            >
              {transferSaving ? '⏳' : '+ Transferir'}
            </button>
          </div>
        </div>
        {transferError && <p className="error">{transferError}</p>}
      </div>

      {foundingDate && (
        <p className="page-subtitle">📅 Contabilidad iniciada el {foundingDate} — no se pueden ver ni cargar movimientos anteriores.</p>
      )}

      {pending.length > 0 && (
        <div className="pending-accreditation-box">
          <h3>🕓 Pendiente de acreditación</h3>
          <table className="table table--compact">
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Monto</th>
                <th>Fecha de acreditación</th>
                <th>Descripción</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pending.map(p => (
                <tr key={p.movementId}>
                  <td>{p.accountName}</td>
                  <td>{currency(p.monto)}</td>
                  <td><span className="badge badge--warning">{p.fechaAcreditacion}</span></td>
                  <td>{p.descripcion}</td>
                  <td>
                    {accreditingId === p.movementId ? (
                      <div className="inline-accredit">
                        <input
                          type="date"
                          value={accreditDate}
                          min={p.fecha}
                          max={p.fechaAcreditacion}
                          onChange={e => setAccreditDate(e.target.value)}
                          className="input"
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => { void confirmAccredit(p) }}
                          disabled={accreditSaving}
                        >
                          {accreditSaving ? '⏳' : '✓'}
                        </button>
                        <button className="btn btn-sm" onClick={cancelAccredit} disabled={accreditSaving}>✕</button>
                      </div>
                    ) : (
                      <button className="btn btn-secondary btn-sm" onClick={() => startAccredit(p)}>
                        ✅ Acreditar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {accreditError && <p className="error">{accreditError}</p>}
        </div>
      )}

      {/* Filtros */}
      <div className="filter-bar filter-bar--wrap">
        <label>
          Desde:
          <input
            type="date"
            value={filterDateFrom}
            min={foundingDate ?? undefined}
            onChange={e => setFilterDateFrom(e.target.value)}
            className="input"
          />
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
                    <th>Acreditación</th>
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
                        {m.fechaAcreditacion ? (
                          <span className={`badge badge--${m.fechaAcreditacion > today ? 'warning' : 'success'}`}>
                            {m.fechaAcreditacion > today ? `Pendiente · ${m.fechaAcreditacion}` : `Acreditado · ${m.fechaAcreditacion}`}
                          </span>
                        ) : '—'}
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
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Transferencias entre cuentas */}
          {transfers.length > 0 && (
            <>
              <h3 className="table-section-title">🔁 Transferencias entre cuentas</h3>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Origen</th>
                      <th>Destino</th>
                      <th>Descripción</th>
                      <th>Monto</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.map(t => (
                      <tr key={t.id}>
                        <td>{t.fecha}</td>
                        <td>{accountName(t.fromAccountId)}</td>
                        <td>{accountName(t.toAccountId)}</td>
                        <td>{t.descripcion ?? '—'}</td>
                        <td>{currency(t.monto)}</td>
                        <td>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => { void handleDeleteTransfer(t.id) }}
                          >✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
