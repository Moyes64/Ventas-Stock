-- =============================================================================
-- Migration 001: Initial Schema
-- =============================================================================

-- Roles de usuario
CREATE TABLE IF NOT EXISTS roles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  description TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Permisos por rol
CREATE TABLE IF NOT EXISTS permissions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id    INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module     TEXT    NOT NULL,  -- 'sales', 'catalog', 'stock', etc.
  action     TEXT    NOT NULL,  -- 'read', 'write', 'delete', 'admin'
  UNIQUE(role_id, module, action)
);

-- Usuarios del sistema
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  role_id       INTEGER NOT NULL REFERENCES roles(id),
  active        INTEGER NOT NULL DEFAULT 1,  -- 0 = inactivo, 1 = activo
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Tasas de IVA (alícuotas AFIP)
CREATE TABLE IF NOT EXISTS tax_rates (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT    NOT NULL,        -- 'Exento', 'IVA 10.5%', 'IVA 21%'
  percentage REAL   NOT NULL,        -- 0, 10.5, 21
  afip_code INTEGER NOT NULL UNIQUE  -- Código AFIP: 3=0%, 4=10.5%, 5=21%
);

-- Categorías de productos
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,
  description TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Productos / Catálogo
CREATE TABLE IF NOT EXISTS products (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  sku            TEXT    NOT NULL UNIQUE,
  barcode        TEXT    UNIQUE,
  name           TEXT    NOT NULL,
  description    TEXT    NOT NULL DEFAULT '',
  category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  price          REAL    NOT NULL DEFAULT 0,   -- Precio de venta (con IVA)
  cost           REAL    NOT NULL DEFAULT 0,   -- Costo (sin IVA)
  tax_rate_id    INTEGER NOT NULL REFERENCES tax_rates(id),
  active         INTEGER NOT NULL DEFAULT 1,
  stock_quantity REAL    NOT NULL DEFAULT 0,
  stock_min      REAL    NOT NULL DEFAULT 0,   -- Alerta de stock mínimo
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Clientes
CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,              -- Razón social o nombre
  cuit_dni      TEXT    NOT NULL DEFAULT '',   -- CUIT, DNI, CUIL, etc.
  doc_type      TEXT    NOT NULL DEFAULT 'DNI', -- 'CUIT', 'DNI', 'CUIL', 'PASAPORTE', 'SIN_IDENTIFICAR'
  condicion_iva TEXT    NOT NULL DEFAULT 'CONSUMIDOR_FINAL', -- 'RESPONSABLE_INSCRIPTO', 'MONOTRIBUTISTA', 'EXENTO', 'CONSUMIDOR_FINAL'
  address       TEXT    NOT NULL DEFAULT '',
  email         TEXT    NOT NULL DEFAULT '',
  phone         TEXT    NOT NULL DEFAULT '',
  notes         TEXT    NOT NULL DEFAULT '',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Proveedores
CREATE TABLE IF NOT EXISTS suppliers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  cuit       TEXT    NOT NULL DEFAULT '',
  address    TEXT    NOT NULL DEFAULT '',
  email      TEXT    NOT NULL DEFAULT '',
  phone      TEXT    NOT NULL DEFAULT '',
  contact    TEXT    NOT NULL DEFAULT '',  -- Nombre de contacto
  notes      TEXT    NOT NULL DEFAULT '',
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Movimientos de stock
CREATE TABLE IF NOT EXISTS stock_movements (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id     INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  type           TEXT    NOT NULL,  -- 'ENTRY', 'EXIT', 'ADJUSTMENT', 'SALE', 'PURCHASE_RETURN'
  quantity       REAL    NOT NULL,  -- Positivo = entrada, Negativo = salida
  reference_type TEXT,              -- 'SALE', 'PURCHASE', 'MANUAL', etc.
  reference_id   INTEGER,           -- ID de la venta o compra relacionada
  notes          TEXT    NOT NULL DEFAULT '',
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Ventas (cabecera)
CREATE TABLE IF NOT EXISTS sales (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id    INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status         TEXT    NOT NULL DEFAULT 'PENDING_CAE',
  -- Estados: PENDING_CAE | AUTHORIZED | REJECTED | INTERNAL_RECEIPT
  subtotal       REAL    NOT NULL DEFAULT 0,  -- Sin IVA
  tax_amount     REAL    NOT NULL DEFAULT 0,  -- Total IVA
  total          REAL    NOT NULL DEFAULT 0,  -- Con IVA
  sale_date      TEXT    NOT NULL DEFAULT (date('now')),
  -- Datos de facturación AFIP
  invoice_type   INTEGER,                     -- Tipo comprobante: 11 = FC, 1 = FA, 6 = FB
  invoice_number INTEGER,                     -- Número de comprobante
  punto_venta    INTEGER,                     -- Punto de venta
  cae            TEXT,                        -- CAE otorgado por AFIP
  cae_vto        TEXT,                        -- Vencimiento del CAE (AAAAMMDD)
  afip_error     TEXT,                        -- Mensaje de error AFIP si fue rechazado
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Ítems de venta
CREATE TABLE IF NOT EXISTS sale_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id     INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity    REAL    NOT NULL,
  unit_price  REAL    NOT NULL,   -- Precio unitario con IVA al momento de la venta
  tax_rate    REAL    NOT NULL,   -- % IVA al momento de la venta
  subtotal    REAL    NOT NULL    -- quantity * unit_price
);

-- Control de migraciones
CREATE TABLE IF NOT EXISTS schema_migrations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  filename   TEXT    NOT NULL UNIQUE,
  applied_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_products_barcode    ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku        ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_active     ON products(active);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_status        ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date     ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id  ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_customers_cuit_dni  ON customers(cuit_dni);
