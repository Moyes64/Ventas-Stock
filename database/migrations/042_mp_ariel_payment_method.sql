-- =============================================================================
-- Migration 042: Medio de pago "Mercado Libre (MP Ariel)"
-- =============================================================================
-- Las ventas de las cajas de escape propias por Mercado Libre se cobran en la
-- cuenta MP de Ariel. Hasta ahora se cargaban solo como ingreso en Finanzas
-- (sin venta), así que no aparecían en los reportes de ventas ni descontaban
-- stock. Con el medio 'mp_ariel' se cargan como Venta N y el ingreso queda
-- pendiente en "Mercado Pago - Ariel" hasta la fecha de acreditación que
-- indica MP (ver FinanceService.registerSaleIncome).
--
-- Agrega 'mp_ariel' a sales.payment_method y sale_payments.payment_method
-- (se recrean, mismo patrón que 023/033/038).

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
      'fiserv_qr','fiserv_debito','fiserv_credito_1','fiserv_credito_2','fiserv_credito_3',
      'mp_ariel'
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
    'fiserv_qr','fiserv_debito','fiserv_credito_1','fiserv_credito_2','fiserv_credito_3',
    'mp_ariel'
  )),
  amount          REAL    NOT NULL,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO sale_payments_new (id, sale_id, payment_method, amount, created_at)
SELECT id, sale_id, payment_method, amount, created_at FROM sale_payments;

DROP TABLE sale_payments;
ALTER TABLE sale_payments_new RENAME TO sale_payments;

CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);
