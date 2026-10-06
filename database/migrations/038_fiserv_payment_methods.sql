-- =============================================================================
-- Migration 038: Procesador de pagos FISERV (posnet propio, además del de MP)
-- =============================================================================
-- FISERV permite cobrar en 2 y 3 cuotas sin interés para el cliente. Cada
-- modalidad tiene su propio arancel (% + IVA):
--   QR (PCT)          0%
--   Débito            0%
--   Crédito 1 pago    1,8%
--   Crédito 2 cuotas  2,7%
--   Crédito 3 cuotas  2,7%
-- El cobro queda primero en una cuenta (no bancaria) de FISERV y, pasado 1 día
-- hábil, se transfiere a mano a MP-Anabella. Ventas-Stock lo registra
-- directamente en MP-Anabella con fecha de acreditación al día hábil
-- siguiente (ver FinanceService.registerSaleIncome).
--
--   1. Agrega los 5 medios 'fiserv_*' a sales.payment_method y
--      sale_payments.payment_method (se recrean, mismo patrón que 023/033).
--   2. Habilita esos medios en finance_mp_fee_rates (las tasas versionadas se
--      guardan en la misma tabla que las de Mercado Pago) y carga las iniciales.
--   3. Agrega la categoría "Comisión FISERV".

-- ── 1a. sales.payment_method ────────────────────────────────────────────────

CREATE TABLE sales_new (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id          INTEGER REFERENCES customers(id) ON DELETE RESTRICT,
  user_id              INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status               TEXT    NOT NULL DEFAULT 'PENDING_CAE',
  subtotal             REAL    NOT NULL DEFAULT 0,
  tax_amount           REAL    NOT NULL DEFAULT 0,
  total                REAL    NOT NULL DEFAULT 0,
  sale_date            TEXT    NOT NULL DEFAULT (date('now')),
  invoice_type         INTEGER,
  invoice_number       INTEGER,
  punto_venta          INTEGER,
  cae                  TEXT,
  cae_vto              TEXT,
  afip_error           TEXT,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  is_black_sale        INTEGER NOT NULL DEFAULT 0,
  discount_amount      REAL    NOT NULL DEFAULT 0,
  other_charges_amount REAL    NOT NULL DEFAULT 0,
  other_charges_label  TEXT    NOT NULL DEFAULT '',
  payment_method       TEXT    NOT NULL DEFAULT 'contado_efectivo'
    CHECK(payment_method IN (
      'contado_efectivo','transferencia','debito','credito','credito_cliente',
      'WEB_ORDER','mercadopago','qr','mixto',
      'fiserv_qr','fiserv_debito','fiserv_credito_1','fiserv_credito_2','fiserv_credito_3'
    ))
);

INSERT INTO sales_new SELECT
  id, customer_id, user_id, status, subtotal, tax_amount, total, sale_date,
  invoice_type, invoice_number, punto_venta, cae, cae_vto, afip_error,
  created_at, updated_at, is_black_sale, discount_amount,
  other_charges_amount, other_charges_label, payment_method
FROM sales;

DROP TABLE sales;
ALTER TABLE sales_new RENAME TO sales;

CREATE INDEX IF NOT EXISTS idx_sales_customer  ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_status    ON sales(status);

-- ── 1b. sale_payments.payment_method ────────────────────────────────────────

CREATE TABLE sale_payments_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id         INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  payment_method  TEXT    NOT NULL CHECK(payment_method IN (
    'contado_efectivo','transferencia','debito','credito','credito_cliente',
    'WEB_ORDER','mercadopago','qr',
    'fiserv_qr','fiserv_debito','fiserv_credito_1','fiserv_credito_2','fiserv_credito_3'
  )),
  amount          REAL    NOT NULL,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO sale_payments_new (id, sale_id, payment_method, amount, created_at)
SELECT id, sale_id, payment_method, amount, created_at FROM sale_payments;

DROP TABLE sale_payments;
ALTER TABLE sale_payments_new RENAME TO sale_payments;

CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);

-- ── 2. Tasas de comisión: habilitar los medios FISERV ───────────────────────

CREATE TABLE finance_mp_fee_rates_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_method  TEXT    NOT NULL CHECK(payment_method IN (
    'qr', 'debito', 'credito', 'mercadopago',
    'fiserv_qr', 'fiserv_debito', 'fiserv_credito_1', 'fiserv_credito_2', 'fiserv_credito_3'
  )),
  pct             REAL    NOT NULL CHECK(pct >= 0),
  iva_pct         REAL    NOT NULL DEFAULT 21 CHECK(iva_pct >= 0),
  vigente_desde   TEXT    NOT NULL,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(payment_method, vigente_desde)
);

INSERT INTO finance_mp_fee_rates_new SELECT * FROM finance_mp_fee_rates;
DROP TABLE finance_mp_fee_rates;
ALTER TABLE finance_mp_fee_rates_new RENAME TO finance_mp_fee_rates;

CREATE INDEX IF NOT EXISTS idx_finance_mp_fee_rates_method
  ON finance_mp_fee_rates(payment_method, vigente_desde);

-- vigente_desde en la fecha fundacional (mismo motivo que 023/024): no hay
-- ventas FISERV anteriores, y así una venta cargada antes de instalar esta
-- versión con fecha retroactiva igual encuentra su tasa.
INSERT INTO finance_mp_fee_rates (payment_method, pct, iva_pct, vigente_desde) VALUES
  ('fiserv_qr',        0,   21, '2026-08-01'),
  ('fiserv_debito',    0,   21, '2026-08-01'),
  ('fiserv_credito_1', 1.8, 21, '2026-08-01'),
  ('fiserv_credito_2', 2.7, 21, '2026-08-01'),
  ('fiserv_credito_3', 2.7, 21, '2026-08-01');

-- ── 3. Categoría de egreso para la comisión ─────────────────────────────────

INSERT INTO finance_categories (name, applies_to) VALUES ('Comisión FISERV', 'egreso');
