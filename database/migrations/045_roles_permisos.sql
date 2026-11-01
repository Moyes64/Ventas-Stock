-- =============================================================================
-- Migration 045: Roles y permisos por sección
-- Los permisos de la 002 (módulo × read/write/delete/admin) nunca se aplicaron
-- y no cubrían Caja, Finanzas, Web, etc. Pasan a ser uno por sección del menú
-- (action = 'access'); la lista de secciones vive en
-- electron/modules/auth/permissions.ts. El rol admin tiene acceso total por
-- código y no necesita filas.
-- =============================================================================

DELETE FROM permissions;

INSERT OR IGNORE INTO roles (name, description) VALUES
  ('mostrador', 'Atención al público: ventas, facturación, caja, cambios y clientes'),
  ('compras',   'Consulta y compras: catálogo, stock, remitos, proveedores, reportes y catálogo web');

-- vendedor y deposito quedan reemplazados; se borran solo si nadie los usa.
DELETE FROM roles
WHERE name IN ('vendedor', 'deposito')
  AND id NOT IN (SELECT role_id FROM users);

INSERT OR IGNORE INTO permissions (role_id, module, action)
SELECT r.id, m.module, 'access'
FROM roles r
JOIN (
  SELECT 'caja' AS module UNION ALL
  SELECT 'sales'          UNION ALL
  SELECT 'invoicing'      UNION ALL
  SELECT 'cambios'        UNION ALL
  SELECT 'customers'      UNION ALL
  SELECT 'web_orders'
) AS m
WHERE r.name = 'mostrador';

INSERT OR IGNORE INTO permissions (role_id, module, action)
SELECT r.id, m.module, 'access'
FROM roles r
JOIN (
  SELECT 'catalog' AS module UNION ALL
  SELECT 'stock'             UNION ALL
  SELECT 'suppliers'         UNION ALL
  SELECT 'reporting'         UNION ALL
  SELECT 'web_catalog'
) AS m
WHERE r.name = 'compras';
