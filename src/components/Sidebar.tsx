import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

interface NavItem {
  to: string
  label: string
  icon: string
}

interface NavGroupEntry {
  kind: 'group'
  label: string
  icon: string
  prefix: string
  items: NavItem[]
}

interface NavItemEntry extends NavItem {
  kind: 'item'
}

type NavEntry = NavItemEntry | NavGroupEntry

const navEntries: NavEntry[] = [
  { kind: 'item',  to: '/dashboard', label: 'Inicio', icon: '🏠' },
  {
    kind: 'group',
    label: 'Caja',
    icon: '💰',
    prefix: '/caja',
    items: [
      { to: '/caja/apertura', label: 'Apertura', icon: '🔓' },
      { to: '/caja/cierre',   label: 'Cierre',    icon: '🔒' },
    ],
  },
  {
    kind: 'group',
    label: 'Finanzas',
    icon: '💵',
    prefix: '/finance',
    items: [
      { to: '/finance/movimientos', label: 'Movimientos', icon: '📋' },
      { to: '/finance/dashboard',   label: 'Dashboard',   icon: '📊' },
    ],
  },
  { kind: 'item', to: '/sales',       label: 'Ventas',                  icon: '🛒' },
  { kind: 'item', to: '/parameters',  label: 'Parámetros',              icon: '🔧' },
  { kind: 'item', to: '/invoicing',   label: 'Facturación',             icon: '🧾' },
  { kind: 'item', to: '/cambios',     label: 'Cambios y Devoluciones',  icon: '🔄' },
  { kind: 'item', to: '/customers',   label: 'Clientes',                icon: '👥' },
  { kind: 'item', to: '/suppliers',   label: 'Proveedores',             icon: '🏭' },
  { kind: 'item', to: '/catalog',     label: 'Catálogo',                icon: '📦' },
  {
    kind: 'group',
    label: 'Stock',
    icon: '📊',
    prefix: '/stock',
    items: [
      { to: '/stock',                label: 'Stock',                icon: '📊' },
      { to: '/stock/pedido',         label: 'Pedido de reposición', icon: '📋' },
      { to: '/stock/remito-scanner', label: 'Escáner de Remitos',   icon: '🤖' },
      { to: '/stock/conteo',         label: 'Conteo de stock',      icon: '📱' },
    ],
  },
  { kind: 'item', to: '/reporting',        label: 'Reportes',                icon: '📈' },
  { kind: 'item', to: '/web-catalog',      label: 'Catálogo Web',            icon: '🛍️' },
  { kind: 'item', to: '/web-orders',       label: 'Órdenes Web',             icon: '📬' },
  { kind: 'item', to: '/sync',             label: 'Sync Web',                icon: '🌐' },
  { kind: 'item', to: '/users',            label: 'Usuarios',                icon: '⚙️' },
  { kind: 'item', to: '/system-params',    label: 'Parámetros del sistema',  icon: '🛠️' },
  { kind: 'item', to: '/labels',           label: 'Etiquetas',               icon: '🏷️' },
  { kind: 'item', to: '/printer-settings', label: 'Impresora',               icon: '🖨️' },
  { kind: 'item', to: '/backup',           label: 'Respaldos',               icon: '💾' },
]

export default function Sidebar() {
  const location = useLocation()
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const entry of navEntries) {
      if (entry.kind === 'group') {
        initial[entry.prefix] = entry.items.some(item => location.pathname.startsWith(item.to))
      }
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
        {navEntries.map(entry => {
          if (entry.kind === 'item') {
            return (
              <NavLink
                key={entry.to}
                to={entry.to}
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? 'active' : ''}`
                }
              >
                <span className="sidebar-icon">{entry.icon}</span>
                <span className="sidebar-label">{entry.label}</span>
              </NavLink>
            )
          }

          const isOpen = openGroups[entry.prefix] ?? false
          const isGroupActive = entry.items.some(item => location.pathname.startsWith(item.to))
          return (
            <div key={entry.prefix} className="sidebar-group">
              <button
                type="button"
                className={`sidebar-nav-item sidebar-group-toggle ${isGroupActive ? 'active' : ''}`}
                onClick={() => toggleGroup(entry.prefix)}
              >
                <span className="sidebar-icon">{entry.icon}</span>
                <span className="sidebar-label">{entry.label}</span>
                <span className="sidebar-group-arrow">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div className="sidebar-group-items">
                  {entry.items.map(item => (
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
