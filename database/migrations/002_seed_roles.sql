-- =============================================================================
-- Migration 002: Seed default roles and permissions
-- SQLite-compatible version (no CROSS JOIN (VALUES ...) AS alias syntax)
-- =============================================================================

-- Roles por defecto
INSERT OR IGNORE INTO roles (name, description) VALUES
  ('admin',    'Administrador del sistema, acceso total'),
  ('vendedor', 'Vendedor, puede crear ventas y consultar catálogo'),
  ('deposito', 'Depósito, gestión de stock y proveedores');

-- Permisos para admin (acceso total: 9 módulos × 4 acciones = 36 filas)
INSERT OR IGNORE INTO permissions (role_id, module, action)
SELECT r.id, m.module, m.action
FROM roles r
JOIN (
  SELECT 'sales'      AS module, 'read'   AS action UNION ALL
  SELECT 'sales',      'write'                       UNION ALL
  SELECT 'sales',      'delete'                      UNION ALL
  SELECT 'sales',      'admin'                       UNION ALL
  SELECT 'catalog',    'read'                        UNION ALL
  SELECT 'catalog',    'write'                       UNION ALL
  SELECT 'catalog',    'delete'                      UNION ALL
  SELECT 'catalog',    'admin'                       UNION ALL
  SELECT 'customers',  'read'                        UNION ALL
  SELECT 'customers',  'write'                       UNION ALL
  SELECT 'customers',  'delete'                      UNION ALL
  SELECT 'customers',  'admin'                       UNION ALL
  SELECT 'suppliers',  'read'                        UNION ALL
  SELECT 'suppliers',  'write'                       UNION ALL
  SELECT 'suppliers',  'delete'                      UNION ALL
  SELECT 'suppliers',  'admin'                       UNION ALL
  SELECT 'stock',      'read'                        UNION ALL
  SELECT 'stock',      'write'                       UNION ALL
  SELECT 'stock',      'delete'                      UNION ALL
  SELECT 'stock',      'admin'                       UNION ALL
  SELECT 'invoicing',  'read'                        UNION ALL
  SELECT 'invoicing',  'write'                       UNION ALL
  SELECT 'invoicing',  'delete'                      UNION ALL
  SELECT 'invoicing',  'admin'                       UNION ALL
  SELECT 'reporting',  'read'                        UNION ALL
  SELECT 'reporting',  'write'                       UNION ALL
  SELECT 'reporting',  'delete'                      UNION ALL
  SELECT 'reporting',  'admin'                       UNION ALL
  SELECT 'backup',     'read'                        UNION ALL
  SELECT 'backup',     'write'                       UNION ALL
  SELECT 'backup',     'delete'                      UNION ALL
  SELECT 'backup',     'admin'                       UNION ALL
  SELECT 'users',      'read'                        UNION ALL
  SELECT 'users',      'write'                       UNION ALL
  SELECT 'users',      'delete'                      UNION ALL
  SELECT 'users',      'admin'
) AS m
WHERE r.name = 'admin';

-- Permisos para vendedor
INSERT OR IGNORE INTO permissions (role_id, module, action)
SELECT r.id, m.module, m.action
FROM roles r
JOIN (
  SELECT 'sales'      AS module, 'read'  AS action UNION ALL
  SELECT 'sales',      'write'                      UNION ALL
  SELECT 'catalog',    'read'                       UNION ALL
  SELECT 'customers',  'read'                       UNION ALL
  SELECT 'customers',  'write'                      UNION ALL
  SELECT 'stock',      'read'                       UNION ALL
  SELECT 'invoicing',  'read'                       UNION ALL
  SELECT 'reporting',  'read'
) AS m
WHERE r.name = 'vendedor';

-- Permisos para depósito
INSERT OR IGNORE INTO permissions (role_id, module, action)
SELECT r.id, m.module, m.action
FROM roles r
JOIN (
  SELECT 'catalog'   AS module, 'read'  AS action UNION ALL
  SELECT 'catalog',   'write'                      UNION ALL
  SELECT 'suppliers', 'read'                       UNION ALL
  SELECT 'suppliers', 'write'                      UNION ALL
  SELECT 'stock',     'read'                       UNION ALL
  SELECT 'stock',     'write'
) AS m
WHERE r.name = 'deposito';

-- Tasas de IVA estándar Argentina
INSERT OR IGNORE INTO tax_rates (name, percentage, afip_code) VALUES
  ('Exento / No Gravado', 0,    3),
  ('IVA 10.5%',           10.5, 4),
  ('IVA 21%',             21,   5),
  ('IVA 27%',             27,   6);
