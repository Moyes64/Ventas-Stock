import { NavLink, Outlet } from 'react-router-dom'

export default function CajaLayout() {
  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">💰 Caja</h1>
      </div>
      <nav className="sub-nav">
        <NavLink
          to="/caja/apertura"
          className={({ isActive }) => `sub-nav-item ${isActive ? 'active' : ''}`}
        >
          🔓 Apertura
        </NavLink>
        <NavLink
          to="/caja/cierre"
          className={({ isActive }) => `sub-nav-item ${isActive ? 'active' : ''}`}
        >
          🔒 Cierre
        </NavLink>
        <NavLink
          to="/caja/movimientos"
          className={({ isActive }) => `sub-nav-item ${isActive ? 'active' : ''}`}
        >
          📋 Movimientos
        </NavLink>
      </nav>
      <div className="sub-page">
        <Outlet />
      </div>
    </div>
  )
}
