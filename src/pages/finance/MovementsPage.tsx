import { useEffect, useRef, useState } from 'react'
import { finance, suppliers } from '../../lib/ipc'
import { localFirstOfMonth, localToday, formatDate } from '../../lib/date'
import type {
  FinanceAccount,
  FinanceCategory,
  FinanceMovement,
  FinancePartner,
  FinancePartnerLoan,
  FinancePartnerLoanKind,
  FinancePendingAccreditation,
  FinanceTransfer,
  Supplier,
} from '../../types/ipc'

const PAGO_PROVEEDORES = 'Pago a Proveedores'
/** Categorías que exigen indicar el socio (plata entre los socios y el negocio). */
const SOCIO_CATEGORIAS = [
  'Retiro de Socio',
  'Préstamo a Socio',
  'Devolución de Préstamo',
  'Aporte de Socio',
  'Devolución de Aporte',
]
/** Categoría de devolución → tipo de movimiento original que cancela. */
const DEVOLUCION_KIND: Record<string, FinancePartnerLoanKind> = {
  'Devolución de Préstamo': 'prestamo',
  'Devolución de Aporte': 'aporte',
}
const DEVOLUCION_CATEGORIA: Record<FinancePartnerLoanKind, string> = {
  prestamo: 'Devolución de Préstamo',
  aporte: 'Devolución de Aporte',
}
const LOAN_KIND_LABEL: Record<FinancePartnerLoanKind, string> = {
  prestamo: 'Préstamo a socio',
  aporte: 'Aporte de socio',
}

type MovementSortKey = 'fecha' | 'cuenta' | 'tipo' | 'categoria' | 'socioProveedor' | 'descripcion' | 'monto' | 'acreditacion'

// Para agrupar al ordenar por Descripción: el ingreso de una venta y su comisión/ajuste
// asociado comparten el mismo "Venta #N" en el texto aunque no compartan sale_id (los
// ajustes de Conciliación MP no lo tienen, ver FinanceService.confirmMpReconciliationAdjustment).
// Se devuelve un string homogéneo para que el comparador genérico funcione: los que tienen
// número de venta ordenan primero por ese número (con padding para orden numérico correcto),
// el resto cae después, ordenado alfabéticamente por su propia descripción.
function descripcionSortValue(descripcion: string): string {
  const match = /venta\s*#(\d+)/i.exec(descripcion)
  return match ? `0_${match[1].padStart(10, '0')}` : `1_${descripcion}`
}

export default function MovementsPage() {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([])
  const [categories, setCategories] = useState<FinanceCategory[]>([])
  const [partners, setPartners] = useState<FinancePartner[]>([])
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([])
  const [movements, setMovements] = useState<FinanceMovement[]>([])
  const [pending, setPending] = useState<FinancePendingAccreditation[]>([])
  const [transfers, setTransfers] = useState<FinanceTransfer[]>([])
  // Préstamos a socios / aportes de socios (todos, sin filtro de fecha) con lo devuelto hasta ahora
  const [loans, setLoans] = useState<FinancePartnerLoan[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [foundingDate, setFoundingDate] = useState<string | null>(null)

  // Filtros
  const [filterDateFrom, setFilterDateFrom] = useState(localFirstOfMonth)
  const [filterDateTo, setFilterDateTo] = useState(localToday)
  const [filterAccountId, setFilterAccountId] = useState<number | ''>('')
  const [filterTipo, setFilterTipo] = useState<'ingreso' | 'egreso' | ''>('')

  // Orden de la tabla de movimientos (se activa clickeando el encabezado de la columna)
  const [sortKey, setSortKey] = useState<MovementSortKey>('fecha')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

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
  const [relatedMovementId, setRelatedMovementId] = useState<number | ''>('')
  const formRef = useRef<HTMLDivElement>(null)
  const montoRef = useRef<HTMLInputElement>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [formHighlight, setFormHighlight] = useState(false)
  const [loanBoxError, setLoanBoxError] = useState<string | null>(null)
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

  // Exportar a Excel los movimientos del período/filtros seleccionados
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)

  const categoriasDelTipo = categories.filter(c => c.appliesTo === tipo || c.appliesTo === 'ambos')
  const categoriaSeleccionada = categories.find(c => c.id === categoriaId)
  const requiereSocio = categoriaSeleccionada ? SOCIO_CATEGORIAS.includes(categoriaSeleccionada.name) : false
  const permiteProveedor = categoriaSeleccionada?.name === PAGO_PROVEEDORES
  const devolucionKind = categoriaSeleccionada ? DEVOLUCION_KIND[categoriaSeleccionada.name] : undefined
  const pendingLoans = loans.filter(l => l.saldo > 0)
  // Préstamos/aportes que se pueden elegir para la devolución: los del tipo que
  // corresponde, con saldo, y del socio elegido (si ya se eligió uno).
  const loansDevolvibles = devolucionKind
    ? pendingLoans.filter(
        l => l.kind === devolucionKind && (partnerId === '' || l.partnerId === null || l.partnerId === partnerId)
      )
    : []
  const loanById = new Map(loans.map(l => [l.movementId, l]))

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

  async function loadLoans() {
    try {
      setLoans(await finance.listPartnerLoans())
    } catch {
      // No es crítico: sin esto solo se pierden el recuadro de pendientes y los estados de devolución.
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
    void loadLoans()
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
    setRelatedMovementId('')
  }

  function selectLoan(id: number | '') {
    setRelatedMovementId(id)
    const loan = id === '' ? undefined : loanById.get(id)
    if (!loan) return
    if (loan.partnerId !== null) setPartnerId(loan.partnerId)
    setMonto(String(loan.saldo))
    if (!descripcion.trim()) {
      setDescripcion(`Devolución ${loan.kind === 'prestamo' ? 'préstamo' : 'aporte'} #${loan.movementId} — ${loan.descripcion}`)
    }
  }

  /** Precarga el form de alta con la devolución (total del saldo) de un préstamo/aporte pendiente. */
  function startDevolucion(loan: FinancePartnerLoan) {
    const categoria = categories.find(c => c.name === DEVOLUCION_CATEGORIA[loan.kind])
    if (!categoria) {
      setLoanBoxError(`No existe la categoría "${DEVOLUCION_CATEGORIA[loan.kind]}"`)
      return
    }
    setLoanBoxError(null)
    setTipo(loan.kind === 'prestamo' ? 'ingreso' : 'egreso')
    setCategoriaId(categoria.id)
    setPartnerId(loan.partnerId ?? '')
    setRelatedMovementId(loan.movementId)
    setMonto(String(loan.saldo))
    setDescripcion(`Devolución ${loan.kind === 'prestamo' ? 'préstamo' : 'aporte'} #${loan.movementId} — ${loan.descripcion}`)
    setFechaAcreditacion('')
    setSaveError(null)
    // El scroll de la app es de un contenedor interno, no de window: se lleva el
    // form a la vista, se resalta un momento y se deja el foco en el monto.
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTimeout(() => montoRef.current?.focus({ preventScroll: true }), 350)
    setFormHighlight(true)
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = setTimeout(() => setFormHighlight(false), 1500)
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
    if (devolucionKind && relatedMovementId === '') {
      setSaveError(devolucionKind === 'prestamo' ? 'Seleccioná el préstamo que se devuelve' : 'Seleccioná el aporte que se devuelve')
      return
    }
    if (requiereSocio && partnerId === '') {
      setSaveError('Seleccioná el socio')
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
        relatedMovementId: devolucionKind && relatedMovementId !== '' ? relatedMovementId : null,
      })
      resetForm()
      await loadMovements()
      await loadPending()
      await loadLoans()
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
      await loadLoans()
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

  function socioProveedorLabel(m: FinanceMovement): string {
    return m.partnerId ? partnerName(m.partnerId) : m.supplierId ? supplierName(m.supplierId) : ''
  }

  /** Estado de devolución de un préstamo/aporte, o a qué original apunta una devolución. */
  function loanStatusBadge(m: FinanceMovement) {
    if (m.relatedMovementId !== null) {
      return (
        <span className="badge badge--info" style={{ marginLeft: 6 }} title="Devolución vinculada al movimiento original">
          ↩ devuelve #{m.relatedMovementId}
        </span>
      )
    }
    const loan = loanById.get(m.id)
    if (!loan) return null
    if (loan.saldo <= 0) {
      return <span className="badge badge--success" style={{ marginLeft: 6 }}>✓ Devuelto</span>
    }
    if (loan.devuelto > 0) {
      return (
        <span className="badge badge--warning" style={{ marginLeft: 6 }}>
          Parcial · devuelto {currency(loan.devuelto)} de {currency(loan.monto)}
        </span>
      )
    }
    return <span className="badge badge--warning" style={{ marginLeft: 6 }}>Pendiente de devolución</span>
  }

  function sortValue(m: FinanceMovement, key: MovementSortKey): string | number {
    switch (key) {
      case 'fecha': return m.fecha
      case 'cuenta': return accountName(m.accountId)
      case 'tipo': return m.tipo
      case 'categoria': return categoryName(m.categoriaId)
      case 'socioProveedor': return socioProveedorLabel(m)
      case 'descripcion': return descripcionSortValue(m.descripcion)
      case 'monto': return m.monto
      case 'acreditacion': return m.fechaAcreditacion ?? ''
    }
  }

  function handleSort(key: MovementSortKey) {
    if (key === sortKey) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // Orden estable: a igualdad de valor, se conserva el orden que trajo el backend (fecha DESC, created_at DESC).
  const sortedMovements = [...movements].sort((a, b) => {
    const va = sortValue(a, sortKey)
    const vb = sortValue(b, sortKey)
    const cmp = va < vb ? -1 : va > vb ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  function sortIndicator(key: MovementSortKey): string {
    if (key !== sortKey) return ''
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }

  // ── Exportar a Excel ──────────────────────────────────────────────────────
  // Se genera un CSV separado por ';' (formato que Excel es-AR abre directo). El
  // BOM UTF-8 lo agrega el proceso principal al guardar. Se exportan los mismos
  // movimientos que se ven en pantalla, respetando filtros y orden de columnas.
  function csvCell(value: string | number): string {
    const s = String(value)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }

  // Sin símbolo ni separador de miles y con coma decimal, para que Excel lo lea como número.
  function montoCsv(n: number): string {
    return n.toFixed(2).replace('.', ',')
  }

  function buildMovementsCsv(): string {
    const headers = ['Fecha', 'Cuenta', 'Tipo', 'Categoría', 'Socio / Proveedor', 'Descripción', 'Monto', 'Acreditación']
    const rows = sortedMovements.map(m => [
      formatDate(m.fecha),
      accountName(m.accountId),
      m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso',
      m.categoriaId === null ? '' : categoryName(m.categoriaId),
      socioProveedorLabel(m),
      m.descripcion,
      montoCsv(m.tipo === 'egreso' ? -m.monto : m.monto),
      m.fechaAcreditacion
        ? `${m.fechaAcreditacion > today ? 'Pendiente' : 'Acreditado'} ${formatDate(m.fechaAcreditacion)}`
        : '',
    ])
    const totals = [
      ['', '', '', '', '', '', '', ''],
      ['Total ingresos', '', '', '', '', '', montoCsv(totalIngresos), ''],
      ['Total egresos', '', '', '', '', '', montoCsv(-totalEgresos), ''],
    ]
    return [headers, ...rows, ...totals].map(r => r.map(csvCell).join(';')).join('\r\n')
  }

  async function handleExport() {
    if (sortedMovements.length === 0) return
    setExporting(true)
    setExportMsg(null)
    try {
      const defaultName = `Movimientos_${filterDateFrom}_a_${filterDateTo}.csv`
      const result = await finance.exportMovements(buildMovementsCsv(), defaultName)
      if (result.canceled) {
        // el usuario canceló el diálogo — no hacer nada
      } else if (result.success) {
        setExportMsg(`✅ Exportado a: ${result.filePath ?? ''}`)
      } else {
        setExportMsg(`❌ ${result.error ?? 'No se pudo exportar el archivo'}`)
      }
    } catch (err) {
      setExportMsg(`❌ ${err instanceof Error ? err.message : 'No se pudo exportar el archivo'}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="caja-section caja-section--wide">
      <h2 className="section-title">📋 Movimientos de Ingresos y Egresos</h2>

      {/* Nuevo movimiento */}
      <div ref={formRef} className={`caja-movement-form${formHighlight ? ' caja-movement-form--highlight' : ''}`}>
        <h3>
          Nuevo movimiento
          {devolucionKind && relatedMovementId !== '' && (
            <span className="badge badge--info" style={{ marginLeft: 8 }}>
              ↩ devolución de {devolucionKind === 'prestamo' ? 'préstamo' : 'aporte'} #{relatedMovementId}
            </span>
          )}
        </h3>
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
              onChange={e => { setTipo(e.target.value as 'ingreso' | 'egreso'); setCategoriaId(''); setRelatedMovementId('') }}
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
              onChange={e => { setCategoriaId(e.target.value === '' ? '' : parseInt(e.target.value)); setRelatedMovementId('') }}
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
              ref={montoRef}
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
                onChange={e => {
                  const id = e.target.value === '' ? '' : parseInt(e.target.value)
                  setPartnerId(id)
                  const loan = relatedMovementId === '' ? undefined : loanById.get(relatedMovementId)
                  if (loan && loan.partnerId !== null && loan.partnerId !== id) setRelatedMovementId('')
                }}
                className="select"
              >
                <option value="">— Seleccionar —</option>
                {partners.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({p.ownershipPct}%)</option>
                ))}
              </select>
            </div>
          )}
          {devolucionKind && (
            <div className="form-group">
              <label className="label">{devolucionKind === 'prestamo' ? 'Préstamo que se devuelve' : 'Aporte que se devuelve'}</label>
              <select
                value={relatedMovementId}
                onChange={e => selectLoan(e.target.value === '' ? '' : parseInt(e.target.value))}
                className="select"
              >
                <option value="">
                  {loansDevolvibles.length === 0 ? '— No hay pendientes —' : '— Seleccionar —'}
                </option>
                {loansDevolvibles.map(l => (
                  <option key={l.movementId} value={l.movementId}>
                    #{l.movementId} · {formatDate(l.fecha)} · {l.partnerName ?? 'sin socio'} · {l.descripcion} · saldo {currency(l.saldo)}
                  </option>
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
        <p className="page-subtitle">📅 Contabilidad iniciada el {formatDate(foundingDate)} — no se pueden ver ni cargar movimientos anteriores.</p>
      )}

      {pendingLoans.length > 0 && (
        <div className="pending-accreditation-box">
          <h3>🤝 Préstamos y aportes de socios pendientes de devolución</h3>
          <table className="table table--compact">
            <thead>
              <tr>
                <th>#</th>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Socio</th>
                <th>Descripción</th>
                <th>Monto</th>
                <th>Devuelto</th>
                <th>Saldo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pendingLoans.map(l => (
                <tr key={l.movementId}>
                  <td>{l.movementId}</td>
                  <td>{formatDate(l.fecha)}</td>
                  <td title={l.kind === 'prestamo' ? 'El socio le debe al negocio' : 'El negocio le debe al socio'}>
                    {LOAN_KIND_LABEL[l.kind]}
                  </td>
                  <td>{l.partnerName ?? <span className="text-danger" title="Asignale el socio a este aporte">sin socio</span>}</td>
                  <td>{l.descripcion}</td>
                  <td>{currency(l.monto)}</td>
                  <td>{currency(l.devuelto)}</td>
                  <td><strong>{currency(l.saldo)}</strong></td>
                  <td>
                    {devolucionKind && relatedMovementId === l.movementId ? (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => startDevolucion(l)}
                        title="Ya está cargada en el formulario de arriba: revisá el monto y tocá + Agregar"
                      >
                        ↑ En el formulario
                      </button>
                    ) : (
                      <button className="btn btn-secondary btn-sm" onClick={() => startDevolucion(l)}>
                        ↩ Registrar devolución
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loanBoxError && <p className="error">{loanBoxError}</p>}
        </div>
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
                  <td><span className="badge badge--warning">{formatDate(p.fechaAcreditacion)}</span></td>
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
        <button
          className="btn btn-secondary"
          style={{ marginLeft: 'auto' }}
          onClick={() => { void handleExport() }}
          disabled={exporting || movements.length === 0}
          title="Exportar a Excel los movimientos del período y filtros seleccionados"
        >
          {exporting ? '⏳ Exportando...' : '📊 Exportar a Excel'}
        </button>
      </div>

      {exportMsg && <p className="page-subtitle">{exportMsg}</p>}

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
                    <th className="sortable-th" onClick={() => handleSort('fecha')} title="Ordenar por fecha">Fecha{sortIndicator('fecha')}</th>
                    <th className="sortable-th" onClick={() => handleSort('cuenta')} title="Ordenar por cuenta">Cuenta{sortIndicator('cuenta')}</th>
                    <th className="sortable-th" onClick={() => handleSort('tipo')} title="Ordenar por tipo">Tipo{sortIndicator('tipo')}</th>
                    <th className="sortable-th" onClick={() => handleSort('categoria')} title="Ordenar por categoría">Categoría{sortIndicator('categoria')}</th>
                    <th className="sortable-th" onClick={() => handleSort('socioProveedor')} title="Ordenar por socio/proveedor">Socio / Proveedor{sortIndicator('socioProveedor')}</th>
                    <th className="sortable-th" onClick={() => handleSort('descripcion')} title="Ordenar por Venta # (agrupa venta y comisión/ajuste asociados)">Descripción{sortIndicator('descripcion')}</th>
                    <th className="sortable-th" onClick={() => handleSort('monto')} title="Ordenar por monto">Monto{sortIndicator('monto')}</th>
                    <th className="sortable-th" onClick={() => handleSort('acreditacion')} title="Ordenar por acreditación">Acreditación{sortIndicator('acreditacion')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMovements.map(m => (
                    <tr key={m.id}>
                      <td>{formatDate(m.fecha)}</td>
                      <td>{accountName(m.accountId)}</td>
                      <td>
                        <span className={`badge badge--${m.tipo === 'ingreso' ? 'success' : 'danger'}`}>
                          {m.tipo === 'ingreso' ? '↑ Ingreso' : '↓ Egreso'}
                        </span>
                      </td>
                      <td>{categoryName(m.categoriaId)}</td>
                      <td>{socioProveedorLabel(m) || '—'}</td>
                      <td>
                        {m.descripcion}
                        {loanStatusBadge(m)}
                      </td>
                      <td className={m.tipo === 'egreso' ? 'text-danger' : ''}>
                        {m.tipo === 'egreso' ? '−' : '+'}{currency(m.monto)}
                      </td>
                      <td>
                        {m.fechaAcreditacion ? (
                          <span className={`badge badge--${m.fechaAcreditacion > today ? 'warning' : 'success'}`}>
                            {m.fechaAcreditacion > today ? `Pendiente · ${formatDate(m.fechaAcreditacion)}` : `Acreditado · ${formatDate(m.fechaAcreditacion)}`}
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
                        <td>{formatDate(t.fecha)}</td>
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
