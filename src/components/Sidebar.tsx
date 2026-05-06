import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

interface NavItem {
  to: string
  label: string
  icon: string
}

interface NavGroup {
  label: string
  icon: string
  prefix: string
  items: NavItem[]
}

const navItems: NavItem[] = [
  { to: '/dashboard',   label: 'Inicio',       icon: '🏠' },
  { to: '/sales',       label: 'Ventas',        icon: '🛒' },
  { to: '/catalog',     label: 'Catálogo',      icon: '📦' },
  { to: '/customers',   label: 'Clientes',      icon: '👥' },
  { to: '/suppliers',   label: 'Proveedores',   icon: '🏭' },
  { to: '/stock',       label: 'Stock',         icon: '📊' },
  { to: '/invoicing',   label: 'Facturación',   icon: '🧾' },
  { to: '/reporting',   label: 'Reportes',      icon: '📈' },
  { to: '/backup',      label: 'Respaldos',     icon: '💾' },
  { to: '/users',       label: 'Usuarios',      icon: '⚙️' },
  { to: '/parameters',  label: 'Parámetros',    icon: '🔧' },
]

const navGroups: NavGroup[] = [
  {
    label: 'Caja',
    icon: '💰',
    prefix: '/caja',
    items: [
      { to: '/caja/apertura',    label: 'Apertura',    icon: '🔓' },
      { to: '/caja/cierre',      label: 'Cierre',      icon: '🔒' },
      { to: '/caja/movimientos', label: 'Movimientos', icon: '📋' },
    ],
  },
]

export default function Sidebar() {
  const location = useLocation()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const group of navGroups) {
      initial[group.prefix] = location.pathname.startsWith(group.prefix)
    }
    return initial
  })

  function toggleGroup(prefix: string) {
    setOpenGroups(prev => ({ ...prev, [prefix]: !prev[prefix] }))
  }

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

        {navGroups.map(group => {
          const isOpen = openGroups[group.prefix] ?? false
          const isGroupActive = location.pathname.startsWith(group.prefix)
          return (
            <div key={group.prefix} className="sidebar-group">
              <button
                type="button"
                className={`sidebar-nav-item sidebar-group-toggle ${isGroupActive ? 'active' : ''}`}
                onClick={() => toggleGroup(group.prefix)}
              >
                <span className="sidebar-icon">{group.icon}</span>
                <span className="sidebar-label">{group.label}</span>
                <span className="sidebar-group-arrow">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div className="sidebar-group-items">
                  {group.items.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `sidebar-nav-item sidebar-nav-item--sub ${isActive ? 'active' : ''}`
                      }
                    >
                      <span className="sidebar-icon">{item.icon}</span>
                      <span className="sidebar-label">{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>
      <div className="sidebar-footer">
        <span className="sidebar-version">v1.0.0</span>
      </div>
    </aside>
  )
}
