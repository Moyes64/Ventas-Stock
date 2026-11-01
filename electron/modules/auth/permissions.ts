/**
 * Secciones del sistema a las que se les puede dar acceso por rol. Es la lista
 * fija de "qué se puede permitir"; qué rol tiene cada una se guarda en la
 * tabla permissions (module = key, action = 'access') y se edita desde
 * Usuarios > Roles y permisos. El rol admin tiene acceso a todo.
 *
 * Al agregar una sección nueva al menú: sumarla acá, a la ruta en
 * src/lib/permissions.ts y, si tiene canales IPC propios, a CHANNEL_ACCESS.
 */
export const PERMISSION_AREAS = [
  { key: 'caja', label: 'Caja', description: 'Apertura y cierre de caja' },
  { key: 'finance', label: 'Finanzas', description: 'Movimientos, saldos, comisiones, feriados y conciliación' },
  { key: 'sales', label: 'Ventas', description: 'Nueva venta y listado de ventas' },
  { key: 'parameters', label: 'Parámetros', description: 'Descuentos y recargos' },
  { key: 'invoicing', label: 'Facturación', description: 'Comprobantes, CAE y envío por mail' },
  { key: 'cambios', label: 'Cambios y Devoluciones', description: '' },
  { key: 'customers', label: 'Clientes', description: '' },
  { key: 'suppliers', label: 'Proveedores', description: '' },
  { key: 'catalog', label: 'Catálogo', description: 'Productos, precios y %Markup' },
  { key: 'stock', label: 'Stock', description: 'Stock, reposición, escáner de remitos, actualizar precios y conteo' },
  { key: 'reporting', label: 'Reportes', description: '' },
  { key: 'pricing', label: 'Precio ideal de venta', description: '' },
  { key: 'web_catalog', label: 'Catálogo Web', description: 'Productos, categorías y banners de la web' },
  { key: 'web_orders', label: 'Órdenes Web', description: 'Pedidos de la web' },
  { key: 'sync', label: 'Sync Web', description: 'Sincronización con la web' },
  { key: 'users', label: 'Usuarios y roles', description: '' },
  { key: 'system', label: 'Parámetros del sistema', description: 'Datos de la empresa, AFIP y certificados' },
  { key: 'labels', label: 'Etiquetas', description: '' },
  { key: 'printer', label: 'Impresora', description: '' },
  { key: 'backup', label: 'Respaldos', description: '' },
] as const

export type PermissionArea = (typeof PERMISSION_AREAS)[number]['key']

export const ACCESS_ACTION = 'access'
export const ADMIN_ROLE = 'admin'

/**
 * Qué secciones habilitan cada grupo de canales IPC (alcanza con tener una).
 * Varios grupos los usan otras pantallas además de la propia — p. ej. Nueva
 * Venta consulta la caja abierta y el Cierre de caja lee finanzas — y por eso
 * figuran con más de una sección. Los grupos que no están acá (catálogo,
 * clientes, stock, reportes, impresión…) son consultas que comparten muchas
 * pantallas: solo exigen sesión iniciada y el acceso se controla en el menú.
 */
export const CHANNEL_ACCESS: Record<string, PermissionArea[]> = {
  finance: ['finance', 'caja'],
  caja: ['caja', 'sales'],
  sales: ['sales', 'invoicing'],
  invoicing: ['invoicing', 'web_orders'],
  cambios: ['cambios'],
  'free-exchange': ['cambios'],
  pricing: ['pricing'],
  stockCount: ['stock'],
  remitoScanner: ['stock'],
  pedido: ['stock'],
  webCatalog: ['web_catalog', 'stock'],
  webCatalogServer: ['web_catalog'],
  sync: ['sync', 'web_catalog', 'web_orders'],
  labelConfig: ['labels'],
  printerConfig: ['printer'],
  backup: ['backup'],
  csr: ['system'],
}

/** ¿El rol tiene acceso a alguna de las secciones? El admin siempre. */
export function canAccess(
  roleName: string,
  permissions: Array<{ module: string; action: string }>,
  areas: readonly string[]
): boolean {
  if (roleName === ADMIN_ROLE) return true
  return permissions.some(p => p.action === ACCESS_ACTION && areas.includes(p.module))
}

/** Secciones que exige un canal IPC (vacío = alcanza con tener sesión). */
export function areasForChannel(channel: string): readonly PermissionArea[] {
  return CHANNEL_OVERRIDES[channel] ?? CHANNEL_ACCESS[channel.split(':')[0]] ?? []
}

/** Canales de auth que no requieren sesión (los usa la pantalla de login). */
export const PUBLIC_CHANNELS = new Set([
  'auth:login',
  'auth:logout',
  'auth:currentUser',
  'auth:needsSetup',
  'auth:setupFirstAdmin',
])

/**
 * Canales sueltos con un permiso propio, más específico que el de su grupo:
 * sobre todo las escrituras de grupos que se consultan desde muchas pantallas.
 */
export const CHANNEL_OVERRIDES: Record<string, PermissionArea[]> = {
  'catalog:createProduct': ['catalog', 'stock'],
  'catalog:updateProduct': ['catalog'],
  'catalog:deleteProduct': ['catalog'],
  'catalog:hardDeleteProduct': ['catalog'],
  'customers:create': ['customers'],
  'customers:update': ['customers'],
  'customers:delete': ['customers'],
  'suppliers:create': ['suppliers'],
  'suppliers:update': ['suppliers'],
  'suppliers:delete': ['suppliers'],
  'stock:addMovement': ['stock'],
  'stock:deleteMovement': ['stock'],
  'credits:use': ['sales', 'cambios'],
  'credits:adjust': ['customers'],
  'parameters:create': ['parameters'],
  'parameters:update': ['parameters'],
  'parameters:delete': ['parameters'],
  'priceUpdate:applyUpdates': ['stock', 'catalog'],
  'systemParams:save': ['system'],
  'auth:listUsers': ['users'],
  'auth:createUser': ['users'],
  'auth:updateUser': ['users'],
  'auth:deleteUser': ['users'],
  'auth:listRoles': ['users'],
  'auth:listRolesWithPermissions': ['users'],
  'auth:createRole': ['users'],
  'auth:updateRole': ['users'],
  'auth:deleteRole': ['users'],
}
