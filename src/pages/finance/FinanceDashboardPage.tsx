import { useEffect, useState } from 'react'
import { finance } from '../../lib/ipc'
import { localFirstOfMonth, localToday } from '../../lib/date'
import type {
  FinanceAccountBalance,
  FinanceCashFlowPoint,
  FinanceCategoryExpense,
  FinancePartnerEquity,
} from '../../types/ipc'
import { PieChart } from '../../components/charts/PieChart'

export default function FinanceDashboardPage() {
  const [balances, setBalances] = useState<FinanceAccountBalance[]>([])
  const [cashFlow, setCashFlow] = useState<FinanceCashFlowPoint[]>([])
  const [expenses, setExpenses] = useState<FinanceCategoryExpense[]>([])
  const [equity, setEquity] = useState<FinancePartnerEquity[]>([])
  const [dateFrom, setDateFrom] = useState(localFirstOfMonth)
  const [dateTo, setDateTo] = useState(localToday)
  const [groupBy, setGroupBy] = useState<'day' | 'month'>('month')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [b, cf, ex, eq] = await Promise.all([
        finance.getAccountBalances(),
        finance.getCashFlowSummary(dateFrom, dateTo, groupBy),
        finance.getExpensesByCategory(dateFrom, dateTo),
        finance.getPartnersEquity(),
      ])
      setBalances(b)
      setCashFlow(cf)
      setExpenses(ex)
      setEquity(eq)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el dashboard de finanzas')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, groupBy])

  const currency = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)

  const totalBalance = balances.reduce((s, b) => s + b.balance, 0)

  return (
    <div className="caja-section">
      <h2 className="section-title">📊 Dashboard de Finanzas</h2>

      {error && <p className="error">{error}</p>}

      {/* Saldo por cuenta */}
      <h3>Saldo actual por cuenta</h3>
      <div className="stats-grid">
        {balances.map(b => (
          <div key={b.accountId} className={`stat-card ${b.balance < 0 ? 'stat-card--warning' : ''}`}>
            <div className="stat-value">{currency(b.balance)}</div>
            <div className="stat-label">{b.accountName}</div>
          </div>
        ))}
        <div className="stat-card stat-card--total">
          <div className="stat-value">{currency(totalBalance)}</div>
          <div className="stat-label">Total</div>
        </div>
      </div>

      {/* Filtros de período */}
      <div className="filter-bar filter-bar--wrap">
        <label>
          Desde:
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input" />
        </label>
        <label>
          Hasta:
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input" />
        </label>
        <label>
          Agrupar por:
          <select value={groupBy} onChange={e => setGroupBy(e.target.value as 'day' | 'month')} className="select">
            <option value="month">Mes</option>
            <option value="day">Día</option>
          </select>
        </label>
        <button onClick={() => { void loadAll() }} className="btn btn-secondary">🔍 Actualizar</button>
      </div>

      {loading && <p>Cargando...</p>}

      {/* Flujo de ingresos/egresos */}
      {!loading && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Período</th>
                <th>Ingresos</th>
                <th>Egresos</th>
                <th>Neto</th>
              </tr>
            </thead>
            <tbody>
              {cashFlow.map(p => (
                <tr key={p.period}>
                  <td>{p.period}</td>
                  <td>{currency(p.ingresos)}</td>
                  <td className="text-danger">{currency(p.egresos)}</td>
                  <td className={p.neto < 0 ? 'text-danger' : ''}>{currency(p.neto)}</td>
                </tr>
              ))}
              {cashFlow.length === 0 && (
                <tr><td colSpan={4} className="empty-row">Sin datos para el período seleccionado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Egresos por categoría */}
      {!loading && (
        <div className="ranking-charts">
          <PieChart
            items={expenses.map(e => ({ label: e.categoriaName, value: e.total }))}
            label="💸 Egresos por categoría"
          />
        </div>
      )}

      {/* Patrimonio y retiros por socio */}
      <h3>Patrimonio y retiros por socio</h3>
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Socio</th>
              <th>% Participación</th>
              <th>Utilidad acumulada</th>
              <th>Retiros realizados</th>
              <th>Saldo pendiente</th>
            </tr>
          </thead>
          <tbody>
            {equity.map(p => (
              <tr key={p.partnerId}>
                <td>{p.partnerName}</td>
                <td>{p.ownershipPct}%</td>
                <td>{currency(p.utilidadAcumulada)}</td>
                <td>{currency(p.retirosRealizados)}</td>
                <td className={p.saldoPendiente < 0 ? 'text-danger' : ''}>{currency(p.saldoPendiente)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
