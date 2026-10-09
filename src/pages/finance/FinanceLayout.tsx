import { NavLink, Outlet } from 'react-router-dom'

export default function FinanceLayout() {
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">💵 Finanzas</h1>
      </div>
      <nav className="sub-nav">
        <NavLink
          to="/finance/movimientos"
          className={({ isActive }) => `sub-nav-item ${isActive ? 'active' : ''}`}
        >
          📋 Movimientos
        </NavLink>
        <NavLink
          to="/finance/dashboard"
          className={({ isActive }) => `sub-nav-item ${isActive ? 'active' : ''}`}
        >
          📊 Dashboard
        </NavLink>
        <NavLink
          to="/finance/comisiones-mp"
          className={({ isActive }) => `sub-nav-item ${isActive ? 'active' : ''}`}
        >
          💳 Comisiones MP
        </NavLink>
        <NavLink
          to="/finance/comisiones-fiserv"
          className={({ isActive }) => `sub-nav-item ${isActive ? 'active' : ''}`}
        >
          🟢 Comisiones FISERV
        </NavLink>
        <NavLink
          to="/finance/conciliacion-mp"
          className={({ isActive }) => `sub-nav-item ${isActive ? 'active' : ''}`}
        >
          🔍 Conciliación MP
        </NavLink>
        <NavLink
          to="/finance/feriados"
          className={({ isActive }) => `sub-nav-item ${isActive ? 'active' : ''}`}
        >
          📅 Feriados
        </NavLink>
      </nav>
      <div className="sub-page">
        <Outlet />
      </div>
    </div>
  )
}
