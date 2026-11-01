import type { AuthenticatedUser } from '../types/ipc'

/**
 * Sección que exige cada ruta (las claves son las de
 * electron/modules/auth/permissions.ts). Inicio no exige ninguna.
 */
const ROUTE_AREAS: Array<{ prefix: string; area: string }> = [
  { prefix: '/caja', area: 'caja' },
  { prefix: '/finance', area: 'finance' },
  { prefix: '/sales', area: 'sales' },
  { prefix: '/parameters', area: 'parameters' },
  { prefix: '/invoicing', area: 'invoicing' },
  { prefix: '/cambios', area: 'cambios' },
  { prefix: '/customers', area: 'customers' },
  { prefix: '/suppliers', area: 'suppliers' },
  { prefix: '/catalog', area: 'catalog' },
  { prefix: '/stock', area: 'stock' },
  { prefix: '/reporting', area: 'reporting' },
  { prefix: '/pricing', area: 'pricing' },
  { prefix: '/web-catalog', area: 'web_catalog' },
  { prefix: '/web-orders', area: 'web_orders' },
  { prefix: '/sync', area: 'sync' },
  { prefix: '/users', area: 'users' },
  { prefix: '/system-params', area: 'system' },
  { prefix: '/labels', area: 'labels' },
  { prefix: '/printer-settings', area: 'printer' },
  { prefix: '/backup', area: 'backup' },
]

export function areaForPath(path: string): string | null {
  return ROUTE_AREAS.find(r => path === r.prefix || path.startsWith(r.prefix + '/'))?.area ?? null
}

/** Mismo criterio que el proceso principal: el admin accede a todo. */
export function canAccessArea(user: AuthenticatedUser | null, area: string | null): boolean {
  if (!area) return true
  if (!user) return false
  if (user.role.name === 'admin') return true
  return user.permissions.some(p => p.action === 'access' && p.module === area)
}

export function canAccessPath(user: AuthenticatedUser | null, path: string): boolean {
  return canAccessArea(user, areaForPath(path))
}
