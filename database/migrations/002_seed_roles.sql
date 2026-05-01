-- =============================================================================
-- Migration 002: Seed default roles and permissions
-- =============================================================================

-- Roles por defecto
INSERT OR IGNORE INTO roles (name, description) VALUES
  ('admin',    'Administrador del sistema, acceso total'),
  ('vendedor', 'Vendedor, puede crear ventas y consultar catálogo'),
  ('deposito', 'Depósito, gestión de stock y proveedores');

-- Permisos para admin (acceso total a todos los módulos)
INSERT OR IGNORE INTO permissions (role_id, module, action)
SELECT r.id, m.module, a.action
FROM roles r
CROSS JOIN (
  VALUES ('sales'), ('catalog'), ('customers'), ('suppliers'),
         ('stock'), ('invoicing'), ('reporting'), ('backup'), ('users')
) AS m(module)
CROSS JOIN (
  VALUES ('read'), ('write'), ('delete'), ('admin')
) AS a(action)
WHERE r.name = 'admin';

-- Permisos para vendedor
INSERT OR IGNORE INTO permissions (role_id, module, action)
SELECT r.id, m.module, a.action
FROM roles r
CROSS JOIN (VALUES
  ('sales',     'read'),
  ('sales',     'write'),
  ('catalog',   'read'),
  ('customers', 'read'),
  ('customers', 'write'),
  ('stock',     'read'),
  ('invoicing', 'read'),
  ('reporting', 'read')
) AS m(module, action)
WHERE r.name = 'vendedor';

-- Permisos para depósito
INSERT OR IGNORE INTO permissions (role_id, module, action)
SELECT r.id, m.module, a.action
FROM roles r
CROSS JOIN (VALUES
  ('catalog',   'read'),
  ('catalog',   'write'),
  ('suppliers', 'read'),
  ('suppliers', 'write'),
  ('stock',     'read'),
  ('stock',     'write')
) AS m(module, action)
WHERE r.name = 'deposito';

-- Tasas de IVA estándar Argentina
INSERT OR IGNORE INTO tax_rates (name, percentage, afip_code) VALUES
  ('Exento / No Gravado', 0,    3),
  ('IVA 10.5%',           10.5, 4),
  ('IVA 21%',             21,   5),
  ('IVA 27%',             27,   6);
