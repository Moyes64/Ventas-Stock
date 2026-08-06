-- =============================================================================
-- Migration 016: Finanzas (ingresos/egresos multi-cuenta y patrimonio de socios)
-- =============================================================================

-- Socios de la sociedad y su porcentaje de participación
CREATE TABLE IF NOT EXISTS finance_partners (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT    NOT NULL,
  ownership_pct  REAL    NOT NULL,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO finance_partners (name, ownership_pct) VALUES
  ('Ariel', 50),
  ('Gustavo', 25),
  ('Anabella', 25);

-- Cuentas monetarias reales de la sociedad
CREATE TABLE IF NOT EXISTS finance_accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  type        TEXT    NOT NULL CHECK(type IN ('efectivo', 'mercadopago', 'banco')),
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO finance_accounts (name, type) VALUES
  ('Caja', 'efectivo'),
  ('Mercado Pago - Ariel', 'mercadopago'),
  ('Mercado Pago - Anabella', 'mercadopago');

-- Categorías predefinidas de ingreso/egreso
CREATE TABLE IF NOT EXISTS finance_categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  applies_to  TEXT    NOT NULL CHECK(applies_to IN ('ingreso', 'egreso', 'ambos')),
  active      INTEGER NOT NULL DEFAULT 1
);

INSERT INTO finance_categories (name, applies_to) VALUES
  ('Venta', 'ingreso'),
  ('Aporte de Socio', 'ingreso'),
  ('Otro Ingreso', 'ingreso'),
  ('Pago a Proveedores', 'egreso'),
  ('Alquiler', 'egreso'),
  ('Servicios', 'egreso'),
  ('Sueldos', 'egreso'),
  ('Monotributo', 'egreso'),
  ('Impuestos', 'egreso'),
  ('Mantenimiento', 'egreso'),
  ('Retiro de Socio', 'egreso'),
  ('Otros', 'egreso');

-- Movimientos de ingreso/egreso por cuenta
CREATE TABLE IF NOT EXISTS finance_movements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id    INTEGER NOT NULL REFERENCES finance_accounts(id),
  tipo          TEXT    NOT NULL CHECK(tipo IN ('ingreso', 'egreso')),
  categoria_id  INTEGER REFERENCES finance_categories(id),
  monto         REAL    NOT NULL CHECK(monto > 0),
  descripcion   TEXT    NOT NULL,
  fecha         TEXT    NOT NULL DEFAULT (date('now')),
  partner_id    INTEGER REFERENCES finance_partners(id),
  supplier_id   INTEGER REFERENCES suppliers(id),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_finance_movements_account   ON finance_movements(account_id);
CREATE INDEX IF NOT EXISTS idx_finance_movements_fecha      ON finance_movements(fecha);
CREATE INDEX IF NOT EXISTS idx_finance_movements_categoria  ON finance_movements(categoria_id);
