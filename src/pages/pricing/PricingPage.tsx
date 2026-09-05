import { useState, useEffect } from 'react'
import { pricing, suppliers } from '../../lib/ipc'
import { calcImpliedMargin } from '../../lib/pricing'
import type {
  FixedCost,
  PricingSettings,
  PricingSimulationResult,
  ProductPricingRow,
  PricingSegment,
  Supplier,
} from '../../types/ipc'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

const currency = (n: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

const SEGMENT_LABELS: Record<PricingSegment, { label: string; cls: string }> = {
  P: { label: 'P · Propia', cls: 'badge--purple' },
  A: { label: 'A · Motor', cls: 'badge--success' },
  B: { label: 'B · Regular', cls: 'badge--info' },
  C: { label: 'C · Esporádico', cls: 'badge--warning' },
}

/** Nombre del campo de margen objetivo en PricingSettings que corresponde a cada segmento. */
const SEGMENT_MARGIN_FIELD: Record<PricingSegment, keyof PricingSettings> = {
  A: 'margenObjetivoA',
  B: 'margenObjetivoB',
  C: 'margenObjetivoC',
  P: 'margenObjetivoPropio',
}

/** Por encima de este markup sugerido, el número deja de ser un precio aplicable
 *  y pasa a ser una alarma: significa que el costo fijo (o el margen objetivo)
 *  es demasiado grande para el volumen de ventas actual — no se arregla subiendo
 *  ese precio puntual, hay que revisar el % de costo fijo. */
const EXTREME_MARKUP_THRESHOLD = 150
/** Costo fijo sobre precio a partir del cual avisamos que, a este volumen,
 *  ningún margen objetivo razonable va a dar markups aplicables. */
const HIGH_FIXED_COST_PCT_THRESHOLD = 50

const DEFAULT_SETTINGS: PricingSettings = {
  margenObjetivoA: 30,
  margenObjetivoB: 30,
  margenObjetivoC: 30,
  paretoCorteAPct: 55,
  paretoCorteBPct: 80,
  proveedorPropioId: null,
  margenObjetivoPropio: 50,
}

export default function PricingPage() {
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([])
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([])
  const [newFixedCostName, setNewFixedCostName] = useState('')
  const [newFixedCostAmount, setNewFixedCostAmount] = useState('')
  const [fixedCostsError, setFixedCostsError] = useState<string | null>(null)

  const [settings, setSettings] = useState<PricingSettings>(DEFAULT_SETTINGS)
  const [ventanaDias, setVentanaDias] = useState(90)

  const [result, setResult] = useState<PricingSimulationResult | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [simulateError, setSimulateError] = useState<string | null>(null)
  const [tab, setTab] = useState<'sim' | 'dead'>('sim')
  const [applyingId, setApplyingId] = useState<number | null>(null)
  const [appliedIds, setAppliedIds] = useState<Set<number>>(new Set())
  /** IDs de finance_movements destildados manualmente en esta sesión — se
   *  excluyen del costo fijo de la simulación, sin tocar el dato real. */
  const [excludedMovementIds, setExcludedMovementIds] = useState<Set<number>>(new Set())
  /** Segmento forzado a mano por producto en esta sesión (ej: mover "Moto Vespa"
   *  fuera de Fabricación propia aunque comparta proveedor) — no toca el producto real. */
  const [segmentOverrides, setSegmentOverrides] = useState<Record<number, PricingSegment>>({})
  /** Texto en edición del precio sugerido por fila, antes de confirmarlo (blur/Enter). */
  const [priceEdits, setPriceEdits] = useState<Record<number, string>>({})

  useEffect(() => {
    void pricing.listFixedCosts().then(setFixedCosts)
    void pricing.getSettings().then(setSettings)
    void suppliers.list(true).then(setSuppliersList)
  }, [])

  async function reloadFixedCosts() {
    setFixedCosts(await pricing.listFixedCosts())
  }

  async function handleAddFixedCost() {
    const monto = parseFloat(newFixedCostAmount)
    if (!newFixedCostName.trim() || !Number.isFinite(monto) || monto < 0) {
      setFixedCostsError('Ingresá un nombre y un monto mensual válido')
      return
    }
    setFixedCostsError(null)
    try {
      await pricing.createFixedCost({ nombre: newFixedCostName.trim(), montoMensual: monto })
      setNewFixedCostName('')
      setNewFixedCostAmount('')
      await reloadFixedCosts()
    } catch (e) {
      setFixedCostsError(e instanceof Error ? e.message : String(e))
    }
  }

  async function handleToggleFixedCost(fc: FixedCost) {
    await pricing.updateFixedCost(fc.id, { activo: !fc.activo })
    await reloadFixedCosts()
    if (result) void runSimulation()
  }

  async function handleDeleteFixedCost(id: number) {
    await pricing.deleteFixedCost(id)
    await reloadFixedCosts()
    if (result) void runSimulation()
  }

  /** Corre la simulación con los parámetros actuales — se usa tanto al tocar
   *  "Simular" como al destildar un costo fijo/movimiento, cambiar el segmento
   *  de un producto, o editar un precio a mano, para que el resultado
   *  reaccione al toque sin tener que volver a apretar el botón. Los overrides
   *  opcionales evitan leer el estado de React todavía no actualizado (batching). */
  async function runSimulation(opts?: {
    excluded?: Set<number>
    settingsOverride?: PricingSettings
    segmentOverridesValue?: Record<number, PricingSegment>
  }) {
    setSimulating(true)
    setSimulateError(null)
    try {
      const effectiveSettings = opts?.settingsOverride ?? settings
      const params = {
        ...effectiveSettings,
        ventanaDias,
        excludedMovementIds: Array.from(opts?.excluded ?? excludedMovementIds),
        segmentOverrides: opts?.segmentOverridesValue ?? segmentOverrides,
      }
      const res = await pricing.simulate(params)
      setResult(res)
      if (opts?.settingsOverride) setSettings(opts.settingsOverride)
      setPriceEdits({})
    } catch (e) {
      setSimulateError(e instanceof Error ? e.message : String(e))
    } finally {
      setSimulating(false)
    }
  }

  async function handleSimulate() {
    await pricing.saveSettings(settings)
    await runSimulation()
    setAppliedIds(new Set())
    setTab('sim')
  }

  function handleToggleMovement(movementId: number) {
    setExcludedMovementIds(prev => {
      const next = new Set(prev)
      if (next.has(movementId)) next.delete(movementId)
      else next.add(movementId)
      void runSimulation({ excluded: next })
      return next
    })
  }

  function handleSegmentChange(productId: number, newSegmento: PricingSegment) {
    setSegmentOverrides(prev => {
      const next = { ...prev, [productId]: newSegmento }
      void runSimulation({ segmentOverridesValue: next })
      return next
    })
  }

  /** Al confirmar un precio sugerido editado a mano, infiere el margen
   *  objetivo que lo explica. En Fabricación propia (P) ese margen se guarda
   *  SOLO para este producto — ahí el PVP no sigue un % unificado, cada
   *  producto propio puede tener su propio margen. En A/B/C, en cambio, se
   *  aplica a TODO el segmento (ahí el % sí es unificado por diseño). */
  async function handlePriceEditCommit(row: ProductPricingRow) {
    const text = priceEdits[row.productId]
    if (text === undefined || !result) return
    const nuevoPrecio = parseFloat(text)
    if (!Number.isFinite(nuevoPrecio) || nuevoPrecio <= 0) {
      setPriceEdits(prev => {
        const next = { ...prev }
        delete next[row.productId]
        return next
      })
      return
    }
    const impliedMargin = round2(
      calcImpliedMargin(
        row.cost,
        nuevoPrecio,
        result.totals.comisionFinancieraPromedioPct,
        result.totals.costoFijoPct,
        row.taxRatePct
      )
    )
    if (row.segmento === 'P') {
      await pricing.setProductMargin(row.productId, impliedMargin)
      await runSimulation()
      return
    }
    const field = SEGMENT_MARGIN_FIELD[row.segmento]
    const newSettings = { ...settings, [field]: impliedMargin }
    await runSimulation({ settingsOverride: newSettings })
  }

  /** Vuelve un producto propio a usar el margen objetivo del grupo P, descartando su margen individual. */
  async function handleResetProductMargin(productId: number) {
    await pricing.clearProductMargin(productId)
    await runSimulation()
  }

  async function handleApply(row: ProductPricingRow) {
    if (row.markupSugeridoPct >= EXTREME_MARKUP_THRESHOLD) {
      const confirmed = window.confirm(
        `El markup sugerido para "${row.name}" es ${row.markupSugeridoPct.toFixed(0)}% — muy por encima de un precio ` +
          `de mercado aplicable. Probablemente no deberías aplicarlo tal cual (revisá primero el % de costo fijo). ` +
          `¿Aplicar de todos modos?`
      )
      if (!confirmed) return
    }
    setApplyingId(row.productId)
    try {
      await pricing.applyPrice(row.productId, row.precioSugerido)
      setAppliedIds(prev => new Set(prev).add(row.productId))
    } catch (e) {
      setSimulateError(e instanceof Error ? e.message : String(e))
    } finally {
      setApplyingId(null)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">🎯 Precio ideal de venta</h1>
      </div>
      <p className="page-subtitle">
        Simulador de precios: calcula el precio de venta que cubre comisión financiera, costo fijo prorrateado y
        el margen neto objetivo de cada grupo de productos, a partir de las ventas reales de la ventana elegida.
      </p>

      {/* ── Costos fijos manuales ─────────────────────────────────────────── */}
      <div className="form-group" style={{ marginTop: '1.5rem' }}>
        <h3>Costos fijos manuales</h3>
        <p className="text-muted" style={{ fontSize: '0.85em' }}>
          Gastos reales del negocio que todavía no están cargados en Finanzas (ej. alquiler pagado del bolsillo).
        </p>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Monto mensual</th>
                <th>Activo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {fixedCosts.map(fc => (
                <tr key={fc.id} className={!fc.activo ? 'row--disabled' : ''}>
                  <td>{fc.nombre}</td>
                  <td>{currency(fc.montoMensual)}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={fc.activo}
                      disabled={simulating}
                      onChange={() => void handleToggleFixedCost(fc)}
                    />
                  </td>
                  <td>
                    <button className="btn btn-secondary" style={{ fontSize: '0.8em' }} onClick={() => void handleDeleteFixedCost(fc.id)}>
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td>
                  <input
                    className="input"
                    placeholder="ej. Alquiler"
                    value={newFixedCostName}
                    onChange={e => setNewFixedCostName(e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    style={{ width: 140 }}
                    placeholder="0"
                    value={newFixedCostAmount}
                    onChange={e => setNewFixedCostAmount(e.target.value)}
                  />
                </td>
                <td></td>
                <td>
                  <button className="btn btn-primary" style={{ fontSize: '0.8em' }} onClick={() => void handleAddFixedCost()}>
                    + Agregar
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {fixedCostsError && <p className="error">{fixedCostsError}</p>}
      </div>

      {/* ── Parámetros de simulación ─────────────────────────────────────── */}
      <div className="form-group" style={{ marginTop: '1.5rem' }}>
        <h3>Parámetros de simulación</h3>

        <div>
          <label className="label">Ventana de ventas (días)</label>
          <input
            className="input"
            type="number"
            style={{ width: 100 }}
            value={ventanaDias}
            onChange={e => setVentanaDias(parseInt(e.target.value) || 90)}
          />
        </div>

        {/* Margen objetivo: % que se descuenta del PRECIO DE VENTA, no un markup sobre costo */}
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.75rem 1rem', marginTop: '1rem' }}>
          <strong style={{ fontSize: '0.9em' }}>Margen objetivo</strong>
          <p className="text-muted" style={{ fontSize: '0.8em', margin: '0.25rem 0 0.75rem' }}>
            % de ganancia neta sobre el <strong>precio de venta</strong> (no es un markup sobre costo — ya viene
            descontada la comisión financiera y el % de costo fijo del mismo precio). Por eso el "Markup sugerido"
            de la tabla suele ser bastante más alto que este número: mirá esa columna para ver el equivalente real
            sobre costo, que es como estaban acostumbrados a pensarlo con el 30% plano de antes.
          </p>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="label">Grupo A (%)</label>
              <input
                className="input"
                type="number"
                style={{ width: 100 }}
                value={settings.margenObjetivoA}
                onChange={e => setSettings(s => ({ ...s, margenObjetivoA: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label className="label">Grupo B (%)</label>
              <input
                className="input"
                type="number"
                style={{ width: 100 }}
                value={settings.margenObjetivoB}
                onChange={e => setSettings(s => ({ ...s, margenObjetivoB: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label className="label">Grupo C (%)</label>
              <input
                className="input"
                type="number"
                style={{ width: 100 }}
                value={settings.margenObjetivoC}
                onChange={e => setSettings(s => ({ ...s, margenObjetivoC: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label className="label">Fabricación propia — P, default (%)</label>
              <input
                className="input"
                type="number"
                style={{ width: 100 }}
                value={settings.margenObjetivoPropio}
                onChange={e => setSettings(s => ({ ...s, margenObjetivoPropio: parseFloat(e.target.value) || 0 }))}
              />
            </div>
          </div>
          <p className="text-muted" style={{ fontSize: '0.8em', margin: '0.75rem 0 0' }}>
            El margen de <strong>Fabricación propia</strong> es solo el default: cada producto propio puede tener su
            propio margen editando su "Precio sugerido" en la tabla de abajo — a diferencia de A/B/C, ese cambio no
            se aplica a todo el grupo, queda guardado individualmente para ese producto (badge 🔧).
          </p>
        </div>

        {/* Clasificación A/B/C: no tiene nada que ver con el margen, es solo para agrupar productos por facturación */}
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.75rem 1rem', marginTop: '1rem' }}>
          <strong style={{ fontSize: '0.9em' }}>Clasificación por facturación</strong>
          <p className="text-muted" style={{ fontSize: '0.8em', margin: '0.25rem 0 0.75rem' }}>
            Define qué productos de <strong>reventa</strong> caen en cada grupo (A = top vendedores hasta este % de
            la facturación de reventa acumulada, B = hasta este otro %, C = el resto). No afecta el margen — solo
            decide a qué grupo (y por lo tanto a qué % de margen objetivo, arriba) pertenece cada producto.
          </p>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="label">Corte Grupo A (% facturación acum.)</label>
              <input
                className="input"
                type="number"
                style={{ width: 90 }}
                value={settings.paretoCorteAPct}
                onChange={e => setSettings(s => ({ ...s, paretoCorteAPct: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label className="label">Corte Grupo B (% facturación acum.)</label>
              <input
                className="input"
                type="number"
                style={{ width: 90 }}
                value={settings.paretoCorteBPct}
                onChange={e => setSettings(s => ({ ...s, paretoCorteBPct: parseFloat(e.target.value) || 0 }))}
              />
            </div>
          </div>
        </div>

        {/* Fabricación propia: qué proveedor identifica los productos de marca propia */}
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.75rem 1rem', marginTop: '1rem' }}>
          <strong style={{ fontSize: '0.9em' }}>Fabricación propia</strong>
          <p className="text-muted" style={{ fontSize: '0.8em', margin: '0.25rem 0 0.75rem' }}>
            Los productos de este proveedor se sacan del grupo A/B/C (su costo es interno/nominal, no de reventa, y
            distorsiona esa clasificación) y forman su propio grupo "P", con el margen objetivo de arriba.
          </p>
          <div>
            <label className="label">Proveedor de fabricación propia</label>
            <select
              className="input"
              style={{ width: 260 }}
              value={settings.proveedorPropioId ?? ''}
              onChange={e =>
                setSettings(s => ({ ...s, proveedorPropioId: e.target.value === '' ? null : parseInt(e.target.value) }))
              }
            >
              <option value="">— Ninguno —</option>
              {suppliersList.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        <button className="btn btn-primary btn-lg" onClick={() => void handleSimulate()} disabled={simulating} style={{ marginTop: '1rem' }}>
          {simulating ? '⏳ Simulando...' : '🔍 Simular'}
        </button>
        {simulateError && <p className="error">{simulateError}</p>}
      </div>

      {/* ── Resultado ─────────────────────────────────────────────────────── */}
      {result && (
        <>
          {result.totals.costoFijoPct >= HIGH_FIXED_COST_PCT_THRESHOLD && (
            <p className="error" style={{ marginTop: '1.5rem' }}>
              ⚠️ El costo fijo se lleva el <strong>{result.totals.costoFijoPct.toFixed(0)}%</strong> de cada venta a este
              volumen. A este nivel, ningún margen objetivo razonable va a dar markups aplicables — los "precio
              sugerido" que vas a ver abajo no son para copiar, son un termómetro. Antes de tocar precios, revisá si
              el costo fijo cargado (alquiler, categorías de Finanzas) es correcto, o si el problema es de volumen de
              ventas, no de precio.
            </p>
          )}

          <div className="stats-dashboard-grid" style={{ marginTop: '1.5rem' }}>
            <div className="stat-card">
              <div className="stat-value">{currency(result.totals.facturacionVentana)}</div>
              <div className="stat-label">Facturación ventana ({result.totals.ventanaDias}d, sin IVA)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{result.totals.comisionFinancieraPromedioPct.toFixed(1)}%</div>
              <div className="stat-label">Comisión financiera promedio</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{result.totals.costoFijoPct.toFixed(1)}%</div>
              <div className="stat-label">Costo fijo sobre precio ({currency(result.totals.costoFijoMensual)}/mes)</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{result.totals.margenPonderadoActualPct.toFixed(1)}%</div>
              <div className="stat-label">Margen neto actual (ponderado)</div>
            </div>
            <div className="stat-card stat-card--total">
              <div className="stat-value">{result.totals.margenPonderadoProyectadoPct.toFixed(1)}%</div>
              <div className="stat-label">Margen neto proyectado (ponderado)</div>
            </div>
            <div className="stat-card stat-card--total">
              <div className="stat-value">{currency(result.totals.gananciaNetaProyectadaVentana)}</div>
              <div className="stat-label">Ganancia neta proyectada (ventana)</div>
            </div>
          </div>

          {/* ── Detalle del costo fijo: egresos de Finanzas que se están contando ── */}
          <div className="form-group" style={{ marginTop: '1.5rem' }}>
            <h3>Detalle: egresos de Finanzas contados como costo fijo</h3>
            <p className="text-muted" style={{ fontSize: '0.85em' }}>
              Destildá cualquiera que en realidad no corresponda (ej. algo pagado con plata propia, un gasto puntual
              que no se repite) — se excluye solo de esta simulación, no toca el movimiento real en Finanzas.
            </p>
            {result.overheadMovements.length === 0 ? (
              <p className="text-muted" style={{ fontSize: '0.85em' }}>
                No hay egresos categorizados en Finanzas dentro de esta ventana (aparte de los costos fijos manuales
                de arriba).
              </p>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Fecha</th>
                      <th>Categoría</th>
                      <th>Descripción</th>
                      <th>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.overheadMovements.map(m => (
                      <tr key={m.movementId} className={!m.included ? 'row--disabled' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={m.included}
                            disabled={simulating}
                            onChange={() => handleToggleMovement(m.movementId)}
                          />
                        </td>
                        <td>{m.fecha}</td>
                        <td>
                          <span className="badge badge--info">{m.categoriaName}</span>
                        </td>
                        <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.descripcion}>
                          {m.descripcion}
                        </td>
                        <td>{currency(m.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: '1.5rem' }}>
            <button
              className={`btn ${tab === 'sim' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTab('sim')}
            >
              Precio sugerido ({result.rows.length})
            </button>
            <button
              className={`btn ${tab === 'dead' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTab('dead')}
            >
              ⚠️ Sin movimiento ({result.deadStock.length})
            </button>
          </div>

          {tab === 'sim' && (
            <div className="table-container" style={{ marginTop: '1rem' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Seg.</th>
                    <th>Costo</th>
                    <th>Precio actual</th>
                    <th>Markup actual</th>
                    <th>Uds. ventana</th>
                    <th>Días cobertura</th>
                    <th>Precio sugerido</th>
                    <th>Markup sugerido</th>
                    <th>Δ vs. actual</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map(row => {
                    const extreme = row.markupSugeridoPct >= EXTREME_MARKUP_THRESHOLD
                    return (
                    <tr key={row.productId}>
                      <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.name}>
                        {row.name}
                      </td>
                      <td>
                        <select
                          className={`input input--select-sm badge ${SEGMENT_LABELS[row.segmento].cls}`}
                          style={{ border: 'none', fontWeight: 600 }}
                          value={row.segmento}
                          disabled={simulating}
                          onChange={e => handleSegmentChange(row.productId, e.target.value as PricingSegment)}
                        >
                          {(Object.keys(SEGMENT_LABELS) as PricingSegment[]).map(seg => (
                            <option key={seg} value={seg}>{SEGMENT_LABELS[seg].label}</option>
                          ))}
                        </select>
                      </td>
                      <td>{currency(row.cost)}</td>
                      <td>{currency(row.price)}</td>
                      <td>{row.markupActualPct.toFixed(1)}%</td>
                      <td>{row.unidadesVentana}</td>
                      <td>{row.diasCobertura ?? '—'}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="number"
                            step="1"
                            className="input input--qty"
                            style={{ width: 110, fontWeight: 600 }}
                            value={priceEdits[row.productId] ?? String(row.precioSugerido)}
                            disabled={simulating}
                            title={
                              row.segmento === 'P'
                                ? 'Editable — al confirmar, guarda un margen individual para ESTE producto (no afecta al resto del grupo)'
                                : 'Editable — al confirmar, recalcula el margen de todo el segmento a partir de este precio'
                            }
                            onChange={e => setPriceEdits(prev => ({ ...prev, [row.productId]: e.target.value }))}
                            onBlur={() => void handlePriceEditCommit(row)}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                          />
                          {row.segmento === 'P' && row.margenObjetivoIndividual !== null && (
                            <span
                              className="badge badge--purple"
                              style={{ cursor: 'pointer' }}
                              title={`Margen individual: ${row.margenObjetivoIndividual}% — click para volver al default del grupo (${settings.margenObjetivoPropio}%)`}
                              onClick={() => void handleResetProductMargin(row.productId)}
                            >
                              🔧 ↺
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {extreme ? (
                          <span className="badge badge--danger" title="No es un precio aplicable — revisá el % de costo fijo">
                            ⚠️ {row.markupSugeridoPct.toFixed(0)}%
                          </span>
                        ) : (
                          `${row.markupSugeridoPct.toFixed(1)}%`
                        )}
                      </td>
                      <td>
                        <span className={`badge ${row.deltaVsActualPct < 0 ? 'badge--danger' : 'badge--success'}`}>
                          {row.deltaVsActualPct > 0 ? '+' : ''}
                          {row.deltaVsActualPct.toFixed(1)}%
                        </span>
                      </td>
                      <td>
                        {appliedIds.has(row.productId) ? (
                          <span className="badge badge--success">✅ Aplicado</span>
                        ) : (
                          <button
                            className="btn btn-primary"
                            style={{ fontSize: '0.8em' }}
                            disabled={applyingId === row.productId}
                            onClick={() => void handleApply(row)}
                          >
                            {applyingId === row.productId ? '⏳' : 'Aplicar'}
                          </button>
                        )}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'dead' && (
            <div className="table-container" style={{ marginTop: '1rem' }}>
              <p className="text-muted" style={{ fontSize: '0.85em' }}>
                Productos activos sin ninguna venta en la ventana analizada — no reciben precio sugerido. Candidatos
                a revisión manual (liquidación/promoción), no a subir precio.
              </p>
              <table className="table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Stock</th>
                    <th>Costo unitario</th>
                    <th>Valor inmovilizado</th>
                  </tr>
                </thead>
                <tbody>
                  {result.deadStock.map(row => (
                    <tr key={row.productId}>
                      <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.name}>
                        {row.name}
                      </td>
                      <td>{row.stockQuantity}</td>
                      <td>{currency(row.cost)}</td>
                      <td>{currency(row.valorInmovilizado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
