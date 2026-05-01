import { NavLink } from 'react-router-dom'

interface NavItem {
  to: string
  label: string
  icon: string
}

const navItems: NavItem[] = [
  { to: '/dashboard',  label: 'Inicio',       icon: '🏠' },
  { to: '/sales',      label: 'Ventas',        icon: '🛒' },
  { to: '/catalog',    label: 'Catálogo',      icon: '📦' },
  { to: '/customers',  label: 'Clientes',      icon: '👥' },
  { to: '/suppliers',  label: 'Proveedores',   icon: '🏭' },
  { to: '/stock',      label: 'Stock',         icon: '📊' },
  { to: '/invoicing',  label: 'Facturación',   icon: '🧾' },
  { to: '/reporting',  label: 'Reportes',      icon: '📈' },
  { to: '/backup',     label: 'Respaldos',     icon: '💾' },
  { to: '/users',      label: 'Usuarios',      icon: '⚙️' },
]

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-logo">💼</span>
        <span className="sidebar-title">Ventas-Stock</span>
      </div>
      <nav className="sidebar-nav">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive ? 'active' : ''}`
            }
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <span className="sidebar-version">v1.0.0</span>
      </div>
    </aside>
  )
}
