import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import { useAuth } from '../context/AuthContext'
import { canAccessPath } from '../lib/permissions'

export default function Layout() {
  const location = useLocation()
  const { user } = useAuth()

  return (
    <div className="layout">
      <Sidebar />
      <main className="main-content">
        {canAccessPath(user, location.pathname) ? (
          <Outlet />
        ) : (
          <div className="page">
            <h1 className="page-title">Sin permiso</h1>
            <p className="text-muted">
              Tu usuario no tiene acceso a esta sección. Si lo necesitás, pedile a un administrador
              que lo habilite en Usuarios &gt; Roles y permisos.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
