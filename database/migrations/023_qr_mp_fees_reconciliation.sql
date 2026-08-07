-- =============================================================================
-- Migration 023: Medio de pago "QR", comisiones de Mercado Pago y conciliación
-- =============================================================================
-- El posnet de Mercado Pago cobra una comisión (% + IVA) tanto para pagos con
-- QR como con tarjeta de Débito/Crédito -- a diferencia de Transferencia, que
-- se acredita sin descuento. Esta migración:
--   1. Agrega 'qr' como medio de pago válido (hoy esas ventas se cargaban como
--      'transferencia' por no tener una opción propia).
--   2. Crea finance_mp_fee_rates: tasas de comisión versionadas por fecha de
--      vigencia (una venta siempre usa la tasa vigente el día de la venta).
--   3. Crea finance_mp_reconciliations: conciliación diaria por medio de pago
--      entre lo que Ventas-Stock calculó automáticamente y el resumen real del
--      posnet de Mercado Pago.
--   4. Agrega las categorías "Comisión Mercado Pago" y "Ajuste Conciliación MP".

-- ── 1. Ampliar el CHECK de sales.payment_method con 'qr' ────────────────────
-- SQLite no soporta ALTER COLUMN; se recrea la tabla (mismo patrón que 014).

CREATE TABLE sales_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id     INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status          TEXT    NOT NULL DEFAULT 'PENDING_CAE',
  subtotal        REAL    NOT NULL DEFAULT 0,
  tax_amount      REAL    NOT NULL DEFAULT 0,
  total           REAL    NOT NULL DEFAULT 0,
  sale_date       TEXT    NOT NULL DEFAULT (date('now')),
  invoice_type    INTEGER,
  invoice_number  INTEGER,
  punto_venta     INTEGER,
  cae             TEXT,
  cae_vto         TEXT,
  afip_error      TEXT,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  is_black_sale   INTEGER NOT NULL DEFAULT 0,
  discount_amount REAL    NOT NULL DEFAULT 0,
  payment_method  TEXT    NOT NULL DEFAULT 'contado_efectivo'
    CHECK(payment_method IN (
      'contado_efectivo','transferencia','debito','credito','credito_cliente',
      'WEB_ORDER','mercadopago','qr'
    ))
);

INSERT INTO sales_new SELECT
  id, customer_id, user_id, status, subtotal, tax_amount, total, sale_date,
  invoice_type, invoice_number, punto_venta, cae, cae_vto, afip_error,
  created_at, updated_at, is_black_sale, discount_amount, payment_method
FROM sales;

DROP TABLE sales;
ALTER TABLE sales_new RENAME TO sales;

CREATE INDEX IF NOT EXISTS idx_sales_customer  ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_status    ON sales(status);

-- ── 2. Tasas de comisión de Mercado Pago (versionadas) ──────────────────────

CREATE TABLE IF NOT EXISTS finance_mp_fee_rates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_method  TEXT    NOT NULL CHECK(payment_method IN ('qr', 'debito', 'credito')),
  pct             REAL    NOT NULL CHECK(pct >= 0),
  iva_pct         REAL    NOT NULL DEFAULT 21 CHECK(iva_pct >= 0),
  vigente_desde   TEXT    NOT NULL,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(payment_method, vigente_desde)
);

CREATE INDEX IF NOT EXISTS idx_finance_mp_fee_rates_method
  ON finance_mp_fee_rates(payment_method, vigente_desde);

-- Tasa inicial conocida para QR (0.8% + IVA). Débito y Crédito quedan sin
-- configurar a propósito -- hasta que se cargue una tasa, esas ventas no
-- generan movimiento de comisión (mejor no descontar nada que asumir un %
-- incorrecto). Se cargan desde Finanzas > Comisiones MP.
--
-- vigente_desde usa una fecha fija (no date('now')) a propósito: esta
-- migración puede aplicarse recién cuando se instale una versión futura del
-- programa, y una tasa fechada "hoy" (el día de la instalación) dejaría sin
-- comisión calculada a las ventas QR ya realizadas antes de esa instalación.
-- 2026-08-01 es la fecha fundacional de la contabilidad de Finanzas.
INSERT INTO finance_mp_fee_rates (payment_method, pct, iva_pct, vigente_desde) VALUES
  ('qr', 0.80, 21, '2026-08-01');

-- ── 3. Conciliación diaria contra el resumen del posnet de MP ───────────────

CREATE TABLE IF NOT EXISTS finance_mp_reconciliations (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha               TEXT    NOT NULL,
  payment_method      TEXT    NOT NULL CHECK(payment_method IN ('qr', 'debito', 'credito')),
  bruto_sistema       REAL    NOT NULL,
  comision_sistema    REAL    NOT NULL,
  bruto_real          REAL    NOT NULL,
  comision_real       REAL    NOT NULL,
  neto_real           REAL    NOT NULL,
  diferencia          REAL    NOT NULL,
  status              TEXT    NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'adjusted', 'ignored')),
  ajuste_movement_id  INTEGER REFERENCES finance_movements(id),
  created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(fecha, payment_method)
);

CREATE INDEX IF NOT EXISTS idx_finance_mp_reconciliations_fecha
  ON finance_mp_reconciliations(fecha);

-- ── 4. Categorías nuevas ─────────────────────────────────────────────────────

INSERT INTO finance_categories (name, applies_to) VALUES
  ('Comisión Mercado Pago', 'egreso'),
  ('Ajuste Conciliación MP', 'ambos');
